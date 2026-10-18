import { expect, test } from "@playwright/test";
import { tools } from "../src/tools/registry";

const origin = "https://tools.salesforceway.com";

async function sitemapUrls(request: import("@playwright/test").APIRequestContext) {
  const xml = await (await request.get("/sitemap.xml")).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

test("the sitemap lists the hub and every tool page, and no sandbox page", async ({ request }) => {
  const urls = await sitemapUrls(request);
  expect(urls).toContain(`${origin}/`);
  for (const tool of tools) expect(urls).toContain(`${origin}/${tool.slug}/`);
  expect(urls.every((url) => url.startsWith(`${origin}/`))).toBe(true);
  expect(urls.filter((url) => url.includes("/sandbox/"))).toEqual([]);
});

test("robots.txt disallows the sandbox and names the sitemap", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.ok()).toBe(true);
  const robots = await res.text();
  expect(robots).toMatch(/^Disallow: \/sandbox\/$/m);
  expect(robots).not.toMatch(/^Disallow: \/$/m);
  expect(robots).toMatch(new RegExp(`^Sitemap: ${origin}/sitemap.xml$`, "m"));
});

test("every page in the sitemap has its own title, description, canonical URL and social tags", async ({
  page,
  request,
}) => {
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const url of await sitemapUrls(request)) {
    const path = new URL(url).pathname;
    await page.goto(path);
    const head = page.locator("head");
    const title = await page.title();
    const description = await head.locator('meta[name="description"]').getAttribute("content");
    expect(title, path).not.toBe("");
    expect(description, path).toBeTruthy();
    titles.add(title);
    descriptions.add(description!);

    await expect(head.locator('link[rel="canonical"]'), path).toHaveAttribute("href", url);
    await expect(head.locator('meta[property="og:url"]'), path).toHaveAttribute("content", url);
    await expect(head.locator('meta[property="og:title"]'), path).toHaveAttribute("content", title);
    await expect(head.locator('meta[property="og:description"]'), path).toHaveAttribute(
      "content",
      description!,
    );
    await expect(head.locator('meta[name="twitter:card"]'), path).toHaveAttribute(
      "content",
      "summary",
    );
  }
  expect(titles.size).toBe((await sitemapUrls(request)).length);
  expect(descriptions.size).toBe(titles.size);
});

test("each tool's host page carries SoftwareApplication JSON-LD and its sandbox carries none", async ({
  page,
}) => {
  for (const tool of tools) {
    await page.goto(`/${tool.slug}/`);
    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((els) => els.map((el) => JSON.parse(el.textContent ?? "")));
    expect(blocks).toContainEqual(
      expect.objectContaining({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: tool.name,
        url: `${origin}/${tool.slug}/`,
        isAccessibleForFree: true,
        offers: expect.objectContaining({ price: "0" }),
      }),
    );

    const frame = page.frame({ url: new RegExp(`/sandbox/${tool.slug}/$`) });
    if (!frame) throw new Error(`sandbox frame for ${tool.slug} not found`);
    await frame.waitForLoadState();
    await expect(frame.locator('script[type="application/ld+json"]')).toHaveCount(0);
    await expect(frame.locator('meta[property^="og:"]')).toHaveCount(0);
  }
});

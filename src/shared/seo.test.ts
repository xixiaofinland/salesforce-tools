import { describe, expect, it } from "vitest";
import { jsonLdScript, renderRobots, renderSitemap, toolJsonLd } from "./seo";

const site = "https://tools.salesforceway.com";

describe("renderSitemap", () => {
  it("lists built pages under the site origin and leaves out sandbox pages", () => {
    expect(renderSitemap(site, ["", "csv-precheck/", "sandbox/csv-precheck/"])).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        "  <url><loc>https://tools.salesforceway.com/</loc></url>",
        "  <url><loc>https://tools.salesforceway.com/csv-precheck/</loc></url>",
        "</urlset>",
        "",
      ].join("\n"),
    );
  });

  it("accepts pathnames with or without a leading slash", () => {
    expect(renderSitemap(site, ["/articles/a/", "/sandbox/x/"])).toContain(
      "<loc>https://tools.salesforceway.com/articles/a/</loc>",
    );
    expect(renderSitemap(site, ["/sandbox/x/"])).not.toContain("sandbox");
  });
});

describe("renderRobots", () => {
  it("allows everything but the sandbox and names the sitemap", () => {
    expect(renderRobots(site)).toBe(
      [
        "User-agent: *",
        "Disallow: /sandbox/",
        "",
        "Sitemap: https://tools.salesforceway.com/sitemap.xml",
        "",
      ].join("\n"),
    );
  });
});

describe("toolJsonLd", () => {
  it("describes a tool as a free, browser-based SoftwareApplication", () => {
    expect(
      toolJsonLd(
        {
          slug: "csv-precheck",
          name: "Data Loader CSV Pre-check",
          description: "Check a CSV.",
          applicationCategory: "DeveloperApplication",
        },
        site,
      ),
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Data Loader CSV Pre-check",
      description: "Check a CSV.",
      url: "https://tools.salesforceway.com/csv-precheck/",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires a web browser with JavaScript.",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    });
  });
});

describe("jsonLdScript", () => {
  it("escapes < so a value cannot close the script element", () => {
    expect(jsonLdScript({ name: "</script><b>" })).toBe('{"name":"\\u003c/script>\\u003cb>"}');
  });
});

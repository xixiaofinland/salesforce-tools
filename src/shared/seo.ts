import type { Tool } from "../tools/registry";
import { SANDBOX_PATH_PREFIX } from "./sandbox/csp";

// Astro reports built pages without a leading slash ("csv-precheck/").
const rooted = (pathname: string) => pathname.replace(/^\/?/, "/");

const absolute = (site: string, pathname: string) => new URL(rooted(pathname), site).href;

// Sandbox pages are only meant to be seen inside their host page's iframe.
const isSandbox = (pathname: string) => rooted(pathname).startsWith(SANDBOX_PATH_PREFIX);

// `pathnames` are the built pages, as Astro's build:done hook reports them.
export function renderSitemap(site: string, pathnames: string[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...pathnames
      .filter((p) => !isSandbox(p))
      .map((p) => `  <url><loc>${absolute(site, p)}</loc></url>`),
    "</urlset>",
    "",
  ].join("\n");
}

export function renderRobots(site: string): string {
  return [
    "User-agent: *",
    `Disallow: ${SANDBOX_PATH_PREFIX}`,
    "",
    `Sitemap: ${absolute(site, "sitemap.xml")}`,
    "",
  ].join("\n");
}

// For the tool's host page only: sandbox pages carry nothing but the tool.
export function toolJsonLd(tool: Tool, site: string) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: tool.name,
    description: tool.description,
    url: absolute(site, `${tool.slug}/`),
    applicationCategory: tool.applicationCategory,
    operatingSystem: "Any",
    browserRequirements: "Requires a web browser with JavaScript.",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };
}

// Body of an inline <script type="application/ld+json">; "<" escaped so no value ends the element.
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

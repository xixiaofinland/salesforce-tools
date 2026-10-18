import { writeFile } from "node:fs/promises";
import { defineConfig } from "astro/config";
import { renderHeaders } from "./src/shared/sandbox/headers";
import { renderRobots, renderSitemap } from "./src/shared/seo";

const site = "https://tools.salesforceway.com";

export default defineConfig({
  site,
  // Its inline scripts would break under the sandbox CSP.
  devToolbar: { enabled: false },
  trailingSlash: "always",
  build: {
    // The sandbox CSP allows only 'self' scripts and styles, so nothing may be inlined.
    inlineStylesheets: "never",
  },
  vite: {
    build: { assetsInlineLimit: 0 },
    // Dev server: sandbox iframes fetch modules from an opaque origin.
    server: { cors: true },
  },
  integrations: [
    {
      name: "cloudflare-headers",
      hooks: {
        "astro:build:done": async ({ dir }) => {
          await writeFile(new URL("_headers", dir), renderHeaders());
        },
      },
    },
    {
      name: "seo-files",
      hooks: {
        // Built from the pages actually generated, so new pages (articles too) join the sitemap.
        "astro:build:done": async ({ dir, pages }) => {
          const pathnames = pages.map((p) => p.pathname).sort();
          await writeFile(new URL("sitemap.xml", dir), renderSitemap(site, pathnames));
          await writeFile(new URL("robots.txt", dir), renderRobots(site));
        },
      },
    },
  ],
});

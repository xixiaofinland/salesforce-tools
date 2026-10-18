import { writeFile } from "node:fs/promises";
import { defineConfig } from "astro/config";
import { renderHeaders } from "./src/shared/sandbox/headers";

export default defineConfig({
  site: "https://tools.salesforceway.com",
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
  ],
});

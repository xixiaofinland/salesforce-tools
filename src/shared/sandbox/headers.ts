import { SANDBOX_CSP_HEADER, SANDBOX_PATH_PREFIX } from "./csp";

// Cloudflare Pages `_headers` file, written into the build output.
export function renderHeaders(): string {
  return [
    `${SANDBOX_PATH_PREFIX}*`,
    `  Content-Security-Policy: ${SANDBOX_CSP_HEADER}`,
    "  X-Robots-Tag: noindex",
    // Sandbox pages run in an opaque origin, so their module scripts load as CORS requests.
    "/_astro/*",
    "  Access-Control-Allow-Origin: *",
    "",
  ].join("\n");
}

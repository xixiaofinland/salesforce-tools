// The trust claim ("your file never leaves this computer") rests on this policy: sandbox pages
// may run only the site's own scripts and may open no network connection at all.
//
// CSP cannot stop the page navigating itself or a download link pointing off-site, so sandbox code
// must never set `location`, link to another origin, or send file data with `postMessage` (ad
// scripts on the hosting page can listen). Since only our own scripts run here, those are rules
// for us, not gaps a third party can use.
export const SANDBOX_PATH_PREFIX = "/sandbox/";

const directives = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'none'",
  "img-src 'none'",
  "font-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "worker-src 'none'",
  "child-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
];

// Sent in the <meta> fallback too, which ignores frame-ancestors.
export const SANDBOX_CSP = directives.join("; ");

export const SANDBOX_CSP_HEADER = [...directives, "frame-ancestors 'self'"].join("; ");

// The iframe has no allow-same-origin, so it runs in an opaque origin and the hosting page's
// scripts (ads included) cannot reach into it.
export const SANDBOX_IFRAME_FLAGS = "allow-scripts allow-downloads";

# salesforce-tools

Free browser tools for Salesforce admins and developers at tools.salesforceway.com: an Astro static site on Cloudflare Pages, no backend, no stored user data. Run `npm run format:check`, `npm run check` and `npm test` (Vitest, logic in `src/tools/<tool>/`) before opening a PR; `npm run test:e2e` runs Playwright against `dist/` served with its `_headers` (Chromium and Firefox locally, WebKit too in CI).

## The trust claim

Every tool promises "your file never leaves this computer", and the code must keep that true:

- File handling lives only in sandbox pages, `src/pages/sandbox/<tool>.astro` on `SandboxLayout`, shown through `SandboxFrame` on the tool's host page. The host page carries text, ads and analytics and never touches a file.
- Sandbox pages run only the site's own bundled code: add libraries as npm dependencies so they bundle into `/_astro/`, and keep scripts and styles in Astro `<script>`/`<style>` blocks or imported files. The CSP (`src/shared/sandbox/csp.ts`) blocks inline code, every network request and every third-party origin.
- Results stay inside the sandbox: show them on the page or hand them to the user as a blob download. Sandbox code keeps `location` unchanged, links only to the same page, and sends nothing via `postMessage`, since CSP cannot stop those and ad scripts on the host page can listen.
- A new tool adds its entry in `src/tools/registry.ts`, a host page, a sandbox page, and its sandbox to the e2e suite's network test.
- User-facing copy says "open" a file, never "upload".

## Pace

This is a small site and a small bug is cheap. Decide rather than ask, and make the tests strong enough to stand in for review: when they pass, merge your own PR into `dev`. Ask the maintainer only for what needs their hands (the Cloudflare, Porkbun or AdSense dashboards, a secret) or what can't be undone.

## Branches

- `dev` is the integration branch. Every PR targets `dev` (`gh pr create --base dev`) and is squash-merged; the PR title must be a conventional commit (`feat: ...`, `fix: ...`), since it becomes the commit on `dev`.
- `main` is production: Cloudflare deploys it to tools.salesforceway.com. It only moves by fast-forwarding to `dev` (`git push origin origin/dev:main`) once the maintainer has tried `dev`'s preview by hand. Hotfixes go through `dev` too, or the fast-forward breaks.

## Issues

GitHub Issues on xixiaofinland/salesforce-tools, via `gh`. Labels: `needs-triage` (maintainer evaluates), `needs-info` (waiting on the reporter), `ready-for-agent` (fully specified, an AFK agent can take it), `ready-for-human` (needs a person). issue-loop (`.issue-loop.conf`) takes `ready-for-agent` issues.

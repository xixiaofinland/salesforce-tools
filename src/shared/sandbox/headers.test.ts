import { describe, expect, it } from "vitest";
import { SANDBOX_CSP_HEADER } from "./csp";
import { renderHeaders } from "./headers";

describe("renderHeaders", () => {
  it("applies the sandbox CSP to every sandbox page", () => {
    expect(renderHeaders()).toContain(
      `/sandbox/*\n  Content-Security-Policy: ${SANDBOX_CSP_HEADER}`,
    );
  });

  it("blocks all network connections from sandbox pages", () => {
    expect(SANDBOX_CSP_HEADER).toContain("connect-src 'none'");
    expect(SANDBOX_CSP_HEADER).toContain("default-src 'none'");
    expect(SANDBOX_CSP_HEADER).not.toMatch(/https?:/);
  });
});

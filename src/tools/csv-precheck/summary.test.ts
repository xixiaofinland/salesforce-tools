import { describe, expect, it } from "vitest";
import { renderReport, summarize } from "./summary";

describe("summarize", () => {
  it("counts lines with or without a trailing newline", () => {
    expect(summarize("a,b\n1,2\n").lines).toBe(2);
    expect(summarize("a,b\r\n1,2").lines).toBe(2);
  });

  it("treats an empty file as zero lines", () => {
    expect(summarize("")).toEqual({ lines: 0, bytes: 0 });
  });

  it("counts bytes as UTF-8", () => {
    expect(summarize("ä").bytes).toBe(2);
  });
});

describe("renderReport", () => {
  it("names the file and its counts", () => {
    expect(renderReport("x.csv", { lines: 2, bytes: 8 })).toBe("File: x.csv\nLines: 2\nBytes: 8\n");
  });
});

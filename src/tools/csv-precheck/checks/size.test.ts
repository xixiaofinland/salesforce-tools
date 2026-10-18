import { describe, expect, it } from "vitest";
import { parseCsv } from "../parse";
import { batchLimit } from "./size";

const rows = (n: number) =>
  parseCsv("Id\n" + Array.from({ length: n }, (_, i) => `${i}\n`).join(""));

describe("batchLimit", () => {
  it("stays quiet up to 10,000 data rows and 10 MB", () => {
    expect(batchLimit(rows(10_000), 10_000_000)).toEqual([]);
  });

  it("suggests splitting a file with more than 10,000 data rows, naming the limit", () => {
    expect(batchLimit(rows(10_001), 60_000)).toMatchObject([
      {
        kind: "batch-limit",
        severity: "info",
        detail: "10,001 data rows, more than the Bulk API's 10,000 records per batch",
      },
    ]);
  });

  it("suggests splitting a file over 10 MB, naming the limit", () => {
    expect(batchLimit(rows(2), 12_345_678)).toMatchObject([
      { detail: "12.3 MB, more than the Bulk API's 10 MB per batch" },
    ]);
  });

  it("names both limits in one finding when the file is over both", () => {
    const findings = batchLimit(rows(20_000), 10_000_001);
    expect(findings).toHaveLength(1);
    expect(findings[0].detail).toBe(
      "20,000 data rows and 10.0 MB, more than the Bulk API's 10,000 records and 10 MB per batch",
    );
  });
});

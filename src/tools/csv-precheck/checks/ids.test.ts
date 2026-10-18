import { describe, expect, it } from "vitest";
import type { Check } from "../findings";
import { parseCsv } from "../parse";
import { caseOnlyIds, idChecksum, malformedIds, missingIds, mixedIdLengths } from "./ids";

const run = (check: Check, text: string) => check(parseCsv(text));

describe("malformedIds", () => {
  it("reports each value in an ID column with the wrong length or characters", () => {
    const text =
      "Id,Name,AccountId\n001D000000IqhS,a,001D000000IqhSL\n001D000000IqhSL,b,001D000000Iqh-L\n";
    expect(run(malformedIds, text)).toMatchObject([
      {
        kind: "malformed-id",
        severity: "error",
        location: { row: 1, line: 2, column: { index: 1, name: "Id" } },
        detail: '"001D000000IqhS": 14 characters, not 15 or 18',
        explanation: expect.stringContaining(
          "MALFORMED_ID: Object name id: id value of incorrect type",
        ),
      },
      {
        location: { row: 2, line: 3, column: { index: 3, name: "AccountId" } },
        detail: '"001D000000Iqh-L": holds a character other than a letter or digit',
      },
    ]);
    expect(run(malformedIds, text)[0].explanation).toContain("MALFORMED_ID: bad id");
  });

  it("counts lengths 16 and 17 as malformed, and a single character in the singular", () => {
    const findings = run(malformedIds, "Id\n001D000000IqhSLI\n001D000000IqhSLIA\n1\n");
    expect(findings.map((f) => f.detail)).toEqual([
      '"001D000000IqhSLI": 16 characters, not 15 or 18',
      '"001D000000IqhSLIA": 17 characters, not 15 or 18',
      '"1": 1 character, not 15 or 18',
    ]);
  });

  it("leaves empty values and columns that hold no IDs alone", () => {
    expect(run(malformedIds, "Id,Name\n,abc\n  ,x\n001D000000IqhSL,y\n")).toEqual([]);
  });

  it("checks columns found by their values, flagging the odd ones out", () => {
    const findings = run(malformedIds, "Parent\n001D000000IqhSL\n001R0000005hDFY\n001R0000005hD\n");
    expect(findings).toMatchObject([{ location: { row: 3, column: { name: "Parent" } } }]);
  });
});

describe("idChecksum", () => {
  it("warns about an 18-character ID whose suffix does not match its first 15", () => {
    const text = "Id\n001D000000IqhSLIAZ\n001D000000IqhSLAAA\n001xx000003DHuraag\n";
    expect(run(idChecksum, text)).toMatchObject([
      {
        kind: "id-checksum",
        severity: "warning",
        location: { row: 2, line: 3, column: { index: 1, name: "Id" } },
        detail: '"001D000000IqhSLAAA" ends in "AAA", but its first 15 characters give "IAZ"',
      },
    ]);
  });

  it("does not claim Data Loader rejects it", () => {
    const [finding] = run(idChecksum, "Id\n001D000000IqhSLAAA\n");
    expect(finding.explanation).toContain("unconfirmed");
  });

  it("finds an ID whose letters changed case after it was exported", () => {
    expect(run(idChecksum, "Id\n001D000000IQHSLIAZ\n")).toHaveLength(1);
  });
});

describe("mixedIdLengths", () => {
  it("warns once per column mixing 15- and 18-character IDs", () => {
    const text =
      "Id,AccountId\n001D000000IqhSL,001R0000005hDFY\n001R0000005hDFYIA2,001D000000IqhSL\n00300000003T2PG,\n";
    expect(run(mixedIdLengths, text)).toMatchObject([
      {
        kind: "mixed-id-lengths",
        severity: "warning",
        location: { column: { index: 1, name: "Id" } },
        detail: "15 characters: Rows 1, 3; 18 characters: Row 2",
      },
    ]);
  });

  it("ignores malformed values", () => {
    expect(run(mixedIdLengths, "Id\n001D000000IqhSL\n001D000000IqhSLI\n")).toEqual([]);
  });
});

describe("caseOnlyIds", () => {
  it("warns about 15-character IDs in a column that differ only by letter case", () => {
    const text =
      "Id\n001D000000IqhSL\n001D000000IQHSL\n001R0000005hDFY\n001D000000IqhSL\n001d000000iqhsl\n";
    expect(run(caseOnlyIds, text)).toMatchObject([
      {
        kind: "id-case-only",
        severity: "warning",
        location: { column: { index: 1, name: "Id" } },
        detail:
          '"001D000000IqhSL" in Rows 1, 4; "001D000000IQHSL" in Row 2; "001d000000iqhsl" in Row 5',
        explanation: expect.stringContaining("18-character"),
      },
    ]);
  });

  it("leaves exact repeats and 18-character IDs alone", () => {
    expect(run(caseOnlyIds, "Id\n001D000000IqhSL\n001D000000IqhSL\n")).toEqual([]);
    expect(run(caseOnlyIds, "Id\n001D000000IqhSLIAZ\n001D000000IQHSLIAZ\n")).toEqual([]);
  });

  it("compares within a column, not across columns", () => {
    expect(run(caseOnlyIds, "Id,AccountId\n001D000000IqhSL,001D000000IQHSL\n")).toEqual([]);
  });
});

describe("missingIds", () => {
  it("warns about empty values in a column named Id, listing their rows", () => {
    expect(run(missingIds, "Id,Name\n,a\n001D000000IqhSL,b\n  ,c\n")).toMatchObject([
      {
        kind: "missing-id",
        severity: "warning",
        location: { column: { index: 1, name: "Id" } },
        detail: "Rows 1, 3",
        explanation: expect.stringContaining(
          "MISSING_ARGUMENT: Id not specified in an update call",
        ),
      },
    ]);
  });

  it("matches the name Id in any case, and only that name", () => {
    expect(run(missingIds, "ID,Name\n,a\n")).toHaveLength(1);
    expect(run(missingIds, "AccountId,Name\n,a\n")).toEqual([]);
  });
});

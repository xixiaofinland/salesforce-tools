import { describe, expect, it } from "vitest";
import { parseCsv } from "../parse";
import { dateChecks } from "./dates";

const run = (text: string, european = false) => dateChecks(parseCsv(text), { european });
const ofKind = (text: string, kind: string, european = false) =>
  run(text, european).filter((f) => f.kind === kind);

describe("invalid dates", () => {
  it("reports each value Data Loader cannot parse, with its message", () => {
    const text = "Name,Close\na,2024-01-15\nb,2024-02-30\nc,\nd,2024-01-16\ne, 31/12/2024\n";
    expect(ofKind(text, "invalid-date")).toMatchObject([
      {
        severity: "error",
        location: { row: 2, line: 3, column: { index: 2, name: "Close" } },
        detail: "Error converting value to correct data type: Failed to parse date: 2024-02-30",
      },
      { location: { row: 5 }, detail: expect.stringContaining("Failed to parse date: 31/12/2024") },
    ]);
  });

  it("judges slash dates by the European setting", () => {
    const text = "D\n31/12/2024\n01/02/2024\n";
    expect(ofKind(text, "invalid-date", false)).toHaveLength(1);
    expect(ofKind(text, "invalid-date", true)).toEqual([]);
    expect(ofKind("D\n12/31/2024\n", "invalid-date", true)).toHaveLength(1);
  });

  it("leaves #N/A and columns that hold no dates alone", () => {
    expect(run("Name,D\n2024-02-30,#N/A\nAcme,2024-01-15\n")).toEqual([]);
  });
});

describe("date range", () => {
  it("reports dates before 1700-01-01 or after 4000-12-31, and accepts both bounds", () => {
    const text = "D\n1700-01-01\n4000-12-31T10:00:00\n1699-12-31\n4001-01-01\n1/5/24\n";
    expect(ofKind(text, "date-out-of-range")).toMatchObject([
      {
        severity: "error",
        location: { row: 3, column: { name: "D" } },
        detail: '"1699-12-31" is 1699-12-31, before 1700-01-01',
      },
      { location: { row: 4 }, detail: '"4001-01-01" is 4001-01-01, after 4000-12-31' },
      { location: { row: 5 }, detail: '"1/5/24" is 0024-01-05, before 1700-01-01' },
    ]);
  });
});

describe("colon offsets", () => {
  it("warns once per column, citing KB 000383025 and suggesting both fixes", () => {
    const text =
      "D\n1999-01-01T23:01:01+01:00\n2024-01-15T10:30:00.000-05:30\n2024-01-15T10:00:00Z\n";
    const [finding, ...rest] = ofKind(text, "date-colon-offset");
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({
      severity: "warning",
      location: { column: { index: 1, name: "D" } },
      detail:
        'Rows 1, 2, such as "1999-01-01T23:01:01+01:00": write "1999-01-01T23:01:01+0100" or "1999-01-01T23:01:01GMT+01:00"',
    });
    expect(finding.explanation).toContain("KB 000383025");
    expect(ofKind(text, "invalid-date")).toEqual([]);
  });
});

describe("slash date order", () => {
  it("is an error when a day-first value meets the US setting, naming the row", () => {
    const text = "Name,D\na,01/02/2024\nb,13/02/2024\n";
    expect(ofKind(text, "date-order-conflict")).toMatchObject([
      {
        severity: "error",
        location: { row: 2, line: 3, column: { index: 2, name: "D" } },
        detail:
          '"13/02/2024" can only be day first (dd/MM/yyyy), but Use European date format is off',
      },
    ]);
    expect(ofKind(text, "date-order-conflict", true)).toEqual([]);
    expect(ofKind(text, "date-order-ambiguous", true)).toEqual([]);
  });

  it("is an error when a month-first value meets the European setting", () => {
    const text = "D\n02/13/2024 10:00:00\n";
    expect(ofKind(text, "date-order-conflict", true)).toMatchObject([
      {
        location: { row: 1 },
        detail:
          '"02/13/2024 10:00:00" can only be month first (MM/dd/yyyy), but Use European date format is on',
      },
    ]);
    expect(ofKind(text, "date-order-conflict", false)).toEqual([]);
  });

  it("says when a column holds both orders, whichever the setting", () => {
    const text = "D\n13/02/2024\n02/13/2024\n";
    for (const european of [false, true]) {
      const [finding] = ofKind(text, "date-order-conflict", european);
      expect(finding.detail).toContain("so the column mixes both orders");
    }
    expect(ofKind(text, "date-order-conflict", false)[0]).toMatchObject({
      location: { row: 1 },
      detail:
        '"13/02/2024" can only be day first (dd/MM/yyyy), but Use European date format is off; row 2 "02/13/2024" can only be month first, so the column mixes both orders',
    });
  });

  it("warns that a column is ambiguous when no value decides, with the current reading", () => {
    const text = "D\n03/04/2024\n05/06/2024\n2024-01-01\n";
    expect(ofKind(text, "date-order-ambiguous")).toMatchObject([
      {
        severity: "warning",
        location: { column: { index: 1, name: "D" } },
        detail: 'With Use European date format off, Data Loader reads "03/04/2024" as 4 March 2024',
      },
    ]);
    expect(ofKind(text, "date-order-ambiguous", true)[0].detail).toBe(
      'With Use European date format on, Data Loader reads "03/04/2024" as 3 April 2024',
    );
  });

  it("says nothing about order for a column without slash dates", () => {
    const kinds = run("D\n2024-01-01\n").map((f) => f.kind);
    expect(kinds).toEqual([]);
  });
});

describe("times in date-only columns", () => {
  it("warns about a column whose times are all exactly midnight", () => {
    const text = "Due\n2024-01-15 00:00:00\n2024-01-16T00:00:00.000Z\n2024-01-17\n";
    const [finding] = ofKind(text, "date-with-time");
    expect(finding).toMatchObject({
      severity: "warning",
      location: { column: { index: 1, name: "Due" } },
      detail: 'Rows 1, 2, such as "2024-01-15 00:00:00"',
    });
    expect(finding.explanation).toContain("yyyy-MM-dd");
    expect(finding.explanation).toContain("Time Zone");
  });

  it("warns about any time in a column named like a date field", () => {
    expect(ofKind("CloseDate\n2024-01-15 10:30:00\n", "date-with-time")).toHaveLength(1);
    expect(ofKind("Close_Date__c\n2024-01-15T10:30:00Z\n", "date-with-time")).toHaveLength(1);
  });

  it("leaves datetime columns with real times alone", () => {
    expect(ofKind("Start\n2024-01-15 10:30:00\n2024-01-15 00:00:00\n", "date-with-time")).toEqual(
      [],
    );
    expect(ofKind("CreatedDate\n2024-01-15T10:30:00Z\n", "date-with-time")).toEqual([]);
    expect(ofKind("StartDateTime\n2024-01-15T10:30:00Z\n", "date-with-time")).toEqual([]);
    expect(ofKind("CloseDate\n2024-01-15\n", "date-with-time")).toEqual([]);
  });
});

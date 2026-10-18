import { describe, expect, it } from "vitest";
import type { Check } from "../findings";
import { parseCsv } from "../parse";
import { lineBreaks, spaceAroundQuote, surroundingSpaces } from "./whitespace";

const run = (check: Check, text: string) => check(parseCsv(text));

describe("surroundingSpaces", () => {
  it("warns once per column, listing the rows and showing a value", () => {
    expect(run(surroundingSpaces, "Id,Name\n1, Smith\n2,Jones \n3,Ok\n")).toMatchObject([
      {
        kind: "surrounding-spaces",
        severity: "warning",
        location: { column: { index: 2, name: "Name" } },
        detail: 'Rows 1, 2, such as " Smith"',
        explanation: expect.stringContaining("does not trim"),
      },
    ]);
  });

  it("reports each column with spaces separately", () => {
    const findings = run(surroundingSpaces, "a,b,c\n 1,2,3 \n");
    expect(findings.map((f) => f.location?.column?.index)).toEqual([1, 3]);
    expect(findings[1].detail).toBe('Row 1, such as "3 "');
  });

  it("counts a value of only spaces", () => {
    expect(run(surroundingSpaces, "a,b\n1,  \n")).toHaveLength(1);
  });

  it("counts tabs and no-break spaces, but not line breaks", () => {
    const findings = run(surroundingSpaces, 'a,b,c\n\tx,y\u00a0,"z\n"\n');
    expect(findings.map((f) => f.location?.column?.index)).toEqual([1, 2]);
  });

  it("leaves a space next to a quote to its own check", () => {
    expect(run(surroundingSpaces, 'a,b\n"John", "Smith"\n"x" ,y\n')).toEqual([]);
  });

  it("leaves values without surrounding spaces alone, including #N/A", () => {
    expect(run(surroundingSpaces, 'a,b\n1,"x, y"\n2,#N/A\n3,\n')).toEqual([]);
  });
});

describe("lineBreaks", () => {
  it("notes each column with multi-line values", () => {
    expect(run(lineBreaks, 'Id,Note\n1,"two\nlines"\n2,one\n3,"a\r\nb"\n')).toMatchObject([
      {
        kind: "line-breaks",
        severity: "info",
        location: { column: { index: 2, name: "Note" } },
        detail: 'Rows 1, 3, such as "two\\nlines"',
      },
    ]);
  });

  it("stays quiet without line breaks", () => {
    expect(run(lineBreaks, "Id,Note\n1,x\n")).toEqual([]);
  });
});

describe("spaceAroundQuote", () => {
  it("warns about each value with a space before or after its quotes", () => {
    expect(run(spaceAroundQuote, 'First,Last\n"John", "Smith"\n"Ann" ,Lee\n')).toMatchObject([
      {
        kind: "space-around-quote",
        severity: "warning",
        location: { row: 1, line: 2, column: { index: 2, name: "Last" } },
        detail: '" \\"Smith\\""',
        explanation: expect.stringContaining("A space before or after a double quote"),
      },
      { location: { row: 2, line: 3, column: { index: 1, name: "First" } }, detail: '"Ann "' },
    ]);
  });

  it("finds it in the header too", () => {
    expect(run(spaceAroundQuote, '"Id", "Name"\n1,x\n')).toMatchObject([
      { location: { line: 1, column: { index: 2, name: ' "Name"' } }, detail: "In the header row" },
    ]);
  });

  it("accepts a space between plain values, which the Bulk API keeps", () => {
    expect(run(spaceAroundQuote, 'a,b\nJohn, Smith\n"x",y\n')).toEqual([]);
  });
});

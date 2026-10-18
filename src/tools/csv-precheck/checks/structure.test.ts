import { describe, expect, it } from "vitest";
import { parseCsv } from "../parse";
import {
  columnCount,
  delimiter,
  duplicateHeader,
  emptyHeaderCell,
  missingHeader,
  unclosedQuote,
} from "./structure";

const run = (check: typeof missingHeader, text: string) => check(parseCsv(text));
const kinds = (check: typeof missingHeader, text: string) => run(check, text).map((f) => f.kind);

describe("missingHeader", () => {
  it("flags an empty file with Data Loader's text", () => {
    expect(run(missingHeader, "")).toMatchObject([
      {
        kind: "no-header",
        severity: "error",
        detail: "Error getting header row from the CSV file.",
      },
    ]);
  });

  it("flags a file of only blank lines", () => {
    expect(kinds(missingHeader, "\n\r\n\n")).toEqual(["no-header"]);
  });

  it("takes the first non-blank line as the header, as Data Loader does", () => {
    expect(run(missingHeader, "\n\nId,Name\n1,Acme\n")).toEqual([]);
  });

  it("accepts a header, even with no data rows", () => {
    expect(run(missingHeader, "Id,Name\n")).toEqual([]);
    expect(run(missingHeader, "Name")).toEqual([]);
  });
});

describe("emptyHeaderCell", () => {
  it("flags each empty header cell with Data Loader's text", () => {
    expect(run(emptyHeaderCell, 'Id,,Name,""\n1,2,3,4\n')).toMatchObject([
      {
        kind: "empty-header-cell",
        severity: "error",
        detail: "An empty column is found in the header row",
        location: { column: { index: 2, name: "" } },
      },
      { location: { column: { index: 4, name: "" } } },
    ]);
  });

  it("leaves a header cell of spaces alone, as Data Loader's check does", () => {
    expect(run(emptyHeaderCell, "Id, \n")).toEqual([]);
  });

  it("stays quiet when there is no header to check", () => {
    expect(run(emptyHeaderCell, "")).toEqual([]);
    expect(run(emptyHeaderCell, "Id,Name\n")).toEqual([]);
  });
});

describe("duplicateHeader", () => {
  it("names the columns that share a name, ignoring case", () => {
    expect(run(duplicateHeader, "Id,Name,Phone,name,NAME\n")).toMatchObject([
      {
        kind: "duplicate-header",
        severity: "error",
        detail: 'Columns 2 "Name", 4 "name", 5 "NAME"',
      },
    ]);
  });

  it("adds Data Loader's warning when two names match exactly", () => {
    expect(run(duplicateHeader, "Id,Name,name,Name\n")).toMatchObject([
      { detail: 'Columns 2 "Name", 3 "name", 4 "Name". A duplicate column [Name] is found' },
    ]);
  });

  it("reports each duplicated name separately", () => {
    expect(run(duplicateHeader, "Id,Name,id,name\n").map((f) => f.detail)).toEqual([
      'Columns 1 "Id", 3 "id"',
      'Columns 2 "Name", 4 "name"',
    ]);
  });

  it("leaves empty header cells to their own check", () => {
    expect(run(duplicateHeader, "Id,,\n")).toEqual([]);
  });

  it("accepts distinct names", () => {
    expect(run(duplicateHeader, "Id,Name,Account.Name\n")).toEqual([]);
  });
});

describe("unclosedQuote", () => {
  it("flags the row where a quote opens, with Data Loader's text", () => {
    expect(run(unclosedQuote, 'Id,Note\n1,ok\n2,"open\n3,lost\n')).toMatchObject([
      {
        kind: "unclosed-quote",
        severity: "error",
        detail: "EOF reached before closing an opened quote",
        location: { row: 2, line: 3 },
      },
    ]);
  });

  it("says so when the quote opens in the header", () => {
    expect(run(unclosedQuote, 'Id,"Note\n1,2\n')).toMatchObject([
      { detail: "The quote opens in the header row. EOF reached before closing an opened quote" },
    ]);
  });

  it("accepts closed quotes", () => {
    expect(run(unclosedQuote, 'Id,Note\n1,"a ""b"" c"\n')).toEqual([]);
  });
});

describe("columnCount", () => {
  it("quotes Data Loader's error for a row with too many columns, counting from 0", () => {
    expect(run(columnCount, "Id,Name\n1,Acme\n2,Acme,Inc\n")).toMatchObject([
      {
        kind: "row-too-many-columns",
        severity: "error",
        detail:
          "Error reading data row #1: the number of columns (3) exceeds the number of columns in the header (2)",
        location: { row: 2, line: 3 },
      },
    ]);
  });

  it("quotes Data Loader's error for a row with too few columns", () => {
    expect(run(columnCount, "Id,Name,Phone\n1,Acme\n")).toMatchObject([
      {
        kind: "row-too-few-columns",
        detail:
          "Error reading data row #0: the number of columns (2) is less than the number of columns in the header (3)",
        location: { row: 1, line: 2 },
      },
    ]);
  });

  it("does not flag blank lines, which Data Loader skips", () => {
    expect(run(columnCount, "Id,Name\n\n1,Acme\n\n\n")).toEqual([]);
  });

  it("leaves blank lines out of Data Loader's row number", () => {
    expect(run(columnCount, "Id,Name\n1,Acme\n\n2\n")).toMatchObject([
      { detail: expect.stringContaining("data row #1:"), location: { row: 2, line: 4 } },
    ]);
  });

  it("flags a line of spaces, which Data Loader reads as a row", () => {
    expect(kinds(columnCount, "Id,Name\n \n")).toEqual(["row-too-few-columns"]);
  });

  it("counts a quoted line break as part of one row", () => {
    expect(run(columnCount, 'Id,Note\n1,"two\nlines"\n2,x\n')).toEqual([]);
  });

  it("does not count a final newline as a row", () => {
    expect(run(columnCount, "Id,Name\n1,Acme\r\n")).toEqual([]);
  });

  it("flags every ragged row", () => {
    const text = "a,b\n" + "1,2,3\n".repeat(5000);
    expect(run(columnCount, text)).toHaveLength(5000);
  });
});

describe("delimiter", () => {
  it("warns about a semicolon-delimited file, as European Excel saves", () => {
    expect(run(delimiter, "Id;Name\n1;Acme\n")).toMatchObject([
      {
        kind: "not-comma-delimited",
        severity: "warning",
        detail: "The file is semicolon-delimited",
        explanation: expect.stringContaining("doesn't support any delimiter except for a comma"),
      },
    ]);
  });

  it("warns about a tab-delimited file", () => {
    expect(run(delimiter, "Id\tName\n1\tAcme\n")).toMatchObject([
      { detail: "The file is tab-delimited" },
    ]);
  });

  it("accepts commas", () => {
    expect(run(delimiter, "Id,Name\n1,Acme\n")).toEqual([]);
  });
});

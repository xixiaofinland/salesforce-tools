import { describe, expect, it } from "vitest";
import { parseCsv } from "../parse";
import {
  columnCount,
  duplicateHeader,
  emptyHeaderCell,
  missingHeader,
  unclosedQuote,
} from "./structure";

const run = (check: typeof missingHeader, text: string) => check(parseCsv(text));
const kinds = (check: typeof missingHeader, text: string) => run(check, text).map((f) => f.kind);

describe("missingHeader", () => {
  it("flags an empty file", () => {
    expect(run(missingHeader, "")).toMatchObject([{ kind: "empty-file", severity: "error" }]);
  });

  it("flags a blank first line as no header row", () => {
    expect(kinds(missingHeader, "\n1,2\n")).toEqual(["no-header"]);
    expect(kinds(missingHeader, "  \n")).toEqual(["no-header"]);
  });

  it("accepts a header, even with no data rows", () => {
    expect(run(missingHeader, "Id,Name\n")).toEqual([]);
    expect(run(missingHeader, "Name")).toEqual([]);
  });
});

describe("emptyHeaderCell", () => {
  it("flags each empty header cell with Data Loader's text", () => {
    expect(run(emptyHeaderCell, "Id,,Name,\n1,2,3,4\n")).toMatchObject([
      {
        kind: "empty-header-cell",
        severity: "error",
        detail: "An empty column is found in the header row",
        location: { column: { index: 2, name: "" } },
      },
      { location: { column: { index: 4, name: "" } } },
    ]);
  });

  it("treats a header cell of only spaces as empty", () => {
    expect(kinds(emptyHeaderCell, "Id, \n")).toEqual(["empty-header-cell"]);
  });

  it("stays quiet when there is no header to check", () => {
    expect(run(emptyHeaderCell, "")).toEqual([]);
    expect(run(emptyHeaderCell, "\n1,2\n")).toEqual([]);
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
  it("flags the row where a quote opens and never closes", () => {
    expect(run(unclosedQuote, 'Id,Note\n1,ok\n2,"open\n3,lost\n')).toMatchObject([
      { kind: "unclosed-quote", severity: "error", location: { row: 2 } },
    ]);
  });

  it("says so when the quote opens in the header", () => {
    expect(run(unclosedQuote, 'Id,"Note\n1,2\n')).toMatchObject([
      { detail: "The quote opens in the header row" },
    ]);
  });

  it("accepts closed quotes", () => {
    expect(run(unclosedQuote, 'Id,Note\n1,"a ""b"" c"\n')).toEqual([]);
  });
});

describe("columnCount", () => {
  it("quotes Data Loader's error for a row with too many columns", () => {
    expect(run(columnCount, "Id,Name\n1,Acme\n2,Acme,Inc\n")).toMatchObject([
      {
        kind: "row-too-many-columns",
        severity: "error",
        detail:
          "Error reading data row #2: the number of columns (3) exceeds the number of columns in the header (2)",
        location: { row: 2 },
      },
    ]);
  });

  it("quotes Data Loader's error for a row with too few columns", () => {
    expect(run(columnCount, "Id,Name,Phone\n1,Acme\n")).toMatchObject([
      {
        kind: "row-too-few-columns",
        detail:
          "Error reading data row #1: the number of columns (2) is less than the number of columns in the header (3)",
        location: { row: 1 },
      },
    ]);
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

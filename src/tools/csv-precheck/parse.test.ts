import { describe, expect, it } from "vitest";
import { detectDelimiter, parseCsv, parseRecords } from "./parse";

describe("parseRecords", () => {
  it("splits plain fields and records", () => {
    expect(parseRecords("a,b\n1,2\n", ",")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("unwraps quoted fields", () => {
    expect(parseRecords('"a","b c"\n', ",")).toEqual([["a", "b c"]]);
  });

  it('turns "" inside a quoted field into one quote', () => {
    expect(parseRecords('"This is the ""gold"" standard"', ",")).toEqual([
      ['This is the "gold" standard'],
    ]);
  });

  it("keeps commas inside quoted fields", () => {
    expect(parseRecords('"Director of Operations, Western Region",x', ",")).toEqual([
      ["Director of Operations, Western Region", "x"],
    ]);
  });

  it("keeps line breaks inside quoted fields", () => {
    expect(parseRecords('a,"line 1\nline 2"\r\nb,"x\r\ny"\n', ",")).toEqual([
      ["a", "line 1\nline 2"],
      ["b", "x\r\ny"],
    ]);
  });

  it("reads CRLF and LF line endings alike", () => {
    const expected = [
      ["a", "b"],
      ["1", "2"],
    ];
    expect(parseRecords("a,b\r\n1,2\r\n", ",")).toEqual(expected);
    expect(parseRecords("a,b\n1,2\n", ",")).toEqual(expected);
  });

  it("reads a last record that has no final newline", () => {
    expect(parseRecords("a,b\n1,2", ",")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps empty fields, including a trailing one", () => {
    expect(parseRecords("a,,c,\n", ",")).toEqual([["a", "", "c", ""]]);
  });

  it("keeps a blank line in the middle as a one-field record", () => {
    expect(parseRecords("a,b\n\n1,2\n", ",")).toEqual([["a", "b"], [""], ["1", "2"]]);
  });

  it("does not trim spaces", () => {
    expect(parseRecords("John, Smith\n", ",")).toEqual([["John", " Smith"]]);
  });

  it("returns no records for an empty file", () => {
    expect(parseRecords("", ",")).toEqual([]);
  });

  it("splits on the delimiter it is given", () => {
    expect(parseRecords('a;"b;c"\tx\n', ";")).toEqual([["a", "b;c\tx"]]);
    expect(parseRecords("a\tb,c\n", "\t")).toEqual([["a", "b,c"]]);
  });
});

describe("detectDelimiter", () => {
  it("defaults to comma", () => {
    expect(detectDelimiter("")).toBe(",");
    expect(detectDelimiter("Name\nAcme\n")).toBe(",");
    expect(detectDelimiter("Id,Name\n1,Acme\n")).toBe(",");
  });

  it("finds semicolons from European Excel", () => {
    expect(detectDelimiter("Id;Name;Amount\n1;Acme;1,5\n2;Beta;2,5\n")).toBe(";");
  });

  it("finds tabs", () => {
    expect(detectDelimiter("Id\tName\n1\tAcme, Inc.\n")).toBe("\t");
  });

  it("ignores delimiters inside quoted fields", () => {
    expect(detectDelimiter('"a;b;c;d",x\n"e;f;g;h",y\n')).toBe(",");
  });

  it("prefers the delimiter that gives rows the header's width", () => {
    // Commas in the data would split each row in two, but only semicolons match the header.
    expect(detectDelimiter("Name;Note\nAcme;a,b,c\nBeta;d,e,f\n")).toBe(";");
  });
});

describe("parseCsv", () => {
  it("separates the header from data rows numbered from 1", () => {
    expect(parseCsv("Id,Name\n1,Acme\n2,Beta\n")).toEqual({
      delimiter: ",",
      header: ["Id", "Name"],
      rows: [
        { number: 1, fields: ["1", "Acme"] },
        { number: 2, fields: ["2", "Beta"] },
      ],
      unclosedQuote: false,
    });
  });

  it("has no header for an empty file", () => {
    expect(parseCsv("")).toEqual({
      delimiter: ",",
      header: null,
      rows: [],
      unclosedQuote: false,
    });
  });

  it("notes a quote left open at the end of the file", () => {
    const csv = parseCsv('a,b\n1,"open\n2,x\n');
    expect(csv.unclosedQuote).toBe(true);
    expect(csv.rows).toEqual([{ number: 1, fields: ["1", "open\n2,x\n"] }]);
  });

  it("uses the detected delimiter", () => {
    expect(parseCsv("a;b\n1;2\n").header).toEqual(["a", "b"]);
  });
});

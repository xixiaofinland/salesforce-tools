import { describe, expect, it } from "vitest";
import { parseCsv } from "../parse";
import { duplicateKeys, duplicateRows } from "./duplicates";

describe("duplicateRows", () => {
  it("groups rows identical in every column, listing each group's rows", () => {
    const csv = parseCsv("Id,Name\n1,Acme\n2,Beta\n1,Acme\n2,Beta\n3,Gamma\n1,Acme\n");
    expect(duplicateRows(csv)).toMatchObject([
      { kind: "duplicate-row", severity: "warning", detail: "Rows 1, 3, 6" },
      { kind: "duplicate-row", severity: "warning", detail: "Rows 2, 4" },
    ]);
  });

  it("treats rows differing only in case or spaces as different", () => {
    expect(duplicateRows(parseCsv("Id,Name\n1,Acme\n1,acme\n1,Acme \n"))).toEqual([]);
  });

  it("does not confuse a delimiter inside a value with a column boundary", () => {
    expect(duplicateRows(parseCsv('a,b\n"1,2",3\n1,"2,3"\n'))).toEqual([]);
  });

  it("caps a long list of row numbers", () => {
    const csv = parseCsv("a\n" + "x\n".repeat(25));
    expect(duplicateRows(csv)).toMatchObject([
      { detail: "Rows 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 and 15 more" },
    ]);
  });

  it("stays quiet when every row is different", () => {
    expect(duplicateRows(parseCsv("Id\n1\n2\n"))).toEqual([]);
    expect(duplicateRows(parseCsv(""))).toEqual([]);
  });
});

describe("duplicateKeys", () => {
  const exact = (column: number) => ({ column, ignoreCaseAndSpaces: false });
  const loose = (column: number) => ({ column, ignoreCaseAndSpaces: true });

  it("groups repeated values in the key column by value, with their rows", () => {
    const csv = parseCsv("Name,Ext__c\nA,X1\nB,X2\nC,X1\nD,X2\nE,X3\nF,X1\n");
    expect(duplicateKeys(csv, exact(1))).toMatchObject([
      {
        kind: "duplicate-key",
        severity: "warning",
        title: 'Repeated values in key column 2 "Ext__c"',
        detail: '"X1": Rows 1, 3, 6',
      },
      { detail: '"X2": Rows 2, 4' },
    ]);
  });

  it("says which comparison it used", () => {
    const csv = parseCsv("Ext\nx\nx\n");
    expect(duplicateKeys(csv, exact(0))[0].explanation).toContain(
      "Values were compared exactly as written.",
    );
    expect(duplicateKeys(csv, loose(0))[0].explanation).toContain(
      "Values were compared ignoring letter case and spaces around them.",
    );
  });

  it("compares exactly by default, so case and spaces make values differ", () => {
    expect(duplicateKeys(parseCsv("Ext\nabc\nABC\n abc\n"), exact(0))).toEqual([]);
  });

  it("can ignore letter case and surrounding spaces, showing the first value seen", () => {
    expect(duplicateKeys(parseCsv("Ext\nabc\nABC\n abc \na bc\n"), loose(0))).toMatchObject([
      { detail: '"abc": Rows 1, 2, 3' },
    ]);
  });

  it("does not count empty values, or rows missing the column, as duplicates", () => {
    expect(duplicateKeys(parseCsv("Id,Ext\n1,\n2,\n3, \n4, \n5\n6\n"), exact(1))).toEqual([]);
    expect(duplicateKeys(parseCsv("Id,Ext\n1, \n2,  \n"), loose(1))).toEqual([]);
  });

  it("names a column with an empty header by position", () => {
    expect(duplicateKeys(parseCsv("Id,\n1,a\n2,a\n"), exact(1))[0].title).toBe(
      "Repeated values in key column 2",
    );
  });

  it("stays quiet without a header or a column at that position", () => {
    expect(duplicateKeys(parseCsv(""), exact(0))).toEqual([]);
    expect(duplicateKeys(parseCsv("Id\n1\n1\n"), exact(3))).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { groupFindings, type Check, type Finding } from "./findings";
import { checkCsv, renderText } from "./report";

const finding = (kind: string, severity: Finding["severity"], row?: number): Finding => ({
  kind,
  severity,
  title: `${kind} title`,
  explanation: `${kind} explanation`,
  detail: row === undefined ? undefined : `detail ${row}`,
  location: row === undefined ? undefined : { row },
});

describe("groupFindings", () => {
  it("collapses findings of one kind into a count and the first few examples", () => {
    const findings = Array.from({ length: 5000 }, (_, i) => finding("ragged", "error", i + 1));
    const [group, ...rest] = groupFindings(findings);
    expect(rest).toEqual([]);
    expect(group).toMatchObject({ kind: "ragged", count: 5000, title: "ragged title" });
    expect(group.examples.map((e) => e.location?.row)).toEqual([1, 2, 3, 4, 5]);
  });

  it("orders groups errors first, then warnings, then info", () => {
    const groups = groupFindings([
      finding("i", "info"),
      finding("w", "warning"),
      finding("e1", "error"),
      finding("e2", "error"),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(["e1", "e2", "w", "i"]);
  });
});

describe("checkCsv", () => {
  it("reports a clean file with its counts and delimiter", () => {
    expect(checkCsv("Id;Name\n1;Acme\n2;Beta\n")).toEqual({
      delimiter: ";",
      rowCount: 2,
      columnCount: 2,
      groups: [],
    });
  });

  it("runs every check it is given on the parsed file", () => {
    const rows: Check = (csv) => csv.rows.map((r) => finding("seen", "info", r.number));
    const report = checkCsv("a\n1\n2\n", [rows]);
    expect(report.groups).toMatchObject([{ kind: "seen", count: 2 }]);
  });

  it("finds ragged rows and a duplicate header with the default checks", () => {
    const report = checkCsv("Id,Name,name\n1,a,b\n2,a\n3,a,b,c\n4,a,b,c\n");
    expect(report.groups.map((g) => [g.kind, g.count])).toEqual([
      ["duplicate-header", 1],
      ["row-too-few-columns", 1],
      ["row-too-many-columns", 2],
    ]);
  });
});

describe("renderText", () => {
  it("states that a clean file has no problems", () => {
    expect(renderText("a.csv", checkCsv("Id,Name\n1,Acme\n"))).toBe(
      "File: a.csv\n1 row, 2 columns, comma-delimited\n\nNo problems found.\n",
    );
  });

  it("lists each group with its examples and how many more there are", () => {
    const text = renderText("a.csv", checkCsv("a,b\n" + "1,2,3\n".repeat(7)));
    expect(text).toContain("7 rows, 2 columns, comma-delimited");
    expect(text).toContain("[ERROR] Rows with more columns than the header (7)");
    expect(text).toContain(
      "  - Row 1 (line 2): Error reading data row #0: the number of columns (3) exceeds the number of columns in the header (2)",
    );
    expect(text).toContain("  ... and 2 more");
    expect(text).not.toContain("Row 6 ");
  });

  it("names a column by position when its header cell is empty", () => {
    expect(renderText("a.csv", checkCsv("Id,\n1,2\n"))).toContain(
      "  - column 2: An empty column is found in the header row",
    );
  });
});

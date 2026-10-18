import { describe, expect, it } from "vitest";
import { groupFindings, type Check, type Finding } from "./findings";
import { buildReport, checkCsv, keyLine, prepareCsv, prepareFile, renderText } from "./report";

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
    expect(checkCsv("Id,Name\n1,Acme\n2,#N/A\n")).toEqual({
      delimiter: ",",
      rowCount: 2,
      columnCount: 2,
      groups: [],
    });
  });

  it("never reports #N/A, the Bulk API's null token", () => {
    const report = checkCsv("Id,Name,Date\n1,#N/A,#N/A\n2,Acme,2024-01-31\n");
    expect(report.groups).toEqual([]);
  });

  it("warns about a semicolon-delimited file and spaces with the default checks", () => {
    const report = checkCsv('Id;Name;Note\n1;Acme ;"two\nlines"\n2; "Beta";x\n');
    expect(report.groups.map((g) => [g.kind, g.severity])).toEqual([
      ["not-comma-delimited", "warning"],
      ["space-around-quote", "warning"],
      ["surrounding-spaces", "warning"],
      ["line-breaks", "info"],
    ]);
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

  it("warns about repeated rows with the default checks", () => {
    expect(checkCsv("Id,Name\n1,a\n1,a\n").groups).toMatchObject([
      { kind: "duplicate-row", severity: "warning", count: 1 },
    ]);
  });
});

describe("prepareCsv", () => {
  it("suggests splitting by the file's size in bytes", () => {
    const report = buildReport(prepareCsv("Id\n1\n", undefined, 10_500_000));
    expect(report.groups).toMatchObject([{ kind: "batch-limit", severity: "info" }]);
  });

  it("measures text in UTF-8 bytes when no size is given", () => {
    // 3,400,000 characters, but 10,200,000 bytes: each "€" takes three.
    expect(checkCsv("Id\n" + "€".repeat(3_400_000) + "\n").groups).toMatchObject([
      {
        kind: "batch-limit",
        examples: [{ detail: "10.2 MB, more than the Bulk API's 10 MB per batch" }],
      },
    ]);
  });
});

describe("prepareFile", () => {
  it("checks the bytes for a byte order mark and the text for spaces", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from("Id,Name\n1,Acme \n")]);
    const prepared = prepareFile(bytes);
    expect(prepared.csv.header).toEqual(["Id", "Name"]);
    expect(buildReport(prepared).groups.map((g) => g.kind)).toEqual([
      "utf8-bom",
      "surrounding-spaces",
    ]);
  });

  it("reads text that is not UTF-8 and still runs the other checks", () => {
    const bytes = new Uint8Array([...Buffer.from("Id,Name\n1,Caf"), 0xe9, 0x0a, 0x32]);
    expect(buildReport(prepareFile(bytes)).groups.map((g) => g.kind)).toEqual([
      "not-utf8",
      "row-too-few-columns",
    ]);
  });

  it("measures the file's own bytes for the batch limit", () => {
    const bytes = new Uint8Array(10_500_000).fill(0x61);
    bytes.set(Buffer.from("Id\n"));
    expect(buildReport(prepareFile(bytes)).groups.map((g) => g.kind)).toEqual(["batch-limit"]);
  });
});

describe("buildReport", () => {
  const text = "Id,Ext\n1,a\n2,A\n3,a\n3,a\n";

  it("adds the key column's repeated values to the file's findings", () => {
    const report = buildReport(prepareCsv(text), { column: 1, ignoreCaseAndSpaces: false });
    expect(report.groups.map((g) => [g.kind, g.count])).toEqual([
      ["duplicate-row", 1],
      ["duplicate-key", 1],
    ]);
    expect(report.groups[1].examples[0].detail).toBe('"a": Rows 1, 3, 4');
  });

  it("re-checks only the key column when the key changes", () => {
    let runs = 0;
    const counted: Check = () => {
      runs++;
      return [];
    };
    const prepared = prepareCsv(text, [counted]);
    const byId = buildReport(prepared, { column: 0, ignoreCaseAndSpaces: false });
    const byExt = buildReport(prepared, { column: 1, ignoreCaseAndSpaces: true });
    const none = buildReport(prepared);
    expect(runs).toBe(1);
    expect(byId.groups[0].examples[0].detail).toBe('"3": Rows 3, 4');
    expect(byExt.groups[0].examples[0].detail).toBe('"a": Rows 1, 2, 3, 4');
    expect(none.groups).toEqual([]);
  });

  it("states the key column and comparison mode, even when nothing repeats", () => {
    const prepared = prepareCsv("Id,Ext\n1,a\n");
    expect(keyLine(buildReport(prepared, { column: 1, ignoreCaseAndSpaces: false }))).toBe(
      'Key column 2 "Ext", compared exactly as written',
    );
    expect(keyLine(buildReport(prepared, { column: 1, ignoreCaseAndSpaces: true }))).toBe(
      'Key column 2 "Ext", compared ignoring letter case and surrounding spaces',
    );
    expect(keyLine(buildReport(prepared))).toBe("");
  });
});

describe("renderText", () => {
  it("names the key column and its comparison mode under the summary", () => {
    const report = buildReport(prepareCsv("Id,Ext\n1,a\n"), {
      column: 1,
      ignoreCaseAndSpaces: false,
    });
    expect(renderText("a.csv", report)).toBe(
      'File: a.csv\n1 row, 2 columns, comma-delimited\nKey column 2 "Ext", compared exactly as written\n\nNo problems found.\n',
    );
  });

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

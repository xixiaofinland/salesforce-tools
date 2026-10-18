// File-structure checks. Data Loader's texts and behaviour come from its source, see
// docs/research/data-loader-csv-facts.md sections 2, 5 and 6.
import type { Check } from "../findings";
import type { ParsedCsv } from "../parse";

function hasHeader(csv: ParsedCsv): csv is ParsedCsv & { header: string[] } {
  return csv.header !== null;
}

export const missingHeader: Check = (csv) =>
  hasHeader(csv)
    ? []
    : [
        {
          kind: "no-header",
          severity: "error",
          title: "No header row",
          explanation:
            "The file is empty or holds only blank lines. Data Loader skips blank lines and reads the first remaining line as the header row of field names; with none left, it stops with the error shown.",
          detail: "Error getting header row from the CSV file.",
        },
      ];

export const emptyHeaderCell: Check = (csv) => {
  if (!hasHeader(csv)) return [];
  return csv.header.flatMap((name, i) =>
    name === ""
      ? [
          {
            kind: "empty-header-cell",
            severity: "error" as const,
            title: "A header cell is empty",
            explanation:
              "When you choose the file, Data Loader warns “An empty column is found in the header row” and asks whether to continue; answering no ends with “CSV Error: Invalid CSV file format.” Its field mapping also refuses a header with no name for a column (“Missing column name in the CSV file at column N”). Name the column or delete it, including stray delimiters at the end of the header line.",
            detail: "An empty column is found in the header row",
            location: { column: { index: i + 1, name } },
          },
        ]
      : [],
  );
};

export const duplicateHeader: Check = (csv) => {
  if (!hasHeader(csv)) return [];
  const byName = new Map<string, number[]>();
  csv.header.forEach((name, i) => {
    if (name === "") return;
    const key = name.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), i]);
  });
  return [...byName.values()]
    .filter((indexes) => indexes.length > 1)
    .map((indexes) => {
      const names = indexes.map((i) => csv.header[i]);
      const columns = `Columns ${indexes.map((i, n) => `${i + 1} "${names[n]}"`).join(", ")}`;
      // Data Loader's own duplicate warning compares names exactly.
      const exact = names.find((name, n) => names.indexOf(name) !== n);
      return {
        kind: "duplicate-header",
        severity: "error" as const,
        title: "Two or more columns have the same name",
        explanation:
          "Data Loader keeps the file's column names in a map that ignores case, so these columns share one entry and cannot be mapped to fields separately. When two names match exactly, Data Loader also warns “A duplicate column [Name] is found” as you choose the file and asks whether to continue. Rename or remove the extra columns.",
        // The detail names every column involved, so there is no single location.
        detail: exact ? `${columns}. A duplicate column [${exact}] is found` : columns,
      };
    });
};

// Without this, everything after a stray opening quote reads as one value and the
// report could claim a broken file is clean.
export const unclosedQuote: Check = (csv) => {
  if (!csv.unclosedQuote) return [];
  const last = csv.rows.at(-1);
  return [
    {
      kind: "unclosed-quote",
      severity: "error",
      title: "A quoted value is never closed",
      explanation:
        'A value starts with a double quote that has no closing quote, so everything after it, to the end of the file, reads as part of that one value. Data Loader\'s CSV reader stops with the error shown. Close the quote, or double it ("") if it belongs in the value.',
      detail: last
        ? "EOF reached before closing an opened quote"
        : "The quote opens in the header row. EOF reached before closing an opened quote",
      ...(last ? { location: { row: last.number, line: last.line } } : {}),
    },
  ];
};

// Data Loader counts data rows from 0 in this message, so row 1 here is its row #0.
const rowCountExplanation =
  "Data Loader stops the whole operation at the first such row with the error shown, so no row after it loads; fix every row listed, as each would stop it in turn. Its row # counts data rows from 0 and skips blank lines, so it is one less than the row number here.";

export const columnCount: Check = (csv) => {
  if (!hasHeader(csv)) return [];
  const expected = csv.header.length;
  return csv.rows.flatMap((row) => {
    const actual = row.fields.length;
    const location = { row: row.number, line: row.line };
    const dataLoaderRow = row.number - 1;
    if (actual > expected) {
      return [
        {
          kind: "row-too-many-columns",
          severity: "error" as const,
          title: "Rows with more columns than the header",
          explanation: `${rowCountExplanation} A common cause is a value that contains the delimiter without double quotes around it.`,
          detail: `Error reading data row #${dataLoaderRow}: the number of columns (${actual}) exceeds the number of columns in the header (${expected})`,
          location,
        },
      ];
    }
    if (actual < expected) {
      return [
        {
          kind: "row-too-few-columns",
          severity: "error" as const,
          title: "Rows with fewer columns than the header",
          explanation: `${rowCountExplanation} Common causes are missing trailing delimiters, or a line break inside a value without double quotes around it, which splits one record over two lines.`,
          detail: `Error reading data row #${dataLoaderRow}: the number of columns (${actual}) is less than the number of columns in the header (${expected})`,
          location,
        },
      ];
    }
    return [];
  });
};

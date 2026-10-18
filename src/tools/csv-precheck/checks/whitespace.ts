// Spaces and line breaks inside values, which Data Loader keeps as written. See
// docs/research/data-loader-csv-facts.md section 5 and implications 10, 11 and 13.
import { rowList, type Check, type Finding } from "../findings";
import type { DataRow, ParsedCsv } from "../parse";

type Base = Pick<Finding, "kind" | "severity" | "title" | "explanation">;

// One finding per column holding values that match, with their rows and the first value.
function perColumn(
  csv: ParsedCsv,
  matches: (row: DataRow, column: number) => boolean,
  base: Base,
): Finding[] {
  const header = csv.header;
  if (!header) return [];
  return header.flatMap((name, column) => {
    const rows = csv.rows.filter((row) => matches(row, column));
    if (rows.length === 0) return [];
    const example = JSON.stringify(rows[0].fields[column]);
    return [
      {
        ...base,
        detail: `${rowList(rows.map((row) => row.number))}, such as ${example}`,
        location: { column: { index: column + 1, name } },
      },
    ];
  });
}

// Spaces, tabs and no-break spaces, all invisible in a cell; line breaks have their own check.
const SURROUNDING_SPACE = /^[ \t ]|[ \t ]$/;

export const surroundingSpaces: Check = (csv) => {
  // A space next to a quote is spaceAroundQuote's finding, not a value to keep.
  const nextToQuote = new Set(csv.spacedQuotes.map(({ row, column }) => `${row}:${column}`));
  return perColumn(
    csv,
    (row, column) =>
      SURROUNDING_SPACE.test(row.fields[column] ?? "") &&
      !nextToQuote.has(`${row.number}:${column}`),
    {
      kind: "surrounding-spaces",
      severity: "warning",
      title: "Values that start or end with spaces",
      explanation:
        "Data Loader does not trim field values (its date parser does), so these spaces are saved in Salesforce as part of the value, where they can break matching, reports and unique fields. This tool never changes values; remove the spaces in your spreadsheet if they are not meant to be there.",
    },
  );
};

export const spaceAroundQuote: Check = (csv) =>
  csv.spacedQuotes.map(({ row, line, column }) => {
    const name = csv.header?.[column] ?? "";
    const value = row === undefined ? undefined : csv.rows[row - 1].fields[column];
    return {
      kind: "space-around-quote",
      severity: "warning" as const,
      title: "Spaces next to double quotes",
      explanation:
        'A space sits between a delimiter and an opening double quote, or after a closing one, as in "John", "Smith". The Bulk API rejects such rows: “A space before or after a double quote generates an error for the row.” Remove the space; if it belongs in the value, put it inside the quotes.',
      detail: value === undefined ? "In the header row" : JSON.stringify(value),
      location: {
        ...(row === undefined ? {} : { row }),
        line,
        column: { index: column + 1, name },
      },
    };
  });

export const lineBreaks: Check = (csv) =>
  perColumn(csv, (row, column) => /[\r\n]/.test(row.fields[column] ?? ""), {
    kind: "line-breaks",
    severity: "info",
    title: "Values that span more than one line",
    explanation:
      "These values hold line breaks, which load as multi-line text; inside double quotes that is valid CSV. Check that each is meant to be multi-line: a field that takes one line, such as a name or picklist, should not hold one.",
  });

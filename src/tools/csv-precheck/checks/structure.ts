// File-structure checks. Data Loader's texts are verbatim from its messages.properties,
// see docs/research/data-loader-csv-facts.md sections 2 and 5.
import type { Check } from "../findings";
import type { ParsedCsv } from "../parse";

// A header made of one empty cell is a blank first line, not a header with a blank column.
function hasHeader(csv: ParsedCsv): csv is ParsedCsv & { header: string[] } {
  return csv.header !== null && !(csv.header.length === 1 && csv.header[0].trim() === "");
}

export const missingHeader: Check = (csv) => {
  if (csv.header === null) {
    return [
      {
        kind: "empty-file",
        severity: "error",
        title: "The file is empty",
        explanation:
          "Data Loader needs a header row naming the fields, then one row per record. This file has neither.",
      },
    ];
  }
  if (!hasHeader(csv)) {
    return [
      {
        kind: "no-header",
        severity: "error",
        title: "No header row",
        explanation:
          "The first line is blank. Data Loader reads the first line as the header row of field names, so it cannot map any column.",
      },
    ];
  }
  return [];
};

export const emptyHeaderCell: Check = (csv) => {
  if (!hasHeader(csv)) return [];
  return csv.header.flatMap((name, i) =>
    name.trim() === ""
      ? [
          {
            kind: "empty-header-cell",
            severity: "error" as const,
            title: "A header cell is empty",
            explanation:
              "Data Loader reports “An empty column is found in the header row”. A column without a name cannot be mapped to a field, so its values are not loaded. Name the column or delete it, including stray delimiters at the end of the header line.",
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
    if (name.trim() === "") return;
    const key = name.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), i]);
  });
  return [...byName.values()]
    .filter((indexes) => indexes.length > 1)
    .map((indexes) => ({
      kind: "duplicate-header",
      severity: "error" as const,
      title: "Two or more columns have the same name",
      explanation:
        "Salesforce field names ignore case, so these columns all point at the same field. Data Loader maps each field to one column, so the values in the other columns are not loaded, and it is easy to load the wrong one. Rename or remove the extra columns.",
      // The detail names every column involved, so there is no single location.
      detail: `Columns ${indexes.map((i) => `${i + 1} "${csv.header[i]}"`).join(", ")}`,
    }));
};

export const columnCount: Check = (csv) => {
  if (!hasHeader(csv)) return [];
  const expected = csv.header.length;
  return csv.rows.flatMap((row) => {
    const actual = row.fields.length;
    if (actual > expected) {
      return [
        {
          kind: "row-too-many-columns",
          severity: "error" as const,
          title: "Rows with more columns than the header",
          explanation:
            "Data Loader rejects each of these rows with the error shown and does not load it; some versions refuse the whole file as “Invalid CSV file format”. Usually a value contains the delimiter but is not wrapped in double quotes.",
          detail: `Error reading data row #${row.number}: the number of columns (${actual}) exceeds the number of columns in the header (${expected})`,
          location: { row: row.number },
        },
      ];
    }
    if (actual < expected) {
      return [
        {
          kind: "row-too-few-columns",
          severity: "error" as const,
          title: "Rows with fewer columns than the header",
          explanation:
            "Data Loader rejects each of these rows with the error shown and does not load it. Usually the row is blank, is missing trailing delimiters, or a line break inside a value is not wrapped in double quotes, splitting one record over two lines.",
          detail: `Error reading data row #${row.number}: the number of columns (${actual}) is less than the number of columns in the header (${expected})`,
          location: { row: row.number },
        },
      ];
    }
    return [];
  });
};

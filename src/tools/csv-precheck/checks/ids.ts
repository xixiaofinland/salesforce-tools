// Salesforce ID checks on the columns idColumns finds. See
// docs/research/data-loader-csv-facts.md sections 2 to 4 and implications 6 to 9.
import { rowList, type Check, type Finding } from "../findings";
import {
  checksum,
  idColumns,
  is15,
  is18,
  isEmptyValue,
  isRecordIdName,
  isWellFormedId,
  type IdColumn,
} from "../ids";
import type { DataRow, ParsedCsv } from "../parse";

type Base = Pick<Finding, "kind" | "severity" | "title" | "explanation">;

// Each ID column with its header name and the rows' values in it.
function eachIdColumn<T>(
  csv: ParsedCsv,
  visit: (column: IdColumn, value: (row: DataRow) => string) => T[],
): T[] {
  return idColumns(csv).flatMap((column) =>
    visit({ column, name: csv.header![column] }, (row) => row.fields[column] ?? ""),
  );
}

const at = (row: DataRow, { column, name }: IdColumn) => ({
  row: row.number,
  line: row.line,
  column: { index: column + 1, name },
});

const MALFORMED: Base = {
  kind: "malformed-id",
  severity: "error",
  title: "Malformed Salesforce IDs",
  explanation:
    "A Salesforce ID is 15 or 18 letters and digits. For rows with these values Data Loader reports “MALFORMED_ID: Object name id: id value of incorrect type” on insert or update, and “MALFORMED_ID: bad id” on delete. A spreadsheet that cuts IDs short or reads them as numbers is a common cause; copy the IDs again from a Salesforce export.",
};

export const malformedIds: Check = (csv) =>
  eachIdColumn(csv, (column, value) =>
    csv.rows.flatMap((row) => {
      const v = value(row);
      if (isEmptyValue(v) || isWellFormedId(v)) return [];
      const problem = /^[A-Za-z0-9]*$/.test(v)
        ? `${v.length} character${v.length === 1 ? "" : "s"}, not 15 or 18`
        : "holds a character other than a letter or digit";
      return [
        { ...MALFORMED, detail: `${JSON.stringify(v)}: ${problem}`, location: at(row, column) },
      ];
    }),
  );

const CHECKSUM: Base = {
  kind: "id-checksum",
  severity: "warning",
  title: "18-character IDs with the wrong suffix",
  explanation:
    "The last 3 characters of an 18-character ID record the letter case of its first 15. In these IDs they do not match: the suffix is wrong, or letters in the first 15 changed case after the ID was exported. The API documents an 18-character ID as needing a valid suffix; whether Data Loader rejects these is unconfirmed. Copy the IDs again from a Salesforce export.",
};

export const idChecksum: Check = (csv) =>
  eachIdColumn(csv, (column, value) =>
    csv.rows.flatMap((row) => {
      const v = value(row);
      if (!is18(v)) return [];
      // The suffix itself is case-insensitive, like the rest of an 18-character ID.
      const expected = checksum(v.slice(0, 15));
      const suffix = v.slice(15);
      if (suffix.toUpperCase() === expected) return [];
      const detail = `${JSON.stringify(v)} ends in "${suffix}", but its first 15 characters give "${expected}"`;
      return [{ ...CHECKSUM, detail, location: at(row, column) }];
    }),
  );

export const mixedIdLengths: Check = (csv) =>
  eachIdColumn(csv, (column, value) => {
    const short = csv.rows.filter((row) => is15(value(row))).map((row) => row.number);
    const long = csv.rows.filter((row) => is18(value(row))).map((row) => row.number);
    if (short.length === 0 || long.length === 0) return [];
    return [
      {
        kind: "mixed-id-lengths",
        severity: "warning" as const,
        title: "Columns mixing 15- and 18-character IDs",
        explanation:
          "Data Loader accepts both lengths, but a mix often means the IDs were gathered from different places, and the 15-character ones break if a spreadsheet changes their letter case. Converting them gives every ID 18 characters.",
        detail: `15 characters: ${rowList(short)}; 18 characters: ${rowList(long)}`,
        location: { column: { index: column.column + 1, name: column.name } },
      },
    ];
  });

export const caseOnlyIds: Check = (csv) =>
  eachIdColumn(csv, (column, value) => {
    // Rows by exact value, within groups of values equal ignoring case.
    const groups = new Map<string, Map<string, number[]>>();
    for (const row of csv.rows) {
      const v = value(row);
      if (!is15(v)) continue;
      const key = v.toLowerCase();
      const group = groups.get(key) ?? new Map<string, number[]>();
      groups.set(key, group);
      const rows = group.get(v);
      if (rows) rows.push(row.number);
      else group.set(v, [row.number]);
    }
    return [...groups.values()]
      .filter((group) => group.size > 1)
      .map((group) => ({
        kind: "id-case-only",
        severity: "warning" as const,
        title: "15-character IDs that differ only in letter case",
        explanation:
          "15-character IDs are case-sensitive, so these name different records. Spreadsheets and other tools can change letter case and turn one ID into another, so check each against Salesforce, and use 18-character IDs, which do not depend on case.",
        detail: [...group]
          .map(([id, rows]) => `${JSON.stringify(id)} in ${rowList(rows)}`)
          .join("; "),
        location: { column: { index: column.column + 1, name: column.name } },
      }));
  });

// Only the record's own ID is required; an empty lookup is allowed.
export const missingIds: Check = (csv) =>
  (csv.header ?? []).flatMap((name, column) => {
    if (!isRecordIdName(name)) return [];
    const rows = csv.rows.filter((row) => isEmptyValue(row.fields[column] ?? ""));
    if (rows.length === 0) return [];
    return [
      {
        kind: "missing-id",
        severity: "warning" as const,
        title: "Empty values in the Id column",
        explanation:
          "For an update or delete, Data Loader reports “MISSING_ARGUMENT: Id not specified in an update call” for each of these rows. An insert leaves Id empty, so ignore this if you are inserting.",
        detail: rowList(rows.map((row) => row.number)),
        location: { column: { index: column + 1, name } },
      },
    ];
  });

// Duplicate checks: whole rows repeated, and repeated values in a key column the user picks.
import { formatLocation, rowList, type Check, type Finding } from "../findings";
import type { DataRow, ParsedCsv } from "../parse";

export interface KeyColumn {
  // 0-based position in the header.
  column: number;
  ignoreCaseAndSpaces: boolean;
}

// Rows sharing a key, in order of each group's first row; groups of one are dropped.
function repeats(rows: DataRow[], keyOf: (row: DataRow) => string | null): DataRow[][] {
  const groups = new Map<string, DataRow[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key === null) continue;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

export const duplicateRows: Check = (csv) =>
  // JSON keeps field boundaries, so "1,2" + "3" differs from "1" + "2,3".
  repeats(csv.rows, (row) => JSON.stringify(row.fields)).map((group) => ({
    kind: "duplicate-row",
    severity: "warning" as const,
    title: "Rows repeated exactly",
    explanation:
      "These rows are identical in every column. Inserting the file creates one record per row, so each group becomes duplicate records. Delete the extra copies unless you mean to load each one.",
    detail: rowList(group.map((row) => row.number)),
  }));

export function comparisonMode({ ignoreCaseAndSpaces }: KeyColumn): string {
  return ignoreCaseAndSpaces ? "ignoring letter case and surrounding spaces" : "exactly as written";
}

// Not in CHECKS: it runs only once the user picks a key column, and again on each change.
export function duplicateKeys(csv: ParsedCsv, key: KeyColumn): Finding[] {
  const name = csv.header?.[key.column];
  if (name === undefined) return [];
  const { column, ignoreCaseAndSpaces } = key;
  const valueOf = (row: DataRow) => row.fields[column] ?? "";
  // A value of only spaces is as empty as none in either mode, and empties never match.
  const keyOf = (row: DataRow) => {
    const value = valueOf(row);
    if (value.trim() === "") return null;
    return ignoreCaseAndSpaces ? value.trim().toLowerCase() : value;
  };
  const where = formatLocation({ column: { index: column + 1, name } });
  return repeats(csv.rows, keyOf).map((group) => ({
    kind: "duplicate-key",
    severity: "warning" as const,
    title: `Repeated values in key ${where}`,
    explanation: `Values were compared ${comparisonMode(key)}. If this column is the external ID or another unique field you upsert or insert on, rows sharing a value can fail or end up updating the same record; otherwise they may create duplicate records. Keep one row per value, or check that each repeat is intended.`,
    detail: `${JSON.stringify(valueOf(group[0]))}: ${rowList(group.map((row) => row.number))}`,
  }));
}

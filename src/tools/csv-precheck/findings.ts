import type { ParsedCsv } from "./parse";

export type Severity = "error" | "warning" | "info";

export interface Location {
  // Data row from 1, as DataRow.number, and the file line it starts on.
  row?: number;
  line?: number;
  // 1-based position in the header, with the header's name for it.
  column?: { index: number; name: string };
}

// One problem at one place. Findings of the same kind share severity, title and
// explanation, so the report can show them as one group.
export interface Finding {
  kind: string;
  severity: Severity;
  title: string;
  explanation: string;
  // This instance's detail, such as Data Loader's error text with its numbers filled in.
  detail?: string;
  location?: Location;
}

// A check reads the parsed file and returns what it found, or nothing.
export type Check = (csv: ParsedCsv) => Finding[];

export interface FindingGroup {
  kind: string;
  severity: Severity;
  title: string;
  explanation: string;
  count: number;
  examples: { detail?: string; location?: Location }[];
}

export const EXAMPLES_PER_GROUP = 5;

const SEVERITY_ORDER: Severity[] = ["error", "warning", "info"];

export function groupFindings(findings: Finding[]): FindingGroup[] {
  const groups = new Map<string, FindingGroup>();
  for (const f of findings) {
    let group = groups.get(f.kind);
    if (!group) {
      const { kind, severity, title, explanation } = f;
      group = { kind, severity, title, explanation, count: 0, examples: [] };
      groups.set(f.kind, group);
    }
    group.count++;
    if (group.examples.length < EXAMPLES_PER_GROUP) {
      group.examples.push({ detail: f.detail, location: f.location });
    }
  }
  return [...groups.values()].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
}

export function formatLocation(location: Location): string {
  const parts: string[] = [];
  if (location.row !== undefined) {
    parts.push(
      location.line === undefined
        ? `Row ${location.row}`
        : `Row ${location.row} (line ${location.line})`,
    );
  }
  if (location.column) {
    const { index, name } = location.column;
    parts.push(name.trim() === "" ? `column ${index}` : `column ${index} "${name}"`);
  }
  return parts.join(", ");
}

const ROWS_LISTED = 10;

// Row numbers for a detail, the first few and a count of the rest.
export function rowList(numbers: number[]): string {
  const shown = numbers.slice(0, ROWS_LISTED).join(", ");
  const more = numbers.length - ROWS_LISTED;
  const label = numbers.length === 1 ? "Row" : "Rows";
  return more > 0
    ? `${label} ${shown} and ${more.toLocaleString("en-US")} more`
    : `${label} ${shown}`;
}

import { CHECKS } from "./checks";
import { comparisonMode, duplicateKeys, type KeyColumn } from "./checks/duplicates";
import {
  formatLocation,
  groupFindings,
  type Check,
  type Finding,
  type FindingGroup,
} from "./findings";
import { parseCsv, type Delimiter, type ParsedCsv } from "./parse";

export interface Report {
  delimiter: Delimiter;
  // Data rows, not counting the header.
  rowCount: number;
  columnCount: number;
  groups: FindingGroup[];
  // The key column checked for repeated values, when the user picked one.
  key?: KeyColumn & { name: string };
}

// A file parsed and run through the checks once, so picking a key column only adds
// the key check rather than reading the file again.
export interface PreparedCsv {
  csv: ParsedCsv;
  findings: Finding[];
}

export const DELIMITER_NAMES: Record<Delimiter, string> = {
  ",": "comma",
  ";": "semicolon",
  "\t": "tab",
};

export function prepareCsv(text: string, checks: Check[] = CHECKS): PreparedCsv {
  const csv = parseCsv(text);
  return { csv, findings: checks.flatMap((check) => check(csv)) };
}

export function buildReport({ csv, findings }: PreparedCsv, key?: KeyColumn): Report {
  const name = key && csv.header?.[key.column];
  const keyed = key && name !== undefined ? { ...key, name } : undefined;
  return {
    delimiter: csv.delimiter,
    rowCount: csv.rows.length,
    columnCount: csv.header?.length ?? 0,
    groups: groupFindings(keyed ? [...findings, ...duplicateKeys(csv, keyed)] : findings),
    ...(keyed ? { key: keyed } : {}),
  };
}

export function checkCsv(text: string, checks: Check[] = CHECKS): Report {
  return buildReport(prepareCsv(text, checks));
}

export function plural(n: number, word: string): string {
  return `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;
}

export function summaryLine(report: Report): string {
  return `${plural(report.rowCount, "row")}, ${plural(report.columnCount, "column")}, ${DELIMITER_NAMES[report.delimiter]}-delimited`;
}

// Says which key column was checked and how, so a report with no repeats still shows it.
export function keyLine(report: Report): string {
  if (!report.key) return "";
  const { column, name } = report.key;
  const where = formatLocation({ column: { index: column + 1, name } });
  return `Key ${where}, compared ${comparisonMode(report.key)}`;
}

export function exampleLine(example: FindingGroup["examples"][number]): string {
  const where = example.location ? formatLocation(example.location) : "";
  return [where, example.detail].filter(Boolean).join(": ");
}

export function renderText(fileName: string, report: Report): string {
  const lines = [`File: ${fileName}`, summaryLine(report)];
  if (report.key) lines.push(keyLine(report));
  lines.push("");
  if (report.groups.length === 0) lines.push("No problems found.");
  for (const group of report.groups) {
    lines.push(`[${group.severity.toUpperCase()}] ${group.title} (${group.count})`);
    lines.push(group.explanation);
    for (const example of group.examples) {
      const line = exampleLine(example);
      if (line) lines.push(`  - ${line}`);
    }
    const more = group.count - group.examples.length;
    if (more > 0) lines.push(`  ... and ${more.toLocaleString("en-US")} more`);
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

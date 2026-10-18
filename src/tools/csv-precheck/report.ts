import { CHECKS } from "./checks";
import { formatLocation, groupFindings, type Check, type FindingGroup } from "./findings";
import { parseCsv, type Delimiter } from "./parse";

export interface Report {
  delimiter: Delimiter;
  // Data rows, not counting the header.
  rowCount: number;
  columnCount: number;
  groups: FindingGroup[];
}

export const DELIMITER_NAMES: Record<Delimiter, string> = {
  ",": "comma",
  ";": "semicolon",
  "\t": "tab",
};

export function checkCsv(text: string, checks: Check[] = CHECKS): Report {
  const csv = parseCsv(text);
  return {
    delimiter: csv.delimiter,
    rowCount: csv.rows.length,
    columnCount: csv.header?.length ?? 0,
    groups: groupFindings(checks.flatMap((check) => check(csv))),
  };
}

export function plural(n: number, word: string): string {
  return `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;
}

export function summaryLine(report: Report): string {
  return `${plural(report.rowCount, "row")}, ${plural(report.columnCount, "column")}, ${DELIMITER_NAMES[report.delimiter]}-delimited`;
}

export function exampleLine(example: FindingGroup["examples"][number]): string {
  const where = example.location ? formatLocation(example.location) : "";
  return [where, example.detail].filter(Boolean).join(": ");
}

export function renderText(fileName: string, report: Report): string {
  const lines = [`File: ${fileName}`, summaryLine(report), ""];
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

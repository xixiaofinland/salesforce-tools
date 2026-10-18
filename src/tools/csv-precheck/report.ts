import { CHECKS } from "./checks";
import { dateChecks } from "./checks/dates";
import { comparisonMode, duplicateKeys, type KeyColumn } from "./checks/duplicates";
import { encodingChecks } from "./checks/encoding";
import { batchLimit } from "./checks/size";
import {
  formatLocation,
  groupFindings,
  type Check,
  type Finding,
  type FindingGroup,
} from "./findings";
import { dateColumns, type DateSettings } from "./dates";
import { idColumns, type IdColumn } from "./ids";
import { DELIMITER_NAMES, parseCsv, type Delimiter, type ParsedCsv } from "./parse";

export interface Report {
  delimiter: Delimiter;
  // Data rows, not counting the header.
  rowCount: number;
  columnCount: number;
  groups: FindingGroup[];
  // Columns read as Salesforce IDs, by name or by their values.
  idColumns: IdColumn[];
  // Columns read as dates, and the setting their slash dates were judged by.
  dateColumns: IdColumn[];
  european: boolean;
  // The key column checked for repeated values, when the user picked one.
  key?: KeyColumn & { name: string };
}

// A file parsed and run through the checks once, so picking a key column only adds
// the key check rather than reading the file again.
export interface PreparedCsv {
  csv: ParsedCsv;
  findings: Finding[];
}

// size is the file's length in bytes; without it, the text's length in UTF-8.
export function prepareCsv(
  text: string,
  checks: Check[] = CHECKS,
  size = new TextEncoder().encode(text).byteLength,
): PreparedCsv {
  const csv = parseCsv(text);
  return { csv, findings: [...checks.flatMap((check) => check(csv)), ...batchLimit(csv, size)] };
}

// A file as opened: its bytes are checked for encoding, then decoded as file.text()
// would, dropping a byte order mark and replacing bytes that are not UTF-8.
export function prepareFile(bytes: Uint8Array, checks: Check[] = CHECKS): PreparedCsv {
  const { csv, findings } = prepareCsv(new TextDecoder().decode(bytes), checks, bytes.byteLength);
  return { csv, findings: [...encodingChecks(bytes, csv), ...findings] };
}

// Data Loader's default: Use European date format is off.
export const DEFAULT_DATE_SETTINGS: DateSettings = { european: false };

// The key column and the date setting are the user's choices, so their checks run here, on
// every change, rather than once in prepareCsv.
export function buildReport(
  { csv, findings }: PreparedCsv,
  key?: KeyColumn,
  dates: DateSettings = DEFAULT_DATE_SETTINGS,
): Report {
  const name = key && csv.header?.[key.column];
  const keyed = key && name !== undefined ? { ...key, name } : undefined;
  const named = (column: number) => ({ column, name: csv.header![column] });
  return {
    delimiter: csv.delimiter,
    rowCount: csv.rows.length,
    columnCount: csv.header?.length ?? 0,
    idColumns: idColumns(csv).map(named),
    dateColumns: dateColumns(csv).map(named),
    european: dates.european,
    groups: groupFindings([
      ...findings,
      ...dateChecks(csv, dates),
      ...(keyed ? duplicateKeys(csv, keyed) : []),
    ]),
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

function columnList(label: string, columns: IdColumn[]): string {
  const where = columns.map(({ column, name }) =>
    formatLocation({ column: { index: column + 1, name } }),
  );
  return `${label} ${where.length === 1 ? "column" : "columns"}: ${where.join(", ")}`;
}

// Says which columns the ID checks ran on, so a report with no ID problems still shows it.
export function idLine(report: Report): string {
  return report.idColumns.length === 0 ? "" : columnList("ID", report.idColumns);
}

// Says which columns the date checks ran on, and how slash dates were read.
export function dateLine(report: Report): string {
  if (report.dateColumns.length === 0) return "";
  const setting = `Use European date format ${report.european ? "on" : "off"}`;
  return `${columnList("Date", report.dateColumns)} (${setting})`;
}

export function exampleLine(example: FindingGroup["examples"][number]): string {
  const where = example.location ? formatLocation(example.location) : "";
  return [where, example.detail].filter(Boolean).join(": ");
}

export function renderText(fileName: string, report: Report): string {
  const lines = [`File: ${fileName}`, summaryLine(report)];
  if (report.idColumns.length > 0) lines.push(idLine(report));
  if (report.dateColumns.length > 0) lines.push(dateLine(report));
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

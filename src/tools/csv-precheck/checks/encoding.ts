// Encoding checks on the file's bytes, docs/research/data-loader-csv-facts.md section 5
// and implication 10.
import type { Finding } from "../findings";
import type { ParsedCsv } from "../parse";

const startsWithBom = (bytes: Uint8Array) =>
  bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;

// Offset of the first byte that does not start a well-formed UTF-8 sequence, or -1.
// Overlong forms, surrogates and code points past U+10FFFF are ill-formed, as a strict
// decoder treats them.
export function firstInvalidUtf8(bytes: Uint8Array): number {
  let i = 0;
  while (i < bytes.length) {
    const lead = bytes[i];
    if (lead < 0x80) {
      i++;
      continue;
    }
    const length = lead >= 0xc2 && lead <= 0xdf ? 2 : lead >= 0xe0 && lead <= 0xef ? 3 : 4;
    if (lead < 0xc2 || lead > 0xf4 || i + length > bytes.length) return i;
    // The second byte's range narrows after these leads, ruling out the forms above.
    const low = lead === 0xe0 ? 0xa0 : lead === 0xf0 ? 0x90 : 0x80;
    const high = lead === 0xed ? 0x9f : lead === 0xf4 ? 0x8f : 0xbf;
    if (bytes[i + 1] < low || bytes[i + 1] > high) return i;
    for (let k = 2; k < length; k++) if ((bytes[i + k] & 0xc0) !== 0x80) return i;
    i += length;
  }
  return -1;
}

const hex = (byte: number) => `0x${byte.toString(16).toUpperCase().padStart(2, "0")}`;

// Not in CHECKS: a check sees only the decoded text, and these need the file's bytes.
export function encodingChecks(bytes: Uint8Array, csv: ParsedCsv): Finding[] {
  const findings: Finding[] = [];
  if (startsWithBom(bytes)) {
    findings.push({
      kind: "utf8-bom",
      severity: "error",
      title: "The file starts with a byte order mark",
      explanation:
        "The file begins with a UTF-8 byte order mark (BOM), invisible bytes that Excel's “CSV UTF-8” format and some editors add. Salesforce knowledge article 000383918 says Data Loader version 28 and later does not support such files and stops with the error shown; whether current versions still reject a BOM is unconfirmed. To be safe, save the file without one: in Notepad choose the encoding “UTF-8” rather than “UTF-8 with BOM”, in VS Code use Save with Encoding and “UTF-8”, or download it as CSV from Google Sheets.",
      detail:
        "CSV Error: Invalid CSV file format. Please select a different file. Error getting header row from the CSV file",
    });
  }
  const offset = firstInvalidUtf8(bytes);
  if (offset >= 0) {
    let line = 1;
    for (let i = 0; i < offset; i++) if (bytes[i] === 0x0a) line++;
    const row = csv.rows.findLast((r) => r.line <= line);
    const what = `byte ${hex(bytes[offset])} on line ${line} is not valid UTF-8`;
    findings.push({
      kind: "not-utf8",
      severity: "error",
      title: "The file is not UTF-8",
      explanation:
        "The Bulk API requires that “Files must be in UTF-8 format”, and Data Loader can be set to read every file as UTF-8. This file holds bytes that are not UTF-8, usually because it was saved as plain “CSV (Comma delimited)”, which uses an older encoding such as Windows-1252; accented letters and symbols such as é, ü, € or curly quotes would then load garbled or as �. Only the first such place is shown. In Excel, save the file as “CSV UTF-8 (Comma delimited)” instead; that format adds a byte order mark, so check the file again and remove the mark if it is reported.",
      detail: row ? what[0].toUpperCase() + what.slice(1) : `In the header row: ${what}`,
      ...(row ? { location: { row: row.number, line: row.line } } : {}),
    });
  }
  return findings;
}

// Splits a file into parts of at most N data rows, each starting with the header row.
import { recordSpans, type Delimiter } from "./parse";

// windows-1252 decodes every byte to exactly one character and leaves ASCII as it is, so
// the record scanner finds the same boundaries as in the UTF-8 text and its offsets are
// byte offsets. The parts are cut from the file's own bytes, whatever its encoding, so
// quoting, line endings and a byte order mark come through unchanged.
export function splitCsv(
  file: Uint8Array,
  delimiter: Delimiter,
  rowsPerFile: number,
): Uint8Array[] {
  if (!Number.isInteger(rowsPerFile) || rowsPerFile < 1) {
    throw new RangeError(`Rows per file must be a whole number of at least 1: ${rowsPerFile}`);
  }
  const text = new TextDecoder("windows-1252").decode(file);
  const [header, ...rows] = recordSpans(text, delimiter).filter((r) => !r.blank);
  if (!header || rows.length === 0) return [];
  const head = file.subarray(header.start, header.end);
  const parts: Uint8Array[] = [];
  for (let i = 0; i < rows.length; i += rowsPerFile) {
    // A part runs to where the next one's first row starts, so blank lines between rows
    // stay where they were and the last part ends exactly as the file does.
    const end = i + rowsPerFile < rows.length ? rows[i + rowsPerFile].start : file.length;
    const body = file.subarray(rows[i].start, end);
    const part = new Uint8Array(head.length + body.length);
    part.set(head);
    part.set(body, head.length);
    parts.push(part);
  }
  return parts;
}

export function baseName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

// Numbered from 001, padded so the names sort in order however many parts there are.
export function partName(fileName: string, index: number, total: number): string {
  const digits = Math.max(3, String(total).length);
  return `${baseName(fileName)}-part-${String(index + 1).padStart(digits, "0")}.csv`;
}

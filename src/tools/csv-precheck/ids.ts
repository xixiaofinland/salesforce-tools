// Salesforce record IDs: their shape, the 15 to 18 character checksum, and which columns
// hold them. See docs/research/data-loader-csv-facts.md sections 3 and 4.
import type { ParsedCsv } from "./parse";

export interface IdColumn {
  // 0-based position in the header.
  column: number;
  name: string;
}

const SUFFIX_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";

// The 3 characters an 18-character ID adds to its first 15: for each block of 5, a bit per
// upper-case letter A to Z, read as an index into SUFFIX_CHARS (KB 000385066).
export function checksum(id15: string): string {
  let suffix = "";
  for (let block = 0; block < 3; block++) {
    let bits = 0;
    for (let position = 0; position < 5; position++) {
      const ch = id15[block * 5 + position];
      if (ch >= "A" && ch <= "Z") bits += 1 << position;
    }
    suffix += SUFFIX_CHARS[bits];
  }
  return suffix;
}

export function to18(id15: string): string {
  return id15 + checksum(id15);
}

// The API's rule for MALFORMED_ID: "An ID must be either 15 characters, or 18 characters".
export function isWellFormedId(value: string): boolean {
  return /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/.test(value);
}

export const is15 = (value: string) => value.length === 15 && isWellFormedId(value);
export const is18 = (value: string) => value.length === 18 && isWellFormedId(value);

// A value too blank to be an ID: checked as missing, never as malformed.
export const isEmptyValue = (value: string) => value.trim() === "";

// Id, or a name ending in Id as a word: AccountId, OwnerID, Account_ID. Matching any
// ending in the letters i, d would take in Paid or Valid, whose values would all read as
// malformed IDs; a lower-case accountid is still found by its values.
export function isIdName(name: string): boolean {
  const n = name.trim();
  return /^id$/i.test(n) || /Id$/.test(n) || /[a-z]ID$/.test(n) || /[^A-Za-z]id$/i.test(n);
}

// 15 or 18 letters and digits with at least one of each, so 15-digit numbers and 15-letter
// words do not pass for IDs.
const looksLikeId = (value: string) =>
  isWellFormedId(value) && /[A-Za-z]/.test(value) && /[0-9]/.test(value);

// Parsed files are never changed after parsing, so each one's ID columns are worked out
// once however many checks ask.
const cache = new WeakMap<ParsedCsv, number[]>();

// 0-based positions of the columns holding IDs: by header name, or because more than half
// of their non-empty values look like IDs.
export function idColumns(csv: ParsedCsv): number[] {
  const cached = cache.get(csv);
  if (cached) return cached;
  const columns = (csv.header ?? []).flatMap((name, column) => {
    if (isIdName(name)) return [column];
    let filled = 0;
    let like = 0;
    for (const row of csv.rows) {
      const value = row.fields[column] ?? "";
      if (isEmptyValue(value)) continue;
      filled++;
      if (looksLikeId(value)) like++;
    }
    return like * 2 > filled ? [column] : [];
  });
  cache.set(csv, columns);
  return columns;
}

// How many values the 15 to 18 conversion would change.
export function convertibleIds(csv: ParsedCsv, columns: number[]): number {
  let count = 0;
  for (const row of csv.rows) {
    for (const column of columns) if (is15(row.fields[column] ?? "")) count++;
  }
  return count;
}

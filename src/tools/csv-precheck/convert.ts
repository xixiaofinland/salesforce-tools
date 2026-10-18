// Converts the 15-character IDs in a file's ID columns to 18 characters, changing nothing else.
import { is15, to18 } from "./ids";
import { fieldRecords, type Delimiter } from "./parse";
import { baseName } from "./split";

// As in splitCsv, windows-1252 maps each byte to one character, so offsets in the text are
// offsets in the file, and the file's own bytes are copied around each ID. An ID is ASCII
// letters and digits, so it reads the same in any encoding, and so do the 3 bytes added.
export function convertIds(
  file: Uint8Array,
  delimiter: Delimiter,
  columns: number[],
): Uint8Array<ArrayBuffer> {
  const text = new TextDecoder("windows-1252").decode(file);
  const [, ...rows] = fieldRecords(text, delimiter).filter((r) => !r.blank);
  // Where each suffix goes: just after the ID, inside its quotes if it has them.
  const inserts: { at: number; suffix: string }[] = [];
  for (const row of rows) {
    for (const column of columns) {
      const value = row.fields[column];
      if (value === undefined || !is15(value)) continue;
      const start = row.fieldStarts[column];
      const at = start + (text[start] === '"' ? 1 : 0) + value.length;
      inserts.push({ at, suffix: to18(value).slice(15) });
    }
  }
  inserts.sort((a, b) => a.at - b.at);

  const out = new Uint8Array(file.length + inserts.length * 3);
  let read = 0;
  let write = 0;
  for (const { at, suffix } of inserts) {
    out.set(file.subarray(read, at), write);
    write += at - read;
    for (let i = 0; i < 3; i++) out[write++] = suffix.charCodeAt(i);
    read = at;
  }
  out.set(file.subarray(read), write);
  return out;
}

export function convertedName(fileName: string): string {
  return `${baseName(fileName)}-18-char-ids.csv`;
}

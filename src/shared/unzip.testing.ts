// A minimal zip reader for tests, written from the format spec rather than from zip.ts so
// it can disagree with it. It reads stored (uncompressed) entries only, through the
// central directory as unzip tools do, and checks each entry's CRC with Node's own.
import { crc32 } from "node:zlib";

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export function unzip(zip: Uint8Array): ZipEntry[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const eocd = zip.byteLength - 22;
  if (view.getUint32(eocd, true) !== 0x06054b50) throw new Error("no end of central directory");
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error("bad central directory entry");
    if (view.getUint16(at + 10, true) !== 0) throw new Error("entry is not stored");
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));

    if (view.getUint32(local, true) !== 0x04034b50) throw new Error(`bad local header: ${name}`);
    const localName = view.getUint16(local + 26, true);
    const localExtra = view.getUint16(local + 28, true);
    const start = local + 30 + localName + localExtra;
    const data = zip.subarray(start, start + size);
    if (crc32(data) !== crc) throw new Error(`CRC mismatch: ${name}`);
    entries.push({ name, data });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

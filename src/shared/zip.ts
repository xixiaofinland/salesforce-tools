// Builds a zip archive in memory, so tools can hand the user several files as one
// download without a library or a network request. Entries are stored uncompressed,
// which every unzip tool reads. Format: PKWARE APPNOTE.TXT, sections 4.3 and 4.4.

export interface ZipFile {
  name: string;
  data: Uint8Array;
}

// Without zip64 extensions, counts are 16-bit and sizes and offsets 32-bit.
const MAX_FILES = 0xffff;
const MAX_BYTES = 0xffffffff;

// General purpose flag bit 11: names are UTF-8.
const UTF8_NAMES = 0x0800;
// Version 1.0 is enough to extract stored entries.
const VERSION = 10;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// MS-DOS date and time, in local time as unzip tools show it.
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export function createZip(files: ZipFile[], modified = new Date()): Uint8Array<ArrayBuffer> {
  if (files.length > MAX_FILES) {
    throw new RangeError(`A zip holds at most ${MAX_FILES.toLocaleString("en-US")} files`);
  }
  const stamp = dosDateTime(modified);
  const entries = files.map((file) => ({
    name: new TextEncoder().encode(file.name),
    data: file.data,
    crc: crc32(file.data),
  }));
  const localSize = entries.reduce((sum, e) => sum + 30 + e.name.length + e.data.length, 0);
  const centralSize = entries.reduce((sum, e) => sum + 46 + e.name.length, 0);
  if (localSize + centralSize > MAX_BYTES) throw new RangeError("A zip holds at most 4 GB");

  const zip = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(zip.buffer);
  let at = 0;
  const u16 = (value: number) => {
    view.setUint16(at, value, true);
    at += 2;
  };
  const u32 = (value: number) => {
    view.setUint32(at, value, true);
    at += 4;
  };
  const bytes = (data: Uint8Array) => {
    zip.set(data, at);
    at += data.length;
  };
  // The fields local and central headers share, from "version needed" to the name's length.
  const common = (e: (typeof entries)[number]) => {
    u16(VERSION);
    u16(UTF8_NAMES);
    u16(0); // method: stored
    u16(stamp.time);
    u16(stamp.date);
    u32(e.crc);
    u32(e.data.length); // compressed size
    u32(e.data.length); // uncompressed size
    u16(e.name.length);
    u16(0); // extra field length
  };

  const offsets: number[] = [];
  for (const e of entries) {
    offsets.push(at);
    u32(0x04034b50);
    common(e);
    bytes(e.name);
    bytes(e.data);
  }
  entries.forEach((e, n) => {
    u32(0x02014b50);
    u16(VERSION); // version made by
    common(e);
    u16(0); // comment length
    u16(0); // disk number
    u16(0); // internal attributes
    u32(0); // external attributes
    u32(offsets[n]);
    bytes(e.name);
  });
  u32(0x06054b50);
  u16(0); // this disk
  u16(0); // disk with the central directory
  u16(entries.length);
  u16(entries.length);
  u32(centralSize);
  u32(localSize);
  u16(0); // comment length
  return zip;
}

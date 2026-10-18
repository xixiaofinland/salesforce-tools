import { describe, expect, it } from "vitest";
import { unzip } from "./unzip.testing";
import { createZip } from "./zip";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("createZip", () => {
  it("holds each file under its name with its exact bytes", () => {
    const files = [
      { name: "a-part-001.csv", data: bytes("Id\r\n1\r\n") },
      { name: "a-part-002.csv", data: Uint8Array.from([0x49, 0x64, 0x0a, 0xe9, 0x0a]) },
      { name: "empty.txt", data: new Uint8Array() },
    ];
    expect(unzip(createZip(files))).toEqual(files);
  });

  it("stores names that are not ASCII as UTF-8", () => {
    const zip = createZip([{ name: "Société-part-001.csv", data: bytes("x") }]);
    expect(unzip(zip).map((e) => e.name)).toEqual(["Société-part-001.csv"]);
  });

  it("matches a known-good CRC-32", () => {
    const zip = createZip([{ name: "a", data: bytes("123456789") }]);
    // The CRC-32 check value from the zip spec's polynomial, at offset 14 of the local header.
    expect(new DataView(zip.buffer).getUint32(14, true)).toBe(0xcbf43926);
  });

  it("refuses more files than a zip without zip64 can list", () => {
    const files = Array.from({ length: 65536 }, (_, i) => ({
      name: `${i}`,
      data: new Uint8Array(),
    }));
    expect(() => createZip(files)).toThrow(RangeError);
  });
});

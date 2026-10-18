import { describe, expect, it } from "vitest";
import { parseCsv } from "../parse";
import { encodingChecks, firstInvalidUtf8 } from "./encoding";

const BOM = [0xef, 0xbb, 0xbf];
const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...Buffer.from(p)] : p)));
const run = (data: Uint8Array) => encodingChecks(data, parseCsv(new TextDecoder().decode(data)));

describe("encodingChecks", () => {
  it("flags a byte order mark with the KB article's error", () => {
    expect(run(bytes(BOM, "Id,Name\n1,Acme\n"))).toMatchObject([
      {
        kind: "utf8-bom",
        severity: "error",
        detail:
          "CSV Error: Invalid CSV file format. Please select a different file. Error getting header row from the CSV file",
        explanation: expect.stringContaining("unconfirmed"),
      },
    ]);
  });

  it("flags bytes that are not UTF-8 at the first row holding them", () => {
    // "Café" and "Müller" saved as Windows-1252.
    const data = bytes("Id,Name\n1,Acme\n\n2,Caf", [0xe9], "\n3,M", [0xfc], "ller\n");
    expect(run(data)).toMatchObject([
      {
        kind: "not-utf8",
        severity: "error",
        location: { row: 2, line: 4 },
        detail: "Byte 0xE9 on line 4 is not valid UTF-8",
        explanation: expect.stringContaining("CSV UTF-8"),
      },
    ]);
  });

  it("names the row where a multi-line value holds the bad byte", () => {
    const data = bytes('Id,Note\n1,"one\ntw', [0x96], 'o"\n');
    expect(run(data)).toMatchObject([
      { location: { row: 1, line: 2 }, detail: "Byte 0x96 on line 3 is not valid UTF-8" },
    ]);
  });

  it("says so when the bad byte is in the header", () => {
    expect(run(bytes("Id,Pr", [0xe9], "nom\n1,x\n"))).toMatchObject([
      { detail: "In the header row: byte 0xE9 on line 1 is not valid UTF-8" },
    ]);
  });

  it("reports both a byte order mark and bad bytes", () => {
    const kinds = run(bytes(BOM, "Id\n", [0xff], "\n")).map((f) => f.kind);
    expect(kinds).toEqual(["utf8-bom", "not-utf8"]);
  });

  it("accepts valid UTF-8, including accents, symbols and emoji", () => {
    expect(run(bytes("Id,Name\n1,Café €5 Müller 😀\n2,#N/A\n"))).toEqual([]);
  });
});

describe("firstInvalidUtf8", () => {
  it("finds the offset of the first invalid sequence", () => {
    expect(firstInvalidUtf8(bytes("ab", [0x80], "c"))).toBe(2);
    // Overlong "/", a UTF-16 surrogate, and a code point past U+10FFFF.
    expect(firstInvalidUtf8(bytes([0xc0, 0xaf]))).toBe(0);
    expect(firstInvalidUtf8(bytes("a", [0xed, 0xa0, 0x80]))).toBe(1);
    expect(firstInvalidUtf8(bytes([0xf4, 0x90, 0x80, 0x80]))).toBe(0);
  });

  it("flags a sequence cut off at the end of the file", () => {
    expect(firstInvalidUtf8(bytes("ab", [0xe2, 0x82]))).toBe(2);
  });

  it("returns -1 for valid UTF-8", () => {
    expect(firstInvalidUtf8(bytes("é€😀"))).toBe(-1);
    expect(firstInvalidUtf8(new Uint8Array())).toBe(-1);
  });
});

import { describe, expect, it } from "vitest";
import { partName, splitCsv } from "./split";

const bytes = (text: string) => new TextEncoder().encode(text);
const texts = (parts: Uint8Array[]) => parts.map((p) => new TextDecoder().decode(p));

describe("splitCsv", () => {
  it("starts every part with the header and keeps rows in order", () => {
    const parts = splitCsv(bytes("Id,Name\n1,a\n2,b\n3,c\n4,d\n5,e\n"), ",", 2);
    expect(texts(parts)).toEqual(["Id,Name\n1,a\n2,b\n", "Id,Name\n3,c\n4,d\n", "Id,Name\n5,e\n"]);
  });

  it("keeps a quoted value with a line break whole at a part boundary", () => {
    const parts = splitCsv(bytes('Id,Note\n1,a\n2,"line 1\nline 2"\n3,c\n'), ",", 2);
    expect(texts(parts)).toEqual(['Id,Note\n1,a\n2,"line 1\nline 2"\n', "Id,Note\n3,c\n"]);
  });

  it("keeps quoting, the delimiter and CRLF line endings exactly as written", () => {
    const text = 'Id;"Na;me"\r\n1;"a ""b"""\r\n2;x\r\n3;"y\r\nz"';
    expect(texts(splitCsv(bytes(text), ";", 1))).toEqual([
      'Id;"Na;me"\r\n1;"a ""b"""\r\n',
      'Id;"Na;me"\r\n2;x\r\n',
      'Id;"Na;me"\r\n3;"y\r\nz"',
    ]);
  });

  it("gives back the file's data rows, byte for byte, when the parts' rows are joined", () => {
    const header = "Id,Name\n";
    const rows = Array.from({ length: 25 }, (_, i) =>
      i % 7 === 3 ? `${i},"multi\nline, ""quoted"""\n` : `${i},row ${i}\n`,
    ).join("");
    const parts = texts(splitCsv(bytes(header + rows), ",", 10));
    expect(parts).toHaveLength(3);
    expect(parts.every((p) => p.startsWith(header))).toBe(true);
    expect(parts.map((p) => p.slice(header.length)).join("")).toBe(rows);
  });

  it("copies bytes that are not UTF-8, and a byte order mark, unchanged", () => {
    // A byte order mark, then "Société" in windows-1252, where é is the single byte 0xE9.
    const head = [0xef, 0xbb, 0xbf, ...bytes("Id,Name\n")];
    const row1 = [...bytes("1,Soci"), 0xe9, ...bytes("t"), 0xe9, ...bytes("\n")];
    const file = Uint8Array.from([...head, ...row1, ...bytes("2,b\n")]);
    const [first, second] = splitCsv(file, ",", 1);
    expect([...first]).toEqual([...head, ...row1]);
    expect([...second]).toEqual([...head, ...bytes("2,b\n")]);
  });

  it("counts only data rows, leaving blank lines where they were", () => {
    const parts = splitCsv(bytes("\nId\n\n1\n2\n\n3\n\n"), ",", 2);
    expect(texts(parts)).toEqual(["Id\n1\n2\n\n", "Id\n3\n\n"]);
  });

  it("has nothing to split in a file with no data rows", () => {
    expect(splitCsv(bytes("Id,Name\n"), ",", 10)).toEqual([]);
    expect(splitCsv(bytes(""), ",", 10)).toEqual([]);
  });

  it("refuses a row count below one or with a fraction", () => {
    expect(() => splitCsv(bytes("a\n1\n"), ",", 0)).toThrow(RangeError);
    expect(() => splitCsv(bytes("a\n1\n"), ",", 1.5)).toThrow(RangeError);
  });
});

describe("partName", () => {
  it("numbers parts from 001 after the file's name without its extension", () => {
    expect(partName("accounts.csv", 0, 3)).toBe("accounts-part-001.csv");
    expect(partName("accounts.csv", 2, 3)).toBe("accounts-part-003.csv");
    expect(partName("q1.accounts.txt", 0, 1)).toBe("q1.accounts-part-001.csv");
    expect(partName("accounts", 0, 1)).toBe("accounts-part-001.csv");
  });

  it("pads to the widest part number so the names sort in order", () => {
    expect(partName("a.csv", 8, 1200)).toBe("a-part-0009.csv");
  });
});

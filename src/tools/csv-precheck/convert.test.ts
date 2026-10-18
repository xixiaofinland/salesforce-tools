import { describe, expect, it } from "vitest";
import { convertIds, convertedName } from "./convert";

const bytes = (text: string) => new TextEncoder().encode(text);
const convert = (text: string, columns: number[], delimiter: "," | ";" | "\t" = ",") =>
  new TextDecoder().decode(convertIds(bytes(text), delimiter, columns));

describe("convertIds", () => {
  it("converts every 15-character ID in the given columns to 18", () => {
    const text = "Id,Name,AccountId\n001D000000IqhSL,Acme,001R0000005hDFY\n00300000003T2PG,Beta,\n";
    expect(convert(text, [0, 2])).toBe(
      "Id,Name,AccountId\n001D000000IqhSLIAZ,Acme,001R0000005hDFYIA2\n00300000003T2PGAA0,Beta,\n",
    );
  });

  it("leaves other columns, the header, 18-character and malformed IDs as they are", () => {
    const text =
      "001xx000003DHur,Ref\n001xx000003DHurAAG,001xx000003DHur\n001xx000003DHu,x\n 01xx000003DHur,y\n";
    expect(convert(text, [0])).toBe(text);
  });

  it("keeps quotes, the delimiter and CRLF line endings exactly as written", () => {
    const text = 'Id;"Na;me"\r\n"001xx000003DHur";"a ""b"""\r\n001D000000IqhSL;"x\r\ny"';
    expect(convert(text, [0], ";")).toBe(
      'Id;"Na;me"\r\n"001xx000003DHurAAG";"a ""b"""\r\n001D000000IqhSLIAZ;"x\r\ny"',
    );
  });

  it("finds the right row after quoted line breaks and blank lines", () => {
    const text = 'Note,Id\n"two\nlines",001D000000IqhSL\n\n"",001R0000005hDFY\n';
    expect(convert(text, [1])).toBe(
      'Note,Id\n"two\nlines",001D000000IqhSLIAZ\n\n"",001R0000005hDFYIA2\n',
    );
  });

  it("copies a byte order mark and bytes that are not UTF-8 unchanged", () => {
    const file = Uint8Array.from([
      ...[0xef, 0xbb, 0xbf],
      ...bytes("Id,Name\n001D000000IqhSL,Soci"),
      0xe9,
      ...bytes("t\n"),
    ]);
    expect([...convertIds(file, ",", [0])]).toEqual([
      ...[0xef, 0xbb, 0xbf],
      ...bytes("Id,Name\n001D000000IqhSLIAZ,Soci"),
      0xe9,
      ...bytes("t\n"),
    ]);
  });

  it("gives the file back unchanged when it has no 15-character IDs", () => {
    expect(convert("Id\n001D000000IqhSLIAZ\n", [0])).toBe("Id\n001D000000IqhSLIAZ\n");
    expect(convert("", [0])).toBe("");
  });
});

describe("convertedName", () => {
  it("adds a suffix before the extension", () => {
    expect(convertedName("accounts.csv")).toBe("accounts-18-char-ids.csv");
    expect(convertedName("accounts")).toBe("accounts-18-char-ids.csv");
  });
});

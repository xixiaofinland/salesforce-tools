import { describe, expect, it } from "vitest";
import { checksum, convertibleIds, idColumns, isIdName, isWellFormedId, to18 } from "./ids";
import { parseCsv } from "./parse";

// The verified pairs from docs/research/data-loader-csv-facts.md section 3. KB 000385008's
// example is left out: it does not follow the documented algorithm.
const PAIRS = [
  ["001D000000IqhSL", "001D000000IqhSLIAZ"],
  ["001R0000005hDFY", "001R0000005hDFYIA2"],
  ["00300000003T2PG", "00300000003T2PGAA0"],
  ["001xx000003DHur", "001xx000003DHurAAG"],
];

describe("checksum", () => {
  it.each(PAIRS)("gives %s the suffix Salesforce publishes", (id15, id18) => {
    expect(checksum(id15)).toBe(id18.slice(15));
    expect(to18(id15)).toBe(id18);
  });

  it("counts only A to Z as upper case", () => {
    expect(checksum("000000000000000")).toBe("AAA");
    expect(checksum("aaaaaaaaaaaaaaa")).toBe("AAA");
    expect(checksum("AAAAAAAAAAAAAAA")).toBe("555");
    expect(checksum("A0000B0000C0000")).toBe("BBB");
    expect(checksum("0000A0000A0000A")).toBe("QQQ");
  });
});

describe("isWellFormedId", () => {
  it("accepts 15 or 18 letters and digits", () => {
    expect(isWellFormedId("001D000000IqhSL")).toBe(true);
    expect(isWellFormedId("001D000000IqhSLIAZ")).toBe(true);
  });

  it("rejects other lengths and other characters", () => {
    for (const value of ["", "001D000000IqhS", "001D000000IqhSLI", "001D000000IqhSLIA"]) {
      expect(isWellFormedId(value)).toBe(false);
    }
    expect(isWellFormedId("001D000000Iqh-L")).toBe(false);
    expect(isWellFormedId(" 01D000000IqhSL")).toBe(false);
    expect(isWellFormedId("001D000000IqhSé")).toBe(false);
  });
});

describe("isIdName", () => {
  it("matches Id and names ending in Id", () => {
    for (const name of [
      "Id",
      "id",
      "ID",
      " Id ",
      "AccountId",
      "OwnerID",
      "Account_ID",
      "Owner.id",
    ]) {
      expect(isIdName(name)).toBe(true);
    }
  });

  it("leaves words that merely end in the letters i, d alone", () => {
    for (const name of ["Paid", "Valid", "PAID", "Android", "Name", "Ident", "UUID", ""]) {
      expect(isIdName(name)).toBe(false);
    }
  });
});

describe("idColumns", () => {
  it("finds columns by name, whatever their values", () => {
    const csv = parseCsv("Id,Name,AccountId\n1,a,\n");
    expect(idColumns(csv)).toEqual([0, 2]);
  });

  it("finds a column where most values look like IDs", () => {
    const csv = parseCsv(
      "Parent__c,Code,Words\n001D000000IqhSL,123456789012345,Internationally\n001R0000005hDFYIA2,123456789012346,Characteristics\nbad,,\n",
    );
    expect(idColumns(csv)).toEqual([0]);
  });

  it("needs more than half of the non-empty values to look like IDs", () => {
    const half = parseCsv("Ref\n001D000000IqhSL\nx\n");
    const most = parseCsv("Ref\n001D000000IqhSL\n001R0000005hDFY\nx\n\n");
    expect(idColumns(half)).toEqual([]);
    expect(idColumns(most)).toEqual([0]);
  });

  it("finds nothing without a header", () => {
    expect(idColumns(parseCsv(""))).toEqual([]);
  });
});

describe("convertibleIds", () => {
  it("counts the well-formed 15-character values in the given columns", () => {
    const csv = parseCsv(
      "Id,Ref\n001D000000IqhSL,001R0000005hDFY\n001D000000IqhSLIAZ,x\n001D000000IqhS,\n",
    );
    expect(convertibleIds(csv, [0])).toBe(1);
    expect(convertibleIds(csv, [0, 1])).toBe(2);
  });
});

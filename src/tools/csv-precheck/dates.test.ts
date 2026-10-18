import { describe, expect, it } from "vitest";
import { dateColumns, parseDate, slashParts } from "./dates";
import { parseCsv } from "./parse";

const US = { european: false };
const EU = { european: true };

describe("parseDate", () => {
  // Every format in docs/research/data-loader-csv-facts.md section 1, in its order.
  it.each([
    ["2024-01-15T10:30:00.000+0100", "yyyy-MM-ddTHH:mm:ss.SSS+/-HHmm"],
    ["2024-01-15T10:30:00.000-0800", "yyyy-MM-ddTHH:mm:ss.SSS-HHmm"],
    ["2024-01-15T10:30:00.000Z", "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"],
    ["2024-01-15T10:30:00.000 Pacific Standard Time", "SSS Pacific Standard Time"],
    ["2024-01-15T10:30:00.000Pacific Standard Time", "SSSPacific Standard Time"],
    ["2024-01-15T10:30:00.000 PST", "SSS PST"],
    ["2024-01-15T10:30:00.000PST", "SSSPST"],
    ["2024-01-15T10:30:00.000 GMT-08:00", "SSS GMT-08:00"],
    ["2024-01-15T10:30:00.000GMT-08:00", "SSSGMT-08:00"],
    ["2024-01-15T10:30:00.000 -800", "SSS -800"],
    ["2024-01-15T10:30:00.000-800", "SSS-800"],
    ["2024-01-15T10:30:00", "yyyy-MM-dd'T'HH:mm:ss"],
    ["2024-01-15 10:30:00", "yyyy-MM-dd HH:mm:ss"],
    ["20240115T10:30:00", "yyyyMMdd'T'HH:mm:ss"],
    ["2024-01-15", "yyyy-MM-dd"],
    ["01/15/2024 10:30:00", "MM/dd/yyyy HH:mm:ss"],
    ["01/15/2024", "MM/dd/yyyy"],
    ["20240115", "yyyyMMdd"],
    // KB 000385167 and KB 000383025.
    ["2024-01-15T10:30:00Z", "yyyy-MM-ddThh:mm:ssZ"],
    ["1999-01-01T23:01:01+0100", "KB 000383025 option 1"],
    ["1999-01-01T23:01:01GMT+01:00", "KB 000383025 option 2"],
    // Data Loader strips a trailing Z from any value and reads it as GMT.
    ["2024-01-15 10:30:00Z", "yyyy-MM-dd HH:mm:ss with Z"],
  ])("accepts %s (%s)", (value) => {
    expect(parseDate(value, US)).toMatchObject({ colonOffset: false });
  });

  it("reads the date and the time as written", () => {
    expect(parseDate("2024-01-15T10:30:05.250Z", US)).toEqual({
      year: 2024,
      month: 1,
      day: 15,
      time: { hour: 10, minute: 30, second: 5, millisecond: 250 },
      colonOffset: false,
    });
    expect(parseDate("20240115", US)).toEqual({
      year: 2024,
      month: 1,
      day: 15,
      colonOffset: false,
    });
  });

  it("reads slash dates month first, or day first with the European setting", () => {
    expect(parseDate("02/03/2024", US)).toMatchObject({ month: 2, day: 3 });
    expect(parseDate("02/03/2024", EU)).toMatchObject({ month: 3, day: 2 });
    expect(parseDate("15/01/2024 10:30:00", EU)).toMatchObject({ month: 1, day: 15 });
    expect(parseDate("15/01/2024", US)).toBeNull();
    expect(parseDate("01/15/2024", EU)).toBeNull();
  });

  it("parses a colon offset but marks it, as Data Loader may reject it", () => {
    expect(parseDate("1999-01-01T23:01:01+01:00", US)).toMatchObject({ colonOffset: true });
    expect(parseDate("1999-01-01T23:01:01.000-05:30", US)).toMatchObject({ colonOffset: true });
  });

  it("ignores surrounding spaces, which Data Loader trims", () => {
    expect(parseDate(" 2024-01-15 ", US)).toMatchObject({ year: 2024 });
  });

  it("accepts one-digit parts where they are separated, as Data Loader's parser does", () => {
    expect(parseDate("1/5/2024", US)).toMatchObject({ month: 1, day: 5 });
    expect(parseDate("2024-1-5 9:05:00", US)).toMatchObject({ month: 1, day: 5 });
    expect(parseDate("1/5/24", US)).toMatchObject({ year: 24 });
  });

  it.each([
    ["2024-02-30", "no such day"],
    ["2023-02-29", "not a leap year"],
    ["1900-02-29", "1900 is not a leap year"],
    ["2024-13-01", "no month 13"],
    ["2024-00-10", "no month 0"],
    ["2024-04-31", "April has 30 days"],
    ["13/45/2020", "no such month or day"],
    ["2024-01-15T24:00:00", "no hour 24"],
    ["2024-01-15T10:60:00", "no minute 60"],
    ["2024-01-15T10:30:60", "no second 60"],
    ["2024-01-15T10:30:00.1234Z", "four digits of milliseconds"],
    ["2024-01-15T10:30:00.000+2500", "no offset hour 25"],
    ["2024-01-15x", "trailing text"],
    ["x2024-01-15", "leading text"],
    ["2024-01-15T10:30", "no seconds"],
    ["2024-01", "month only"],
    ["2024", "year only"],
    ["2024/01/15", "year first with slashes"],
    ["15.01.2024", "dots"],
    ["Jan 15, 2024", "month name"],
    ["202401151", "nine digits"],
    ["20240115 10:30:00", "compact date with a space"],
    ["", "empty"],
  ])("rejects %s (%s)", (value) => {
    expect(parseDate(value, US)).toBeNull();
  });

  it("accepts 29 February in a leap year", () => {
    expect(parseDate("2024-02-29", US)).toMatchObject({ month: 2, day: 29 });
    expect(parseDate("2000-02-29", US)).toMatchObject({ month: 2, day: 29 });
  });
});

describe("slashParts", () => {
  it("returns the two parts before the year of a slash date, with or without a time", () => {
    expect(slashParts("13/02/2024")).toEqual([13, 2]);
    expect(slashParts("2/13/2024 10:00:00")).toEqual([2, 13]);
    expect(slashParts(" 2/13/2024 10:00:00Z")).toEqual([2, 13]);
    expect(slashParts("2024-02-13")).toBeUndefined();
  });
});

describe("dateColumns", () => {
  const columns = (text: string) => dateColumns(parseCsv(text));

  it("finds columns where most non-empty values are dates in either slash order", () => {
    const text = [
      "Name,Close,Start,Note,Born",
      "a,2024-01-15,13/02/2024,2024-01-15,",
      "b,2024-02-30,14/02/2024,hello,#N/A",
      "c,2024-03-01,02/13/2024,there,1990-05-01",
    ].join("\n");
    expect(columns(text)).toEqual([1, 2, 4]);
  });

  it("needs more than half of the non-empty values to be dates", () => {
    expect(columns("A\n2024-01-15\nx\n")).toEqual([]);
    expect(columns("A\n2024-01-15\n2024-01-16\nx\n")).toEqual([0]);
  });

  it("leaves numbers and text alone", () => {
    expect(columns("No,Amount,Name\n12345678,1.5,Acme\n99999999,2,Beta\n")).toEqual([]);
  });
});

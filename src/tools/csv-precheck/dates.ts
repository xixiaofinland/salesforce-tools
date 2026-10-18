// Dates and datetimes in the formats Data Loader accepts, and which columns hold them. See
// docs/research/data-loader-csv-facts.md section 1 and implications 1 to 5.
import type { ParsedCsv } from "./parse";

export interface DateSettings {
  // Data Loader's "Use European date format": slash dates are dd/MM/yyyy rather than MM/dd/yyyy.
  european: boolean;
}

export interface Time {
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

export interface ParsedDate {
  year: number;
  month: number;
  day: number;
  time?: Time;
  // An offset written +01:00, which KB 000383025 says Data Loader rejects.
  colonOffset: boolean;
}

// Data Loader's parser is not lenient but ignores the pattern's letter count where a field
// stands apart, so 1/5/2024 and 2024-1-5 read like 01/05/2024 and 2024-01-05. Fields run
// together, as in yyyyMMdd, need every digit.
const SEPARATED_DATE = String.raw`(\d{1,4})-(\d{1,2})-(\d{1,2})`;
const COMPACT_DATE = String.raw`(\d{4})(\d{2})(\d{2})`;
const SLASH_DATE = String.raw`(\d{1,2})/(\d{1,2})/(\d{1,4})`;
const TIME = String.raw`(\d{1,2}):(\d{1,2}):(\d{1,2})`;

// After yyyy-MM-ddTHH:mm:ss(.SSS): +0100 or -800, GMT-08:00, a zone name such as PST or
// Pacific Standard Time, each optionally after a space; or +01:00, which is marked.
const ZONE = String.raw`(?: ?(?:([+-])(\d{1,2})(\d{2})|GMT[+-](\d{1,2}):(\d{2})|[A-Z]{2,5}|[A-Z][a-z]+(?: [A-Z][a-z]+)* Time)|([+-])(\d{2}):(\d{2}))?`;

const FORMATS = {
  isoT: new RegExp(`^${SEPARATED_DATE}T${TIME}(?:\\.(\\d{1,3}))?${ZONE}$`),
  isoSpace: new RegExp(`^${SEPARATED_DATE}(?: ${TIME})?$`),
  compact: new RegExp(`^${COMPACT_DATE}(?:T${TIME})?$`),
  slash: new RegExp(`^${SLASH_DATE}(?: ${TIME})?$`),
};

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

function daysIn(year: number, month: number): number {
  if (month === 2) return isLeap(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

const realDate = (y: number, m: number, d: number) =>
  y >= 1 && m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m);

const realOffset = (hours: string, minutes: string) => Number(hours) <= 23 && Number(minutes) <= 59;

function readTime(parts: (string | undefined)[], millis?: string): Time | null | undefined {
  const [h, m, s] = parts;
  if (h === undefined) return undefined;
  const time = {
    hour: Number(h),
    minute: Number(m),
    second: Number(s),
    millisecond: millis === undefined ? 0 : Number(millis),
  };
  return time.hour <= 23 && time.minute <= 59 && time.second <= 59 ? time : null;
}

function build(
  year: number,
  month: number,
  day: number,
  time: Time | null | undefined,
  colonOffset = false,
): ParsedDate | null {
  if (time === null || !realDate(year, month, day)) return null;
  return { year, month, day, ...(time ? { time } : {}), colonOffset };
}

// The value read the way Data Loader would, or null when it would report "Failed to parse
// date". Like Data Loader it trims the value and reads a trailing Z as GMT.
export function parseDate(value: string, { european }: DateSettings): ParsedDate | null {
  const v = value.trim().replace(/[zZ]$/, "");
  let m = FORMATS.isoT.exec(v);
  if (m) {
    const [, y, mo, d, h, mi, s, ms, , oh, om, gh, gm, , ch, cm] = m;
    if (oh !== undefined && !realOffset(oh, om)) return null;
    if (gh !== undefined && !realOffset(gh, gm)) return null;
    if (ch !== undefined && !realOffset(ch, cm)) return null;
    return build(+y, +mo, +d, readTime([h, mi, s], ms), ch !== undefined);
  }
  m = FORMATS.isoSpace.exec(v) ?? FORMATS.compact.exec(v);
  if (m) {
    const [, y, mo, d, h, mi, s] = m;
    return build(+y, +mo, +d, readTime([h, mi, s]));
  }
  m = FORMATS.slash.exec(v);
  if (m) {
    const [, a, b, y, h, mi, s] = m;
    const [month, day] = european ? [+b, +a] : [+a, +b];
    return build(+y, month, day, readTime([h, mi, s]));
  }
  return null;
}

// The two numbers before the year in a slash date, whose order the European setting decides.
export function slashParts(value: string): [number, number] | undefined {
  const m = FORMATS.slash.exec(value.trim());
  return m ? [Number(m[1]), Number(m[2])] : undefined;
}

// Empty values, and #N/A, the Bulk API's null token, are not dates to check.
export const isBlankDate = (value: string) => value.trim() === "" || value.trim() === "#N/A";

// A date in some reading: slash dates count in either order, since the setting decides
// which one is right, and a value in the other order is a finding, not a non-date.
const readsAsDate = (value: string) =>
  parseDate(value, { european: false }) !== null || parseDate(value, { european: true }) !== null;

// Parsed files are never changed after parsing, so each one's date columns are worked out
// once however many checks ask.
const cache = new WeakMap<ParsedCsv, number[]>();

// 0-based positions of the columns where more than half of the non-empty values are dates.
export function dateColumns(csv: ParsedCsv): number[] {
  const cached = cache.get(csv);
  if (cached) return cached;
  const columns = (csv.header ?? []).flatMap((_, column) => {
    let filled = 0;
    let dates = 0;
    for (const row of csv.rows) {
      const value = row.fields[column] ?? "";
      if (isBlankDate(value)) continue;
      filled++;
      if (readsAsDate(value)) dates++;
    }
    return dates * 2 > filled ? [column] : [];
  });
  cache.set(csv, columns);
  return columns;
}

// Date and datetime checks on the columns dateColumns finds, judged by Data Loader's "Use
// European date format" setting, so they run on every change of it rather than once per
// file. See docs/research/data-loader-csv-facts.md section 1 and implications 1 to 5.
import { rowList, type Finding } from "../findings";
import {
  dateColumns,
  isBlankDate,
  parseDate,
  slashParts,
  type DateSettings,
  type ParsedDate,
  type Time,
} from "../dates";
import type { DataRow, ParsedCsv } from "../parse";

type Base = Pick<Finding, "kind" | "severity" | "title" | "explanation">;

interface DateColumn {
  column: number;
  name: string;
  // The column's non-blank values, trimmed as Data Loader trims them, with their rows and
  // their reading under the current setting, parsed once for every check.
  values: { row: DataRow; value: string; date: ParsedDate | null }[];
}

const at = (row: DataRow, { column, name }: DateColumn) => ({
  row: row.number,
  line: row.line,
  column: { index: column + 1, name },
});

const whole = ({ column, name }: DateColumn) => ({ column: { index: column + 1, name } });

const INVALID: Base = {
  kind: "invalid-date",
  severity: "error",
  title: "Values Data Loader cannot read as dates",
  explanation:
    "Most values in these columns are dates, but these match none of the formats Data Loader accepts, or name a day or time that does not exist, such as 2024-02-30. Use yyyy-MM-dd for a date and yyyy-MM-ddTHH:mm:ss.SSS+0000 for a date and time. Slash dates are read as MM/dd/yyyy, or as dd/MM/yyyy when Use European date format is on.",
};

function invalidDates(column: DateColumn): Finding[] {
  return column.values
    .filter(({ date }) => date === null)
    .map(({ row, value }) => ({
      ...INVALID,
      detail: `Error converting value to correct data type: Failed to parse date: ${value}`,
      location: at(row, column),
    }));
}

const RANGE: Base = {
  kind: "date-out-of-range",
  severity: "error",
  title: "Dates outside the range Salesforce stores",
  explanation:
    "Salesforce takes dates from 1700-01-01 to 4000-12-31. A year written with two digits, such as 1/5/24, reads as the year 24; write all four digits.",
};

const pad = (n: number, width = 2) => String(n).padStart(width, "0");
const isoDate = ({ year, month, day }: ParsedDate) => `${pad(year, 4)}-${pad(month)}-${pad(day)}`;

// Fixed-width yyyy-MM-dd strings compare as text.
const EARLIEST = "1700-01-01";
const LATEST = "4000-12-31";

function outOfRange(column: DateColumn): Finding[] {
  return column.values.flatMap(({ row, value, date }) => {
    if (!date) return [];
    const iso = isoDate(date);
    const side = iso < EARLIEST ? `before ${EARLIEST}` : iso > LATEST ? `after ${LATEST}` : "";
    if (!side) return [];
    const detail = `${JSON.stringify(value)} is ${iso}, ${side}`;
    return [{ ...RANGE, detail, location: at(row, column) }];
  });
}

const COLON: Base = {
  kind: "date-colon-offset",
  severity: "warning",
  title: "Time zone offsets with a colon",
  explanation:
    "An offset such as +01:00 is fine for the Salesforce APIs, but Data Loader's own parser can fail on it with “Error converting value to correct data type: Failed to parse date” (KB 000383025). Remove the colon, as in +0100, or put GMT before it, as in GMT+01:00.",
};

function colonOffsets(column: DateColumn): Finding[] {
  const found = column.values.filter(({ date }) => date?.colonOffset);
  if (found.length === 0) return [];
  const example = found[0].value;
  const offset = /[+-]\d{2}:\d{2}$/;
  const fixed = [
    example.replace(offset, (o) => o.replace(":", "")),
    example.replace(offset, (o) => `GMT${o}`),
  ];
  const rows = rowList(found.map(({ row }) => row.number));
  return [
    {
      ...COLON,
      detail: `${rows}, such as ${JSON.stringify(example)}: write ${fixed.map((f) => JSON.stringify(f)).join(" or ")}`,
      location: whole(column),
    },
  ];
}

const CONFLICT: Base = {
  kind: "date-order-conflict",
  severity: "error",
  title: "Slash dates in the other order from the European setting",
  explanation:
    "Data Loader reads every slash date in one order: MM/dd/yyyy, or dd/MM/yyyy when Use European date format is on in its Settings. A value whose first part is over 12 can only be day first, and one whose second part is over 12 can only be month first. Values in the other order fail to load, and the ones that fit both orders load with day and month swapped. Change the setting to match the file, or rewrite the dates as yyyy-MM-dd.",
};

const AMBIGUOUS: Base = {
  kind: "date-order-ambiguous",
  severity: "warning",
  title: "Slash dates that read either way",
  explanation:
    "No value in these columns has a part over 12, so nothing shows whether they are month first or day first, and Data Loader goes by its Use European date format setting. Check that the reading below is what the file means, or rewrite the dates as yyyy-MM-dd.",
};

const ORDER = {
  dayFirst: { label: "day first (dd/MM/yyyy)", short: "day first" },
  monthFirst: { label: "month first (MM/dd/yyyy)", short: "month first" },
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const onOff = ({ european }: DateSettings) => (european ? "on" : "off");

function slashOrder(column: DateColumn, settings: DateSettings): Finding[] {
  const slashed = column.values.flatMap((entry) => {
    const parts = slashParts(entry.value);
    return parts ? [{ ...entry, parts }] : [];
  });
  if (slashed.length === 0) return [];
  // Only a value that is a real date in its order decides it.
  const dayFirst = slashed.find(
    ({ value, parts }) => parts[0] > 12 && parseDate(value, { european: true }),
  );
  const monthFirst = slashed.find(
    ({ value, parts }) => parts[1] > 12 && parseDate(value, { european: false }),
  );
  const [wrong, wrongOrder, other, otherOrder] = settings.european
    ? [monthFirst, ORDER.monthFirst, dayFirst, ORDER.dayFirst]
    : [dayFirst, ORDER.dayFirst, monthFirst, ORDER.monthFirst];
  if (wrong) {
    let detail = `${JSON.stringify(wrong.value)} can only be ${wrongOrder.label}, but Use European date format is ${onOff(settings)}`;
    if (other) {
      detail += `; row ${other.row.number} ${JSON.stringify(other.value)} can only be ${otherOrder.short}, so the column mixes both orders`;
    }
    return [{ ...CONFLICT, detail, location: at(wrong.row, column) }];
  }
  if (dayFirst || monthFirst) return [];
  const example = slashed.find(({ date }) => date);
  if (!example) return [];
  const { day, month, year } = example.date!;
  return [
    {
      ...AMBIGUOUS,
      detail: `With Use European date format ${onOff(settings)}, Data Loader reads ${JSON.stringify(example.value)} as ${day} ${MONTHS[month - 1]} ${year}`,
      location: whole(column),
    },
  ];
}

const TIMED: Base = {
  kind: "date-with-time",
  severity: "warning",
  title: "Date columns with times",
  explanation:
    "These columns look like Date fields, which hold no time of day, but values carry a time, or are exactly midnight. Data Loader reads a time without its own zone in its Time Zone setting, or the computer's, so the date stored can be a day earlier or later than written: KB 000385167 has 2011-01-10 00:00:00 showing as 2011-01-09. If the column loads into a Date field, write plain yyyy-MM-dd values.",
};

// Standard Salesforce fields named ...Date that hold a date and time.
const DATETIME_FIELDS = new Set([
  "createddate",
  "lastmodifieddate",
  "lastvieweddate",
  "lastreferenceddate",
]);

// CloseDate, Birthdate, Close_Date__c or Due Date, but not StartDateTime or CreatedDate.
function isDateOnlyName(name: string): boolean {
  const n = name.trim().replace(/__c$/i, "").replace(/[\s_]/g, "").toLowerCase();
  return n.endsWith("date") && !n.includes("time") && !DATETIME_FIELDS.has(n);
}

const isMidnight = ({ hour, minute, second, millisecond }: Time) =>
  hour === 0 && minute === 0 && second === 0 && millisecond === 0;

function timesInDates(column: DateColumn): Finding[] {
  const timed = column.values.flatMap(({ row, value, date }) =>
    date?.time ? [{ row, value, time: date.time }] : [],
  );
  if (timed.length === 0) return [];
  if (!isDateOnlyName(column.name) && !timed.every(({ time }) => isMidnight(time))) return [];
  const rows = rowList(timed.map(({ row }) => row.number));
  return [
    {
      ...TIMED,
      detail: `${rows}, such as ${JSON.stringify(timed[0].value)}`,
      location: whole(column),
    },
  ];
}

const DATE_CHECKS = [invalidDates, outOfRange, slashOrder, colonOffsets, timesInDates];

export function dateChecks(csv: ParsedCsv, settings: DateSettings): Finding[] {
  const columns: DateColumn[] = dateColumns(csv).map((column) => ({
    column,
    name: csv.header![column],
    values: csv.rows
      .map((row) => ({ row, value: (row.fields[column] ?? "").trim() }))
      .filter(({ value }) => !isBlankDate(value))
      .map((entry) => ({ ...entry, date: parseDate(entry.value, settings) })),
  }));
  return DATE_CHECKS.flatMap((check) => columns.flatMap((column) => check(column, settings)));
}

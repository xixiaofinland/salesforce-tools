// A 100,000-row, 20-column file for the speed and responsiveness tests, built in the test
// rather than committed. Its rows hold IDs, dates and datetimes, and a few rows hold one
// problem of each kind the checks find.
import { to18 } from "./ids";

export const LARGE_ROWS = 100_000;

const HEADER = [
  "Id",
  "AccountId",
  "OwnerId",
  "Name",
  "StageName",
  "CloseDate",
  "CreatedDate",
  "Amount",
  "Probability",
  "Description",
  "Email",
  "Phone",
  "City",
  "Country",
  "Ref__c",
  "Type",
  "LeadSource",
  "NextStep",
  "Region__c",
  "Notes__c",
];

const id15 = (prefix: string, n: number) => `${prefix}${String(n).padStart(12, "0")}`;
const pad = (n: number) => String(n).padStart(2, "0");

function row(i: number): string[] {
  const month = (i % 12) + 1;
  const day = (i % 28) + 1;
  return [
    to18(id15("006", i)),
    id15("001", i % 5000),
    to18(id15("005", i % 50)),
    `Opportunity ${i}`,
    ["Prospecting", "Qualification", "Closed Won"][i % 3],
    `2024-${pad(month)}-${pad(day)}`,
    `2023-${pad(month)}-${pad(day)}T${pad(i % 24)}:${pad(i % 60)}:00.000Z`,
    String(i * 10),
    String(i % 101),
    `Deal number ${i} for the quarter`,
    `contact${i}@example.com`,
    `555-${String(i % 10000).padStart(4, "0")}`,
    ["Helsinki", "Tampere", "Turku", "Oulu"][i % 4],
    "Finland",
    `REF-${i}`,
    "New Customer",
    "Web",
    "Call back",
    ["North", "South"][i % 2],
    `Note ${i}`,
  ];
}

// Each problem replaces one row, so the file keeps its row count.
const PROBLEMS: Record<number, (fields: string[]) => string> = {
  // malformed-id: 14 characters.
  10: (f) => join([f[0].slice(0, 14), ...f.slice(1)]),
  // id-checksum: a wrong suffix.
  20: (f) => join([f[0].slice(0, 15) + "ZZZ", ...f.slice(1)]),
  // surrounding-spaces.
  30: (f) => join([...f.slice(0, 3), f[3] + " ", ...f.slice(4)]),
  // row-too-many-columns.
  40: (f) => join([...f, "extra"]),
  // row-too-few-columns.
  41: (f) => join(f.slice(0, 19)),
  // line-breaks.
  60: (f) => join([...f.slice(0, 9), '"Line one\nline two"', ...f.slice(10)]),
  // invalid-date.
  70: (f) => join([...f.slice(0, 5), "2024-02-30", ...f.slice(6)]),
  // date-order-conflict: one day-first and one month-first slash date.
  80: (f) => join([...f.slice(0, 5), "13/02/2024", ...f.slice(6)]),
  81: (f) => join([...f.slice(0, 5), "02/13/2024", ...f.slice(6)]),
  // space-around-quote.
  90: (f) => join([...f.slice(0, 12), ' "Tampere"', ...f.slice(13)]),
};

const join = (fields: string[]) => fields.join(",");

export function largeCsv(): string {
  const lines = [join(HEADER)];
  for (let i = 1; i <= LARGE_ROWS; i++) {
    // duplicate-row: row 50 repeats row 49.
    const fields = row(i === 50 ? 49 : i);
    lines.push(PROBLEMS[i]?.(fields) ?? join(fields));
  }
  return lines.join("\n") + "\n";
}

// The kinds the fixture is built to show, besides the size warnings.
export const LARGE_KINDS = [
  "malformed-id",
  "id-checksum",
  "surrounding-spaces",
  "row-too-many-columns",
  "row-too-few-columns",
  "duplicate-row",
  "line-breaks",
  "invalid-date",
  "date-order-conflict",
  "space-around-quote",
  "batch-limit",
];

export type Delimiter = "," | ";" | "\t";

export const DELIMITERS: readonly Delimiter[] = [",", ";", "\t"];

export const DELIMITER_NAMES: Record<Delimiter, string> = {
  ",": "comma",
  ";": "semicolon",
  "\t": "tab",
};

export interface DataRow {
  // Position among the data rows, from 1. Blank lines are skipped and not counted, as
  // Data Loader's CSV reader skips them (docs/research/data-loader-csv-facts.md §6).
  number: number;
  // Line in the file where the row starts, from 1; quoted line breaks and blank lines
  // make it differ from the row number.
  line: number;
  fields: string[];
}

// A space between a delimiter and an opening quote, or after a closing quote, which the
// Bulk API rejects (docs/research/data-loader-csv-facts.md section 5).
export interface SpacedQuote {
  // The data row, as DataRow.number; none when it is in the header.
  row?: number;
  line: number;
  // 0-based position of the field in its record.
  column: number;
}

export interface ParsedCsv {
  delimiter: Delimiter;
  // The first non-blank record, or null when the file has none.
  header: string[] | null;
  rows: DataRow[];
  // The file ended inside a quoted field, so its last record holds everything after the quote.
  unclosedQuote: boolean;
  spacedQuotes: SpacedQuote[];
}

interface CsvRecord {
  line: number;
  fields: string[];
  // Fields with a space next to their quotes.
  spacedQuotes: number[];
  // Offsets in the text: where the record starts, and just past its line break.
  start: number;
  end: number;
}

// Where a record sits in the text, so a file can be cut between records without
// rewriting them.
export interface RecordSpan {
  start: number;
  end: number;
  blank: boolean;
}

// A blank line, or one holding only "", reads as a single empty field.
const isBlank = (fields: string[]) => fields.length === 1 && fields[0] === "";

export function parseCsv(text: string): ParsedCsv {
  const delimiter = detectDelimiter(text);
  const { records, unclosedQuote } = scanRecords(text, delimiter);
  const [header, ...rest] = records.filter((r) => !isBlank(r.fields));
  const spaced = (r: CsvRecord, row?: number) =>
    r.spacedQuotes.map((column) => ({ ...(row ? { row } : {}), line: r.line, column }));
  return {
    delimiter,
    header: header?.fields ?? null,
    rows: rest.map((r, i) => ({ number: i + 1, line: r.line, fields: r.fields })),
    unclosedQuote,
    spacedQuotes: [...(header ? spaced(header) : []), ...rest.flatMap((r, i) => spaced(r, i + 1))],
  };
}

export function recordSpans(text: string, delimiter: string): RecordSpan[] {
  return scanRecords(text, delimiter).records.map((r) => ({
    start: r.start,
    end: r.end,
    blank: isBlank(r.fields),
  }));
}

// RFC 4180 records: quoted fields may hold the delimiter, line breaks and "" for a quote.
// A quote inside an unquoted field, or text after a closing quote, is kept as written.
export function parseRecords(text: string, delimiter: string, maxRecords = Infinity): string[][] {
  return scanRecords(text, delimiter, maxRecords).records.map((r) => r.fields);
}

function scanRecords(text: string, delimiter: string, maxRecords = Infinity) {
  const records: CsvRecord[] = [];
  let record: string[] = [];
  let spacedQuotes: number[] = [];
  let field = "";
  let quoted = false;
  // The current field's quote has closed, so any text after it is stray.
  let closed = false;
  let line = 1;
  let recordLine = 1;
  let recordStart = 0;
  let i = 0;

  const endRecord = (end: number) => {
    record.push(field);
    records.push({ line: recordLine, fields: record, spacedQuotes, start: recordStart, end });
    record = [];
    spacedQuotes = [];
    field = "";
    closed = false;
  };
  const markSpacedQuote = () => {
    if (spacedQuotes.at(-1) !== record.length) spacedQuotes.push(record.length);
  };

  while (i < text.length && records.length < maxRecords) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        closed = true;
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
      i++;
    } else if (ch === '"' && field === "") {
      quoted = true;
      i++;
    } else if (ch === delimiter) {
      record.push(field);
      field = "";
      closed = false;
      i++;
    } else if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
      i += ch === "\r" ? 2 : 1;
      endRecord(i);
      recordStart = i;
      recordLine = ++line;
    } else {
      if ((ch === " " && closed) || (ch === '"' && /^ +$/.test(field))) markSpacedQuote();
      field += ch;
      i++;
    }
  }

  if (records.length >= maxRecords) return { records, unclosedQuote: false };
  // A file without a final newline still ends its last record.
  if (field !== "" || record.length > 0 || quoted) endRecord(text.length);
  return { records, unclosedQuote: quoted };
}

const SAMPLE_RECORDS = 20;

// Picks the delimiter that splits the header into the most columns while keeping the
// sample rows the same width as the header. Comma wins ties.
export function detectDelimiter(text: string): Delimiter {
  let best: Delimiter = ",";
  let bestMatching = 0;
  let bestWidth = 0;
  for (const delimiter of DELIMITERS) {
    const sample = parseRecords(text, delimiter, SAMPLE_RECORDS).filter((r) => !isBlank(r));
    const [header, ...rows] = sample;
    if (!header || header.length < 2) continue;
    const matching = rows.filter((r) => r.length === header.length).length;
    if (matching > bestMatching || (matching === bestMatching && header.length > bestWidth)) {
      best = delimiter;
      bestMatching = matching;
      bestWidth = header.length;
    }
  }
  return best;
}

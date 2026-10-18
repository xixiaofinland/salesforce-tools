export type Delimiter = "," | ";" | "\t";

export const DELIMITERS: readonly Delimiter[] = [",", ";", "\t"];

export interface DataRow {
  // Data Loader's "data row #": the first row after the header is 1.
  number: number;
  fields: string[];
}

export interface ParsedCsv {
  delimiter: Delimiter;
  header: string[] | null;
  rows: DataRow[];
}

export function parseCsv(text: string): ParsedCsv {
  const delimiter = detectDelimiter(text);
  const [header, ...rest] = parseRecords(text, delimiter);
  return {
    delimiter,
    header: header ?? null,
    rows: rest.map((fields, i) => ({ number: i + 1, fields })),
  };
}

// RFC 4180 records: quoted fields may hold the delimiter, line breaks and "" for a quote.
// A quote inside an unquoted field, or text after a closing quote, is kept as written.
export function parseRecords(text: string, delimiter: string, limit = Infinity): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  const endRecord = () => {
    record.push(field);
    records.push(record);
    record = [];
    field = "";
  };

  while (i < text.length && records.length < limit) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        field += ch;
      }
      i++;
    } else if (ch === '"' && field === "") {
      quoted = true;
      i++;
    } else if (ch === delimiter) {
      record.push(field);
      field = "";
      i++;
    } else if (ch === "\r" && text[i + 1] === "\n") {
      endRecord();
      i += 2;
    } else if (ch === "\n") {
      endRecord();
      i++;
    } else {
      field += ch;
      i++;
    }
  }

  // A file without a final newline still ends its last record.
  if (records.length < limit && (field !== "" || record.length > 0 || quoted)) endRecord();
  return records;
}

const SAMPLE_RECORDS = 20;

// Picks the delimiter that splits the header into the most columns while keeping the
// sample rows the same width as the header. Comma wins ties, as Data Loader's default.
export function detectDelimiter(text: string): Delimiter {
  let best: Delimiter = ",";
  let bestScore = [0, 0];
  for (const delimiter of DELIMITERS) {
    const [header, ...rows] = parseRecords(text, delimiter, SAMPLE_RECORDS);
    if (!header || header.length < 2) continue;
    const matching = rows.filter((r) => r.length === header.length).length;
    const score = [matching, header.length];
    if (score[0] > bestScore[0] || (score[0] === bestScore[0] && score[1] > bestScore[1])) {
      best = delimiter;
      bestScore = score;
    }
  }
  return best;
}

// Size against the Bulk API's batch limits, docs/research/data-loader-csv-facts.md
// section 5 and implication 12.
import type { Finding } from "../findings";
import type { ParsedCsv } from "../parse";

export const BATCH_ROWS = 10_000;
// "10 MB" in Salesforce's limits table; read as decimal, the stricter reading, which
// also matches the 10,000,000 characters a batch may hold.
export const BATCH_BYTES = 10_000_000;

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

// Not in CHECKS: a check sees only the parsed file, and this needs the file's size.
export function batchLimit(csv: ParsedCsv, size: number): Finding[] {
  const rows = csv.rows.length;
  const over: [string, string][] = [];
  if (rows > BATCH_ROWS) {
    over.push([`${rows.toLocaleString("en-US")} data rows`, "10,000 records"]);
  }
  if (size > BATCH_BYTES) over.push([megabytes(size), "10 MB"]);
  if (over.length === 0) return [];
  const have = over.map(([actual]) => actual).join(" and ");
  const limit = over.map(([, max]) => max).join(" and ");
  return [
    {
      kind: "batch-limit",
      severity: "info",
      title: "Larger than one Bulk API batch",
      explanation:
        "The Bulk API takes at most 10,000 records and 10 MB of data in one batch, and 10,000 is also the largest batch size Data Loader accepts for it. Data Loader cuts a file into batches itself, so it can still load this one; where a file has to fit in a single batch, or you would rather load and check it in smaller steps, split it below into files of up to 10,000 rows.",
      detail: `${have}, more than the Bulk API's ${limit} per batch`,
    },
  ];
}

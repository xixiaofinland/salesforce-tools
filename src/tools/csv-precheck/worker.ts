// Runs the pre-check off the sandbox page's main thread, so a large file neither freezes the
// page nor keeps it from showing progress. The worker holds the open file, and the page asks
// it for what it shows: a report per setting, more locations of a finding, a file to save.
//
// Messages go only between the sandbox page and this worker, which no other page can reach.
import { createZip } from "../../shared/zip";
import type { KeyColumn } from "./checks/duplicates";
import { convertIds } from "./convert";
import { EXAMPLES_PER_GROUP, type FindingGroup } from "./findings";
import { convertibleIds, idColumns } from "./ids";
import type { Progress } from "./parse";
import { buildReport, prepareFile, type PreparedCsv, type Report } from "./report";
import { partName, splitCsv } from "./split";

let bytes = new Uint8Array();
let prepared: PreparedCsv | undefined;
// Every example of each finding group in the latest report, by kind, for paging.
let examples = new Map<string, FindingGroup["examples"]>();

function opened(): PreparedCsv {
  if (!prepared) throw new Error("No file is open.");
  return prepared;
}

const handlers = {
  open(file: ArrayBuffer, onProgress: Progress) {
    prepared = undefined;
    bytes = new Uint8Array(file);
    prepared = prepareFile(bytes, { onProgress });
    return {
      header: prepared.csv.header,
      convertible: convertibleIds(prepared.csv, idColumns(prepared.csv)),
    };
  },

  // The report lists the first few examples of each group; the rest wait here for "more".
  report({ key, european }: { key?: KeyColumn; european: boolean }): Report {
    const full = buildReport(opened(), key, { european }, Infinity);
    examples = new Map(full.groups.map((g) => [g.kind, g.examples]));
    const groups = full.groups.map((g) => ({
      ...g,
      examples: g.examples.slice(0, EXAMPLES_PER_GROUP),
    }));
    return { ...full, groups };
  },

  more({ kind, from, count }: { kind: string; from: number; count: number }) {
    return (examples.get(kind) ?? []).slice(from, from + count);
  },

  convert(): Uint8Array<ArrayBuffer> {
    const { csv } = opened();
    return convertIds(bytes, csv.delimiter, idColumns(csv));
  },

  split({ name, rowsPerFile }: { name: string; rowsPerFile: number }): Uint8Array<ArrayBuffer> {
    const parts = splitCsv(bytes, opened().csv.delimiter, rowsPerFile);
    return createZip(parts.map((data, i) => ({ name: partName(name, i, parts.length), data })));
  },
};

export type Handlers = typeof handlers;
export type Request = {
  [K in keyof Handlers]: { id: number; type: K; args: Parameters<Handlers[K]>[0] };
}[keyof Handlers];
export type Reply =
  | { id: number; result: unknown }
  | { id: number; error: string }
  | { id: number; progress: number };

// The DOM typings describe a window, whose postMessage takes a target origin.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(reply: Reply, transfer?: Transferable[]): void;
};

scope.onmessage = ({ data: { id, type, args } }) => {
  try {
    const progress: Progress = (done, total) => scope.postMessage({ id, progress: done / total });
    const result = (handlers[type] as (a: typeof args, p: Progress) => unknown)(args, progress);
    // Files to save go back by transfer, not by copy.
    scope.postMessage({ id, result }, result instanceof Uint8Array ? [result.buffer] : []);
  } catch (e) {
    scope.postMessage({ id, error: e instanceof Error ? e.message : String(e) });
  }
};

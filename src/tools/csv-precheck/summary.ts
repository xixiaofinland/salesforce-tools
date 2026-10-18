// Placeholder logic for the skeleton; the real checks replace it.
export interface Summary {
  lines: number;
  bytes: number;
}

export function summarize(text: string): Summary {
  const trimmed = text.replace(/\r?\n$/, "");
  return {
    lines: trimmed === "" ? 0 : trimmed.split(/\r?\n/).length,
    bytes: new TextEncoder().encode(text).length,
  };
}

export function renderReport(fileName: string, summary: Summary): string {
  return `File: ${fileName}\nLines: ${summary.lines}\nBytes: ${summary.bytes}\n`;
}

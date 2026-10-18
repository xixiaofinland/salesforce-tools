export interface Tool {
  slug: string;
  name: string;
  description: string;
}

export const tools: Tool[] = [
  {
    slug: "csv-precheck",
    name: "Data Loader CSV Pre-check",
    description:
      "Check a CSV before importing it with Data Loader: IDs, dates, encoding, duplicates. Runs in your browser; the file never leaves your computer.",
  },
];

export function toolBySlug(slug: string): Tool {
  const tool = tools.find((t) => t.slug === slug);
  if (!tool) throw new Error(`Unknown tool: ${slug}`);
  return tool;
}

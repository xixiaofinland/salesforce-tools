export interface Tool {
  slug: string;
  name: string;
  description: string;
  // schema.org category for the host page's SoftwareApplication JSON-LD.
  applicationCategory: "DeveloperApplication" | "BusinessApplication";
}

export const tools: Tool[] = [
  {
    slug: "csv-precheck",
    name: "Data Loader CSV Pre-check",
    description:
      "Check a CSV before a Data Loader import: columns, quotes, encoding, IDs, dates, duplicates. Split big files. Your file never leaves your computer.",
    applicationCategory: "DeveloperApplication",
  },
];

export function toolBySlug(slug: string): Tool {
  const tool = tools.find((t) => t.slug === slug);
  if (!tool) throw new Error(`Unknown tool: ${slug}`);
  return tool;
}

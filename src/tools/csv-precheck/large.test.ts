import { expect, it } from "vitest";
import { LARGE_KINDS, LARGE_ROWS, largeCsv } from "./large-fixture.testing";
import { buildReport, prepareFile } from "./report";

it("parses and checks a 100,000-row, 20-column file in under 5 seconds", () => {
  const bytes = new TextEncoder().encode(largeCsv());
  const start = performance.now();
  const report = buildReport(prepareFile(bytes));
  const elapsed = performance.now() - start;

  expect(report.rowCount).toBe(LARGE_ROWS);
  expect(report.columnCount).toBe(20);
  expect(report.idColumns.map((c) => c.name)).toEqual(["Id", "AccountId", "OwnerId"]);
  expect(report.dateColumns.map((c) => c.name)).toEqual(["CloseDate", "CreatedDate"]);
  const kinds = report.groups.map((g) => g.kind);
  for (const kind of LARGE_KINDS) expect(kinds).toContain(kind);
  expect(elapsed).toBeLessThan(5000);
});

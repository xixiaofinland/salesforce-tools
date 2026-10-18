import type { Check } from "../findings";
import { duplicateRows } from "./duplicates";
import {
  columnCount,
  duplicateHeader,
  emptyHeaderCell,
  missingHeader,
  unclosedQuote,
} from "./structure";

// Every check the report runs. Adding a check is a new module and one line here.
export const CHECKS: Check[] = [
  missingHeader,
  emptyHeaderCell,
  duplicateHeader,
  unclosedQuote,
  columnCount,
  duplicateRows,
];

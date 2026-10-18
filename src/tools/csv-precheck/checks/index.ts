import type { Check } from "../findings";
import { duplicateRows } from "./duplicates";
import {
  columnCount,
  delimiter,
  duplicateHeader,
  emptyHeaderCell,
  missingHeader,
  unclosedQuote,
} from "./structure";
import { lineBreaks, spaceAroundQuote, surroundingSpaces } from "./whitespace";

// Every check the report runs. Adding a check is a new module and one line here.
export const CHECKS: Check[] = [
  missingHeader,
  emptyHeaderCell,
  duplicateHeader,
  unclosedQuote,
  columnCount,
  delimiter,
  spaceAroundQuote,
  surroundingSpaces,
  duplicateRows,
  lineBreaks,
];

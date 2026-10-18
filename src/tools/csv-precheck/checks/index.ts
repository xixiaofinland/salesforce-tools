import type { Check } from "../findings";
import { duplicateRows } from "./duplicates";
import { caseOnlyIds, idChecksum, malformedIds, missingIds, mixedIdLengths } from "./ids";
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
  malformedIds,
  idChecksum,
  mixedIdLengths,
  caseOnlyIds,
  missingIds,
  spaceAroundQuote,
  surroundingSpaces,
  duplicateRows,
  lineBreaks,
];

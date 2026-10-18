import type { Check } from "../findings";
import { columnCount, duplicateHeader, emptyHeaderCell, missingHeader } from "./structure";

// Every check the report runs. Adding a check is a new module and one line here.
export const CHECKS: Check[] = [missingHeader, emptyHeaderCell, duplicateHeader, columnCount];

# Data Loader CSV facts (primary sources)

Retrieved 2026-10-18. Quotes are verbatim from the page text. Anything not confirmed from a primary source is marked UNVERIFIED.
"Primary" here means help.salesforce.com, developer.salesforce.com, or Salesforce's own open-source repo `forcedotcom/dataloader` (source code and issue tracker).

URL notes: developer.salesforce.com blocks curl/WebFetch (403), so pages were read in a browser. The old `docs/atlas.en-us.*.meta/...htm` URLs redirect to the `docs/platform/...` URLs below. Help articles are cited by Knowledge Article Number.

## 1. Date and datetime formats on import

Source: Data Types Supported by Data Loader
https://developer.salesforce.com/docs/platform/data-loader-impl/guide/supported-data-types.html

> We recommend you specify dates in the format yyyy-MM-ddTHH:mm:ss.SSS+/-HHmm.
> ... +/-HHmm is the Zulu (UTC) time zone offset

> The following date formats are also supported:
> yyyy-MM-dd'T'HH:mm:ss.SSS'Z'
> yyyy-MM-dd'T'HH:mm:ss.SSS Pacific Standard Time
> yyyy-MM-dd'T'HH:mm:ss.SSSPacific Standard Time
> yyyy-MM-dd'T'HH:mm:ss.SSS PST
> yyyy-MM-dd'T'HH:mm:ss.SSSPST
> yyyy-MM-dd'T'HH:mm:ss.SSS GMT-08:00
> yyyy-MM-dd'T'HH:mm:ss.SSSGMT-08:00
> yyyy-MM-dd'T'HH:mm:ss.SSS -800
> yyyy-MM-dd'T'HH:mm:ss.SSS-800
> yyyy-MM-dd'T'HH:mm:ss
> yyyy-MM-dd HH:mm:ss
> yyyyMMdd'T'HH:mm:ss
> yyyy-MM-dd
> MM/dd/yyyy HH:mm:ss
> MM/dd/yyyy
> yyyyMMdd

> To enable date formats that begin with the day rather than the month, select the Use European date format box in the Settings dialog. European date formats are dd/MM/yyyy and dd/MM/yyyy HH:mm:ss.

> If your computer's locale is east of Greenwich Mean Time (GMT), we recommend that you change your computer setting to GMT in order to avoid date adjustments when inserting or updating records.

> Only dates within a certain range are valid. The earliest valid date is 1700-01-01T00:00:00Z GMT, or just after midnight on January 1, 1700. The latest valid date is 4000-12-31T00:00:00Z GMT, or just after midnight on December 31, 4000. These values are offset by your time zone. For example, in the Pacific time zone, the earliest valid date is 1699-12-31T16:00:00, or 4:00 PM on December 31, 1699.

Settings: Configure Data Loader
https://developer.salesforce.com/docs/platform/data-loader-impl/guide/configuring-the-data-loader.html

> Use European date format: Select this option to support the date formats dd/MM/yyyy and dd/MM/yyyy HH:mm:ss .

> Time Zone: Select this option to specify a default time zone. If a date value doesn't include a time zone, this value is used. Valid values are any time zone identifier that can be passed to the Java getTimeZone(java.lang.String) method. The value can be a full name such as America/Los_Angeles , or a custom ID such as GMT-8:00 . If no value is specified, the time zone of the computer where Data Loader is installed is used. If an incorrect value is entered, GMT is used as the time zone and this fact is noted in the Data Loader log.

Colon in offset is rejected by Data Loader (KB 000383025)
https://help.salesforce.com/s/articleView?id=000383025

> Error converting value to correct data type: Failed to parse date: 1999-01-01T23:01:01+01:00
> This error occurs when the DateTime value in your CSV file includes a timezone offset formatted with a colon separator (e.g., +01:00). While this format is valid for the Salesforce SOAP and Bulk APIs, Salesforce Data Loader has its own internal parser with unique formatting requirements that differ from the general API specification.
> Option 1 - Remove the colon from the timezone offset: 1999-01-01T23:01:01+0100
> Option 2 - Use the GMT prefix format: 1999-01-01T23:01:01GMT+01:00

Date-only handling (KB 000385167, "Format the 'Date' and 'Date Time' data in a CSV file For Salesforce Data Loader")
https://help.salesforce.com/s/articleView?id=000385167

> 'Date' field acceptable formats: YYYY-MM-DD / YYYY-MM-DD hh:mm:ss / YYYY-MM-DDThh:mm:ssZ / YYYY-MM-DDThh:mm:ss.sssZ
> 'Date Time' field acceptable formats: YYYY-MM-DD hh:mm:ss / YYYY-MM-DDThh:mm:ssZ / YYYY-MM-DDThh:mm:ss.sssZ
> 'Time' field acceptable formats: hh:mm:ss.sssZ (For example, 07:00:00.000Z)
> Note: If you set the hh:mm:ss to 00:00:00, the Import Date data in Salesforce will display the previous day ('2011-01-09' instead of '2011-01-10').
> (scenario: org time zone GMT+8, Data Loader time zone GMT+8) 'Date' value "must be one of these: 2011-01-10 08:00:00 / 2011-01-10T08:00:00Z / 2011-01-10T08:00:00.000Z"

Bulk API (not Data Loader) date rules, for comparison
https://developer.salesforce.com/docs/platform/api-asynch/guide/datafiles-date-format.html

> Use the yyyy-MM-ddTHH:mm:ss.SSS+/-HH:mm or yyyy-MM-ddTHH:mm:ss.SSSZ formats to specify dateTime fields.
> Use the yyyy-MM-dd format to specify date fields.
> Specifying an offset for date is not supported.

Data Loader source, `DateTimeConverter.java` (main @ f79c9f7, 2026-07-27)
https://github.com/forcedotcom/dataloader/blob/HEAD/src/main/java/com/salesforce/dataloader/dyna/DateTimeConverter.java

- Value is `.trim()`med; a trailing `z`/`Z` is stripped and the value is read as GMT.
- Parsing is non-lenient (`fmt.setLenient(false)`) and must consume the whole string.
- Slash base is `dd/MM/yyyy` when European is on, otherwise `MM/dd/yyyy` (the other order is not tried).
- The pattern list is wider than the doc: it also has `yyyy-MM`, `yyyy`, `yyyy-MM-dd'T'HH:mm`, `yyyy-MM-dd'T'HH`, `HHmmss` basic forms, and a `XXX` suffix (colon offset). This conflicts with KB 000383025 for current builds: UNVERIFIED which Data Loader versions accept `+01:00`.
- Failure text: `throw new ConversionException("Failed to parse date: " + value)`.
- `messages.properties`: `Visitor.conversionErrorMsg=Error converting value to correct data type: {0}`.

UNVERIFIED: the exact behaviour of a date-only value for each time zone/version combination (the doc and KB 000385167 are example-based, and `DateOnlyCalendar.java` has a `PROP_GMT_FOR_DATE_FIELD_VALUE` switch that the help docs do not describe).

## 2. Error messages

| Situation                             | Exact text                                                                                                                              | Source                                                                                                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unparseable date/datetime (SOAP mode) | `Error converting value to correct data type: Failed to parse date: 1999-01-01T23:01:01+01:00`                                          | KB 000383025                                                                                                                                          |
| Date in Bulk API mode                 | `INVALID_FIELD:Failed to deserialize field at col 1. Due to, 'Sat Oct 02 17:00:00 PDT 2021' is not a valid value for the type xsd:date` | GitHub issue forcedotcom/dataloader#338 (user report in Salesforce's repo, Data Loader v53.0.0): https://github.com/forcedotcom/dataloader/issues/338 |
| Same, datetime                        | `... is not a valid value for the type xsd:dateTime`                                                                                    | UNVERIFIED (only seen in a search snippet, not on a primary page)                                                                                     |
| Bad number                            | `Invalid Number ("<Field Name>: invalid number: <Number Value>")`                                                                       | KB 000384437 https://help.salesforce.com/s/articleView?id=000384437                                                                                   |
| ID wrong, insert/update               | `MALFORMED_ID: Object name id: id value of incorrect type`                                                                              | KB 000387915 https://help.salesforce.com/s/articleView?id=000387915                                                                                   |
| ID wrong, delete                      | `MALFORMED_ID: bad id`                                                                                                                  | KB 000387915                                                                                                                                          |
| Blank ID on update/delete             | `MISSING_ARGUMENT: Id not specified in an update call`                                                                                  | KB 000387915                                                                                                                                          |
| Bad or missing parent/record          | `INVALID_CROSS_REFERENCE_KEY: invalid cross reference id`                                                                               | KB 000387915                                                                                                                                          |
| Owner/lookup of wrong object          | `Owner ID: ID value of incorrect type:`                                                                                                 | KB 000384437                                                                                                                                          |
| Access/missing record                 | `Insufficient access rights to object ID / insufficient access rights on cross-reference id`                                            | KB 000384437                                                                                                                                          |

IDs, status code definitions (SOAP API Developer Guide, "Core Data Types Used in API Calls")
https://developer.salesforce.com/docs/platform/api/guide/sforce-api-calls-concepts-core-data-objects.html

> MALFORMED_ID: An ID must be either 15 characters, or 18 characters with a valid case-insensitive extension. There's also an exception code of the same name.
> INVALID_CROSS_REFERENCE_KEY: An invalid foreign key can't be set on a field. For example, an object share, such as AccountShare, can't be deleted because the share row is a result of a sharing rule.
> INVALID_ID_FIELD: The specified ID is correctly formatted but isn't valid. For example, the ID is of the wrong type.

KB 000387915 causes (verbatim):

> Scenario 1: Invalid ID Characters or ID Length Less Than 15 Characters: Insert/Update operation error: MALFORMED_ID: Object name id: id value of incorrect type; Delete operation error: MALFORMED_ID: bad id
> Scenario 3: Incorrect ID for Update or Upsert Operations ... Verify that the ID in the CSV file corresponds to an existing record in the Salesforce org.

Header/shape errors from the Data Loader CSV reader (`messages.properties`, main @ f79c9f7)
https://github.com/forcedotcom/dataloader/blob/HEAD/src/main/resources/messages.properties

- `CSVFileDAO.errorHeaderRow=Error getting header row from the CSV file.`
- `CSVFileDAO.errorRowTooLarge=Error reading data row #{0}: the number of columns ({1}) exceeds the number of columns in the header ({2})`
- `CSVFileDAO.errorRowTooSmall=Error reading data row #{0}: the number of columns ({1}) is less than the number of columns in the header ({2})`
- `RowUtil.warningEmptyColumn=An empty column is found in the header row`
- KB 000384437: `Row is larger than header`; `Invalid CSV file format. Please select a different file. Error reading row #: the number of data columns exceeds the number of columns in the header.`

## 3. 15 to 18 character checksum algorithm

Salesforce documents it in two help articles (not in the developer docs). The CASESAFEID help page describes the function only, with no algorithm: https://help.salesforce.com/s/articleView?id=platform.customize_functions_casesafeid.htm&type=5

KB 000385585 (formula version) https://help.salesforce.com/s/articleView?id=000385585

> The formula appends a 3-character checksum to the standard 15-character ID. It evaluates each group of 5 characters in the original ID, checking whether each character is an uppercase letter (A-Z), and uses that result to calculate a checksum character from the encoding string "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345". The three groups of 5 characters each produce one checksum character ...
> (formula: for chars 1..5 of a block add 1, 2, 4, 8, 16 when the character is found in "ABCDEFGHIJKLMNOPQRSTUVWXYZ", then `MID("ABCDEFGHIJKLMNOPQRSTUVWXYZ012345", sum+1, 1)`)
> Note: To convert an 18-character Salesforce record ID back to 15 characters, simply remove the last 3 characters from the right of the 18-character string.

KB 000385066 (JavaScript bookmarklet, verbatim core) https://help.salesforce.com/s/articleView?id=000385066

```
for(var block=0;block<3; block++) {
  var loop=0;
  for(var position=0;position<5;position++){
    var current=input.charAt(block*5+position);
    if(current>="A" && current<="Z") loop+=1<<position;
  }
  addon+="ABCDEFGHIJKLMNOPQRSTUVWXYZ012345".charAt(loop);
}
output=(input+addon);
```

Algorithm: split the 15 chars into 3 blocks of 5. For each block, bit `i` (0 = leftmost) is 1 if char `i` is `A-Z`; digits and `a-z` are 0. The 5-bit value (0-31) indexes `ABCDEFGHIJKLMNOPQRSTUVWXYZ012345`. Append the 3 resulting characters.

Real 15 to 18 pairs. I ran the algorithm above on each 15-char value and the result equals the published 18-char value:

| 15                | 18                   | Source                                                                                                                                                                    |
| ----------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `001D000000IqhSL` | `001D000000IqhSLIAZ` | REST "Create a Record" example, https://developer.salesforce.com/docs/platform/api-rest/guide/dome-sobject-create.html (18-char value published; 15-char is its first 15) |
| `001R0000005hDFY` | `001R0000005hDFYIA2` | REST "Get Records Using sObject Rows", https://developer.salesforce.com/docs/platform/api-rest/guide/resources-sobject-retrieve-get.html                                  |
| `00300000003T2PG` | `00300000003T2PGAA0` | KB 000387915 (both forms printed in the article)                                                                                                                          |
| `001xx000003DHur` | `001xx000003DHurAAG` | CASESAFEID help page ("returns something like 001xx000003DHurAAG")                                                                                                        |

Trap: KB 000385008 prints `5003000000D8cuI` / `5003000000D8cuIQAA`. The documented algorithm gives `5003000000D8cuIAAR`, so that doc example does not follow the algorithm. Do not use it as a fixture.

## 4. 15 vs 18 character IDs, case sensitivity

> A Salesforce ID is a case-sensitive 15-character or case-insensitive 18-character alphanumeric string that uniquely identifies a particular record.
> To ensure data quality, make sure that all Salesforce IDs you enter in Data Loader are in the correct case.
> (Data Types Supported by Data Loader, URL in section 1)

KB 000385008 https://help.salesforce.com/s/articleView?id=000385008

> When inserting or updating Records, the API accepts either the 15-character case-sensitive ID or the 18-character ID with the 3 extra characters appended, being case-sensitive.
> For example, a 15-character ID such as '000000000000Abc' is treated as different from '000000000000aBC' because the comparison is case-sensitive.
> Salesforce IDs are 15-character, base-62 strings. ... These 15-character IDs are case-sensitive.
> The case-insensitive ID is identical to the 15-character case-sensitive ID, but with 3 extra characters appended to indicate the casing of each of the original 15 characters.

Boundary: SOAP `MALFORMED_ID` = "An ID must be either 15 characters, or 18 characters with a valid case-insensitive extension." So lengths 16, 17, <15 and bad suffixes are malformed.
UNVERIFIED: whether Data Loader (not the API) validates the 3-char suffix client-side, and what happens with an 18-char ID whose case is wrong. The docs do not say. KB 000385008 says only "being case-sensitive" for the 18-char form.

## 5. CSV requirements

Encoding. Configure Data Loader:

> Read all CSVs with UTF-8 encoding: Select this option to force files to open in UTF-8 encoding, even if they were saved in a different format.
> Bulk API: "Files must be in UTF-8 format." https://developer.salesforce.com/docs/platform/api-asynch/guide/datafiles-csv-preparing.html

BOM, KB 000383918 https://help.salesforce.com/s/articleView?id=000383918

> New versions of the Data Loader (version 28+) do not support files encoded using UTF-8 BOM(BYTE ORDER MARK) format and will generate the following error: "CSV Error: Invalid CSV file format. Please select a different file. Error getting header row from the CSV file"
> The following characters may appear at the start of a file containing a BOM. ... ^ ` ~ ¡ ¢ « µ ¸ Ä Ã Ð Ò
> (Note: this KB is dated 2026 but its claim is version "28+"; whether the current Data Loader still rejects a BOM is UNVERIFIED. Treat a BOM as an error or warning anyway.)

Saving as UTF-8, for the tool's advice (retrieved 2026-10-19):

> Excel, File formats supported in Excel for Mac https://support.microsoft.com/en-us/excel/file-formats-supported-in-excel-for-mac: CSV UTF-8 (Comma delimited) "Exports the data on the active sheet to a text file that complies with UTF-8 Unicode encoding standards."
> VS Code, Basic editing https://code.visualstudio.com/docs/editing/codebasics: "You can view the file encoding in the status bar." Clicking it offers to reopen or save the file with a different encoding.
> VS Code 1.0 release notes https://code.visualstudio.com/updates/vMarch: "You can now save files with UTF-8 BOM encoding as well as convert existing files with or without BOM." The status bar tells UTF-8 and UTF-8 with BOM apart.
> Excel, Import or export text (.txt or .csv) files https://support.microsoft.com/en-us/excel/get-started/import-or-export-text-txt-or-csv-files: "When you save a workbook as a .csv file, the default list separator (delimiter) is a comma." and "If you want to use a semi-colon as the default list separator when you Save As .csv, but need to limit the change to Excel, consider changing the default decimal separator to a comma."
> UNVERIFIED (no vendor page found): whether Excel's "CSV UTF-8" writes a BOM, which encoding plain "CSV (Comma delimited)" uses, Notepad's encoding names, Google Sheets' CSV download.

Header row, Bulk API doc (above URL):

> The first row in a CSV file lists the field names for the object that you're processing. Each subsequent row corresponds to a record in Salesforce.
> Relationship headers: `RelationshipName.IndexedFieldName`; polymorphic: `ObjectType:RelationshipName.IndexedFieldName`.

Delimiters. Configure Data Loader: comma, tab, and "other characters" are selectable; Bulk API: "The Bulk API doesn't support any delimiter except for a comma." KB 000384437: tab inside an unquoted cell in a comma file reads as an extra column ("Error reading row #: the number of data columns exceeds the number of columns in the header").

Quoting, line breaks, spaces. "Valid CSV Record Rows" https://developer.salesforce.com/docs/platform/api-asynch/guide/datafiles-csv-valid-record-rows.html

> If a field value contains a comma, a new line, or a double quote, the field value must be contained within double quotes: for example, "Director of Operations, Western Region".
> If a field value contains a double quote, the double quote must be escaped by preceding it with another double quote: for example, "This is the ""gold"" standard".
> Field values aren't trimmed. A space before or after a delimiting comma is included in the field value. A space before or after a double quote generates an error for the row. For example, John,Smith is valid; John, Smith is valid, but the second value is " Smith"; ."John", "Smith" is not valid.
> Empty field values are ignored when you update records. To set a field value to null, use a field value of #N/A.
> Data Loader-specific behaviour for line breaks inside quoted fields, and for trimming in non-date fields, is UNVERIFIED (the Bulk API page is the only source, and it governs Bulk mode). The Data Loader date converter trims.

Limits. Configure Data Loader:

> The maximum import batch size is 200 records for SOAP API and 10000 records for Bulk API. ... If the Use Bulk API 2.0 option is selected, then neither batch size is used because Bulk API 2.0 handles batch size automatically.
> Bulk API and Bulk API 2.0 Limits and Allocations https://developer.salesforce.com/docs/platform/salesforce-app-limits-cheatsheet/guide/salesforce-app-limits-platform-bulkapi.html
> Maximum file size: 10 MB per batch (Bulk API) | 150 MB per job (Bulk API 2.0) ... To account for the base64 conversion increase, upload data that does not exceed 100 MB.
> Maximum number of characters in a field: 131072 | Maximum number of fields in a record: 5,000 | Maximum number of characters in a record: 400,000
> Maximum number of records in a batch: 10,000 | Maximum number of characters for all the data in a batch: 10,000,000

Bulk-only null token: "Insert null values ... isn't available if either the Use Bulk API or the Use Bulk Api 2.0 option is selected ... use a field value of #N/A in the import CSV file."

## 6. How Data Loader reads the CSV (source)

Read 2026-10-18 from the `master` branch of `forcedotcom/dataloader` and of `forcedotcom/wsc`, whose `com.sforce.async.CSVReader` Data Loader uses to parse the file. Quotes are verbatim from the source.

Reader setup, `CSVFileReader.java` https://github.com/forcedotcom/dataloader/blob/HEAD/src/main/java/com/salesforce/dataloader/dao/csv/CSVFileReader.java

- `csvReader = new CSVReader(bomInputStream, encoding, csvDelimiters);` (or the plain `FileInputStream` when the encoding is not UTF-8/16/32). No setter for blank-line handling is called.
- Header: `daoColsList = csvReader.nextRecord();` and, when that is `null`, `throw new DataAccessObjectInitializationException(Messages.getString("CSVFileDAO.errorHeaderRow"))`, i.e. `Error getting header row from the CSV file.`
- Each data row: `if (!DAORowUtil.isValidRow(record)) { endOfFileReached = true; return null; }`, then `if (record.size() > getColumnNames().size())` throws `CSVFileDAO.errorRowTooLarge` and `else if (record.size() < getColumnNames().size())` throws `CSVFileDAO.errorRowTooSmall`, both with `String.valueOf(getCurrentRowNumber()), String.valueOf(record.size()), String.valueOf(getColumnNames().size())`, as a `DataAccessRowException`.

Blank lines, quotes, `CSVReader.java` https://github.com/forcedotcom/wsc/blob/HEAD/src/main/java/com/sforce/async/CSVReader.java

- `private boolean ignoreBlankRecords = true;` with no setter. In `nextRecord()`, while `ignoreBlankRecords`, a record of size 0, or of size 1 whose value is `null` or empty, is skipped: `if (emptyLine) { record = nextRecordLocal(); }`. So blank lines anywhere, including before the header, are skipped. An empty field is stored as `null` (`record.add(fieldValue == null ? null : fieldValue.toString())`). A line of spaces is a one-field record, not blank (spaces are word characters: `parser.wordChars(0, 255)`).
- Unclosed quote: `throw new CSVParseException("EOF reached before closing an opened quote", parser.lineno());`
- Other quote errors (not yet checked by the tool): `"Found unescaped quote. A value with quote should be within a quote"`, `"Not expecting more text after end quote"`.

Row numbers, `AbstractDataReaderImpl.java` https://github.com/forcedotcom/dataloader/blob/HEAD/src/main/java/com/salesforce/dataloader/dao/AbstractDataReaderImpl.java

- `open()` reads the header, then sets `currentRowNumber = 0;`.
- `readTableRow()`: `trow = readTableRowFromDAO(); if (trow == null) { ... return null; } currentRowNumber++;`. The number is incremented only after a row is read, so `getCurrentRowNumber()` inside the row-size error is the count of data rows read before it: the first data row is reported as `data row #0`. Skipped blank lines are not counted.

What a row-size error does

- `readTableRowListFromDAO` (CSVFileReader) and `readTableRowList` (AbstractDataReaderImpl) do not catch it, nor does `AbstractLoadAction.visit()` (https://github.com/forcedotcom/dataloader/blob/HEAD/src/main/java/com/salesforce/dataloader/action/AbstractLoadAction.java), which calls `getDao().readTableRowList(loadBatchSize)`. `AbstractAction.executeOperation` (https://github.com/forcedotcom/dataloader/blob/HEAD/src/main/java/com/salesforce/dataloader/action/AbstractAction.java) collects exceptions and ends with `getMonitor().doneError(errMsg)`. So the operation stops at the first such row.

Header checks, `DAORowUtil.validateColumns` https://github.com/forcedotcom/dataloader/blob/HEAD/src/main/java/com/salesforce/dataloader/util/DAORowUtil.java

- `if (header == null || header.length() == 0) { error = Messages.getString("RowUtil.warningEmptyColumn"); break; } else if (uniqueHeaders.contains(header)) { error = Messages.getFormattedString("RowUtil.warningDuplicateColumn", header); break; }` with a plain `HashSet`: duplicates are compared exactly (case-sensitive), and only the first problem is reported.
- `messages.properties`: `RowUtil.warningDuplicateColumn=A duplicate column [{0}] is found`.
- Caller, `DataSelectionDialog.java` https://github.com/forcedotcom/dataloader/blob/HEAD/src/main/java/com/salesforce/dataloader/ui/DataSelectionDialog.java: `int response = UIUtils.errorMessageBox(shell, error); if(response != SWT.YES) { handleCSVReadError(shell, Labels.getString("DataSelectionDialog.errorCSVFormat") + ...); return; }`. `labels.properties`: `DataSelectionDialog.errorCSVFormat=CSV Error: Invalid CSV file format.\n\n`.

Column-to-field mapping, `Mapper.java` https://github.com/forcedotcom/dataloader/blob/HEAD/src/main/java/com/salesforce/dataloader/mapping/Mapper.java

- `protected final Map<String, String> daoColumnNames = new LinkedCaseInsensitiveMap<String>();` filled with `daoColumnNames.put(colName, colName);`: column names that differ only in case share one entry.
- `if (colName == null) { String errorMsg = "Missing column name in the CSV file at column " + i; ... throw new MappingInitializationException(errorMsg); }`

UNVERIFIED: what Data Loader does with the data of an empty or duplicate column when the user chooses to continue past the warning; which Data Loader releases match `master`.

## Implications for the tool

1. Date/datetime check: accept the doc list in section 1 as "valid"; also flag `+HH:mm` offsets with a colon as "rejected by Data Loader per KB 000383025" (recommend `+HHmm` or `GMT+HH:mm`). Offer a relaxed mode, since current source seems to accept more.
2. Slash dates are ambiguous. Without knowing the "Use European date format" setting, `dd/MM` vs `MM/dd` cannot be validated; any value with first or second part greater than 12 identifies the order. Ask the user for the setting.
3. Non-lenient parsing: `2024-02-30`, `13/45/2020`, and partial matches are invalid. Use the same range, 1700-01-01 to 4000-12-31.
4. Date-only fields with a time component, or with 00:00:00, may shift a day depending on the Data Loader Time Zone setting. Warn and recommend plain `yyyy-MM-dd`. Bulk API says "Specifying an offset for date is not supported."
5. Report error text verbatim: `Error converting value to correct data type: Failed to parse date: <value>` (SOAP) and `INVALID_FIELD:Failed to deserialize field at col N. Due to, '<value>' is not a valid value for the type xsd:date` (Bulk).
6. ID check: length must be 15 or 18 (alphanumeric), else predict `MALFORMED_ID`. Verify the 18-char suffix with the algorithm (fixtures: the four pairs in section 3). Do not claim Data Loader rejects a wrong suffix: UNVERIFIED.
7. 15-char IDs are case-sensitive: warn if two IDs in a column differ only by case (Excel/Access can mangle them) and suggest 18-char. Offer a 15 to 18 converter.
8. Blank ID in an update/delete file predicts `MISSING_ARGUMENT: Id not specified in an update call`.
9. `INVALID_CROSS_REFERENCE_KEY` cannot be predicted offline (needs org data); only flag IDs that are well-formed but cannot be checked.
10. File checks: UTF-8 BOM (error/warning), non-UTF-8 bytes, header row present, no empty header cell (`An empty column is found in the header row`), every row's column count equals the header's, delimiter detection (semicolons from European Excel), unescaped quotes, space before/after a quote.
11. Do not trim silently: values keep leading/trailing spaces. Warn on them, and say Data Loader's date parser does trim but other field types are UNVERIFIED.
12. Size limits: warn above 10,000 rows (Bulk API batch), 10 MB per Bulk batch, 150 MB for Bulk API 2.0 (100 MB recommended after base64), 5,000 columns, 400,000 chars per record, 131,072 chars per field. SOAP mode batch is at most 200.
13. `#N/A` is the null token for Bulk modes; do not flag it as an invalid value.

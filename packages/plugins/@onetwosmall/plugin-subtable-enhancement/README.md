# @onetwosmall/plugin-subtable-enhancement

Enhanced sub-table (inline editable) field component for NocoBase.

## Introduction

This plugin provides an enhanced sub-table field component for many-to-many (`m2m`), one-to-many (`o2m`) and many-to-many-through (`mbm`) association fields in the NocoBase modern (v2) client. It builds on the native inline sub-table and adds row operations, Excel paste, lookup & fill, and client-side formula columns, so a whole list of detail rows can be maintained directly inside a form.

## Features

- Add / delete / batch-delete rows with 1-based row numbers; sequence numbers are shown by default, and hovering/focusing a row number reveals that row's checkbox (selected rows keep the checkbox visible)
- Copy row: inserts a fully isolated deep copy (including belongsTo record objects) right below the source row; primary keys are stripped so the copy is saved as a new record; the copy always reflects the latest committed cell value, so edits are never overwritten by stale data
- Create vs edit UX: a create form seeds a single blank input row; an edit form shows exactly the stored data (no trailing empty rows)
- Excel paste: paste (Ctrl+V) tab-separated clipboard data from any cell; cells are converted by type (number, percent, date, datetime, time, select, checkbox), the paste range extends the table, and unconvertible cells are reported while keeping the original text
- Association (belongsTo `m2o`/`obo`) dropdown columns: pasting the displayed text auto-resolves and selects the matching record by the column's configured title field (falling back to numeric primary keys only); values that cannot be matched are kept as text and reported in a summary without affecting the other successfully matched rows
- Lookup & fill columns: available on every editable column (including association dropdowns); type a value and press Enter (or click the magnifier to pick) to resolve a target record and fill the mapped columns; pasted values are resolved in batch, and the picker table headers show the data-source field display names
- Calculation rule: math.js formulas on numeric columns, recomputed live; the editor lists numeric columns by their data-source display name and inserts the matching `{{field name}}` reference for you
- Localized UI strings (zh-CN / en-US)

## Installation

Install the plugin and enable it in the NocoBase plugin management page:

```bash
yarn nocobase pm enable @onetwosmall/plugin-subtable-enhancement
```

Then, in the modern client, add the field component **Enhanced sub-table** to an `m2m` / `o2m` / `mbm` association field (the target collection must not be a file collection).

## Configuration

### Field-level settings

| Setting | Description |
| --- | --- |
| Displayed fields | Choose which fields of the target collection are shown as sub-table columns |
| Enable batch delete | Show checkboxes (revealed on row-number hover/focus) and allow deleting multiple selected rows at once |
| Enable copy row | Show the copy-row action on every data row |
| Enable Excel paste | Allow pasting Excel/copied table content into the sub-table |
| Actions column width | Width of the row action column |

### Column-level settings

| Setting | Description |
| --- | --- |
| Calculation rule | math.js formula computed live for the column; only numeric field columns can configure it, and the editor lets you insert numeric columns by their data-source display name |
| Lookup & fill | Match a value in this column against a target collection and fill other columns with the matched record's fields; available on all editable columns, including association (`m2o`/`obo`) dropdown columns |

Native column settings (column title, width, fixed position, field component, title field, etc.) continue to apply.

## How It Works

1. On a create form the sub-table starts with one blank row so data entry can begin immediately; on an edit form it displays only the rows already stored. Use **Add new** to append more rows.
2. **Copy row** duplicates the row right below itself. Cell values (including nested belongsTo records) are deep-cloned so the copy and the source never share references, and the operation first commits the focused cell so the latest typed value is copied.
3. **Excel paste** reads the clipboard as rows/columns from the clicked cell. Number/date/select-like cells are converted to the field type; pasting into a lookup & fill column resolves the matched record and fills its mapped columns in one batch.
4. For association dropdown columns, pasted display text is resolved against the target collection by the column's current title field (with a numeric-primary-key fallback). Values that cannot be matched are kept as text and reported in a summary; the successfully matched rows still paste and fill normally.
5. **Calculation rule** columns are recomputed whenever any of their referenced columns change. In the column settings, the formula editor lists the numeric columns by display name and inserts `{{field name}}` tokens at the cursor.

## Notes

- This plugin targets the NocoBase modern (v2) client runtime; the legacy (v1) client is not affected.
- Lookup & fill is available on all editable columns, including association (`m2o`/`obo`) dropdown columns; Excel paste of display text to select a record works there too.
- During association Excel paste, only unmatched values are reported (kept as text) and other rows/columns are never affected.
- Formula expressions use math.js syntax, e.g. `{{nastnum}} * {{budget_price}}`, referencing columns by their database field names — the rule editor inserts these tokens from a display-name picker.

## License

This project is dual-licensed under AGPL-3.0 and a commercial license.
For commercial licensing (e.g., closed-source deployment), please contact: moonship1011@gmail.com.

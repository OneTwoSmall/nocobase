# @onetwosmall/plugin-subtable-enhancement

Enhanced sub-table (inline editable) field component for NocoBase.

## Introduction

This plugin provides an enhanced sub-table field component for many-to-many (`m2m`), one-to-many (`o2m`) and many-to-many-through (`mbm`) association fields in the NocoBase modern (v2) client. It builds on the native inline sub-table and adds row operations, Excel paste, lookup & fill, and client-side formula columns, so a whole list of detail rows can be maintained directly inside a form.

## Features

- Add / delete / batch-delete rows with 1-based row numbers and a selection column
- Copy row: inserts a fully isolated deep copy (including belongsTo record objects) right below the source row; primary keys are stripped so the copy is saved as a new record; the copy always reflects the latest committed cell value, so edits are never overwritten by stale data
- Create vs edit UX: a create form seeds a single blank input row; an edit form shows exactly the stored data (no trailing empty rows)
- Excel paste: paste (Ctrl+V) tab-separated clipboard data from any cell; cells are converted by type (number, percent, date, datetime, time, select, checkbox), the paste range extends the table, and unconvertible cells are reported while keeping the original text
- Association (belongsTo `m2o`/`obo`) dropdown columns: pasting the displayed text auto-resolves and selects the matching record by the column's configured title field, falling back to the target primary key
- Lookup & fill columns: type a value and press Enter (or click the magnifier to pick) to resolve a target record and fill the mapped columns; pasted values are resolved in batch
- Calculation rule: math.js formulas on numeric columns, recomputed live as inputs change
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
| Enable batch delete | Show checkboxes and allow deleting multiple selected rows at once |
| Enable copy row | Show the copy-row action on every data row |
| Enable Excel paste | Allow pasting Excel/copied table content into the sub-table |
| Actions column width | Width of the row action column |

### Column-level settings

| Setting | Description |
| --- | --- |
| Calculation rule | math.js formula computed live for the column; only available on numeric field columns |
| Lookup & fill | Match a value in this column against a target collection and fill other columns with the matched record's fields; available on regular columns and hidden on association (`m2o`/`obo`) dropdown columns |

Native column settings (column title, width, fixed position, field component, title field, etc.) continue to apply.

## How It Works

1. On a create form the sub-table starts with one blank row so data entry can begin immediately; on an edit form it displays only the rows already stored. Use **Add new** to append more rows.
2. **Copy row** duplicates the row right below itself. Cell values (including nested belongsTo records) are deep-cloned so the copy and the source never share references, and the operation first commits the focused cell so the latest typed value is copied.
3. **Excel paste** reads the clipboard as rows/columns from the clicked cell. Number/date/select-like cells are converted to the field type; pasting into a lookup & fill column resolves the matched record and fills its mapped columns in one batch.
4. For association dropdown columns, pasted display text is resolved against the target collection by the column's current title field (with a fallback to the primary key) and the corresponding record is selected.
5. **Calculation rule** columns are recomputed whenever any of their referenced columns change.

## Notes

- This plugin targets the NocoBase modern (v2) client runtime; the legacy (v1) client is not affected.
- Lookup & fill is intentionally not available on association (`m2o`/`obo`) dropdown columns; Excel paste of display text to select a record still works there.
- Formula expressions use math.js syntax, e.g. `{{nastnum}} * {{budget_price}}`, referencing columns by their field name.

## License

This project is dual-licensed under AGPL-3.0 and a commercial license.
For commercial licensing (e.g., closed-source deployment), please contact: moonship1011@gmail.com.

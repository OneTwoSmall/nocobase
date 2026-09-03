/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { uid } from '@formily/shared';
import { dayjs } from '@nocobase/utils/client';

import { isBelongsToAssociationColumn } from './association';
import { deepCloneRow } from './clone';
import { type EnhancedColumnConfig, type EnhancedSubTableRow } from './types';

const NUMBER_INTERFACES = ['integer', 'number', 'bigInt', 'double', 'decimal'];
const DATE_INTERFACES = ['date', 'datetime', 'datetimeNoTz', 'createdAt', 'updatedAt'];
const SELECT_INTERFACES = ['select', 'radioGroup', 'multipleSelect', 'checkboxGroup'];
const TRUE_TOKENS = new Set(['true', '1', 'y', 'yes', '√', '✓', '是', '勾选']);
const FALSE_TOKENS = new Set(['false', '0', 'n', 'no', '×', '✗', '否', '不']);

const DATE_PARSE_FORMATS = [
  'YYYY-M-D H:m:s',
  'YYYY-M-D H:m',
  'YYYY-M-DTH:m:s',
  'YYYY/M/D H:m:s',
  'YYYY/M/D H:m',
  'YYYY.M.D H:m:s',
  'YYYY.M.D H:m',
  'YYYY年M月D日 H:m:s',
  'YYYY年M月D日 H:m',
  'YYYY-M-D',
  'YYYY/M/D',
  'YYYY.M.D',
  'YYYY年M月D日',
];

const TIME_PARSE_FORMATS = ['H:m:s', 'H:m'];

export interface PasteTarget {
  rowIndex: number;
  dataIndex: string;
}

export interface PasteResult {
  rows: EnhancedSubTableRow[];
  lookupTargets: PasteTarget[];
  issues: PasteTarget[];
  rowCount: number;
  colCount: number;
}

export function parsePasteText(text: string): string[][] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  // 仅裁剪尾部的空行，保留中间空行，避免 Excel 范围内含空行时数据整体上移
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  return lines.map((row) => row.split('\t'));
}

export function isNumberInterface(interfaceName: string | undefined): boolean {
  return !!interfaceName && NUMBER_INTERFACES.includes(interfaceName);
}

export interface CellConvertResult {
  value: any;
  issue?: boolean;
}

function parseNumericText(text: string): number | null {
  const number = Number(text.replace(/,/g, '').trim());
  return Number.isNaN(number) ? null : number;
}

function round9(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}

function getFieldOptions(field: any): any[] {
  if (!field) return [];
  const enumValue = (field as any).enum;
  if (Array.isArray(enumValue)) return enumValue;
  return field.uiSchema?.enum ?? [];
}

function matchEnumOption(options: any[], text: string): { matched: boolean; value?: any } {
  const target = text.trim().toLowerCase();
  if (!target) return { matched: false };
  for (const option of options) {
    const entry = option && typeof option === 'object' ? option : { value: option, label: String(option) };
    const label = entry.label != null ? String(entry.label).trim().toLowerCase() : '';
    const value = entry.value;
    const valueText = value != null ? String(value).toLowerCase() : '';
    if (label === target || valueText === target) {
      return { matched: true, value };
    }
  }
  return { matched: false };
}

export function convertSelectValue(raw: string, column: EnhancedColumnConfig): CellConvertResult {
  const options = getFieldOptions(column.field);
  if (!options.length) {
    // 无选项定义时无法转换，保留原文
    return { value: raw.trim(), issue: true };
  }
  const isMulti = ['multipleSelect', 'checkboxGroup'].includes(column.field?.interface);
  const texts = isMulti
    ? raw
        .trim()
        .split(/[,，;；、|]/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [raw.trim()];
  const values: any[] = [];
  for (const text of texts) {
    const hit = matchEnumOption(options, text);
    if (!hit.matched) {
      return { value: raw.trim(), issue: true };
    }
    values.push(hit.value);
  }
  return { value: isMulti ? values : values[0] };
}

export function convertBooleanValue(raw: string): CellConvertResult {
  const token = raw.trim().toLowerCase();
  if (TRUE_TOKENS.has(token)) return { value: true };
  if (FALSE_TOKENS.has(token)) return { value: false };
  return { value: raw.trim(), issue: true };
}

function parseDateText(text: string): dayjs.Dayjs | null {
  const trimmed = text.trim();
  for (const format of DATE_PARSE_FORMATS) {
    const parsed = dayjs(trimmed, format);
    if (parsed.isValid()) {
      return parsed;
    }
  }
  const fallback = dayjs(trimmed);
  return fallback.isValid() ? fallback : null;
}

function parseTimeText(text: string): string | null {
  const trimmed = text.trim();
  for (const format of TIME_PARSE_FORMATS) {
    const parsed = dayjs(trimmed, format);
    if (parsed.isValid()) {
      return parsed.format('HH:mm:ss');
    }
  }
  return null;
}

export function convertDateValue(raw: string, column: EnhancedColumnConfig): CellConvertResult {
  const parsed = parseDateText(raw);
  if (!parsed) {
    return { value: raw.trim(), issue: true };
  }
  const iface = column.field?.interface;
  const props = column.field?.uiSchema?.['x-component-props'] || {};
  if (iface === 'date' || (iface === 'datetimeNoTz' && !props.showTime)) {
    return { value: parsed.format('YYYY-MM-DD') };
  }
  if (iface === 'datetimeNoTz') {
    return { value: parsed.format('YYYY-MM-DD HH:mm:ss') };
  }
  // datetime(带时区)/createdAt/updatedAt：取本地时刻转 UTC ISO，等价于原生 DatePicker 提交值
  const withTime = props.showTime || /T|(?:^|\s)\d{1,2}:\d{2}/.test(raw.trim());
  const normalized = withTime ? parsed : parsed.startOf('day');
  return { value: normalized.toISOString() };
}

export function convertCellValue(
  raw: string,
  column: EnhancedColumnConfig,
  assocRecords?: Map<string, any>,
): CellConvertResult {
  const text = raw.trim();
  if (!text) {
    return { value: null };
  }
  const iface = column.field?.interface;
  if (isBelongsToAssociationColumn(column)) {
    // 关联（下拉）列：粘贴的显示文本 → 目标记录对象（与原生下拉写入值一致）
    const record = assocRecords?.get(text);
    if (record) {
      return { value: record };
    }
    return { value: text, issue: true };
  }
  if (isNumberInterface(iface)) {
    const number = parseNumericText(text);
    return number == null ? { value: null, issue: true } : { value: number };
  }
  if (iface === 'percent') {
    const number = parseNumericText(text.replace(/%$/, ''));
    return number == null ? { value: null, issue: true } : { value: round9(number / 100) };
  }
  if (iface === 'time') {
    const time = parseTimeText(text);
    return time == null ? { value: text, issue: true } : { value: time };
  }
  if (DATE_INTERFACES.includes(iface ?? '')) {
    return convertDateValue(text, column);
  }
  if (SELECT_INTERFACES.includes(iface ?? '')) {
    return convertSelectValue(text, column);
  }
  if (iface === 'checkbox') {
    return convertBooleanValue(text);
  }
  return { value: text };
}

export function createPasteRow(): EnhancedSubTableRow {
  return {
    __is_new__: true,
    __index__: String(Date.now() + Math.random()),
  };
}

export function applyPasteMatrix(
  rows: EnhancedSubTableRow[],
  startRowIdx: number,
  startColIdx: number,
  matrix: string[][],
  columns: EnhancedColumnConfig[],
  assocRecords?: Record<string, Map<string, any>>,
): PasteResult {
  const next = rows.map((row) => ({ ...row }));
  const lookupTargets: PasteTarget[] = [];
  const issues: PasteTarget[] = [];
  let rowCount = 0;
  let colCount = 0;

  for (let ri = 0; ri < matrix.length; ri++) {
    const rowIndex = startRowIdx + ri;
    while (next.length <= rowIndex) {
      next.push(createPasteRow());
    }
    const row = { ...next[rowIndex] };
    for (let ci = 0; ci < matrix[ri].length; ci++) {
      const colIndex = startColIdx + ci;
      const column = columns[colIndex];
      if (!column) break;
      colCount = Math.max(colCount, ci + 1);
      if (column.formula) continue;
      const raw = matrix[ri][ci];
      if (column.lookup) {
        // 查找回填列：粘贴的匹配值原样写入，并登记后续批量校验/回填
        const value = raw.trim();
        row[column.dataIndex] = value;
        if (value) {
          lookupTargets.push({ rowIndex, dataIndex: column.dataIndex });
        }
      } else {
        const result = convertCellValue(raw, column, assocRecords?.[column.dataIndex]);
        row[column.dataIndex] = result.value;
        if (result.issue) {
          issues.push({ rowIndex, dataIndex: column.dataIndex });
        }
      }
    }
    next[rowIndex] = row;
    rowCount = ri + 1;
  }

  return { rows: next, lookupTargets, issues, rowCount, colCount };
}

/**
 * 行级新增：追加一条空白数据行。
 */
export function appendRow(rows: EnhancedSubTableRow[], createRow?: () => EnhancedSubTableRow): EnhancedSubTableRow[] {
  return [...rows, (createRow ?? createPasteRow)()];
}

/**
 * 行级删除：按下标移除行。
 */
export function removeRowAt(rows: EnhancedSubTableRow[], rowIdx: number): EnhancedSubTableRow[] {
  return rows.filter((_, index) => index !== rowIdx);
}

export type CopyRowOptions = {
  filterTargetKey?: string | string[];
  /**
   * 复制使用的数据快照。行内单元格数据由表单直接提交，组件本地 rows 可能滞后，
   * 复制前需以表单里的“最新提交值”为准，避免复制到旧值。
   */
  sourceOverride?: EnhancedSubTableRow;
};

/**
 * 行级复制：把指定行完整复制（深拷贝，关联列等嵌套值与源行彻底隔离），
 * 并紧跟在该行之后插入复制行。复制已保存记录时去掉主键值，确保提交时作为新记录创建。
 * 提供了 sourceOverride 时，会同时把源行刷新为最新提交值再复制。
 */
export function copyRowAt(
  rows: EnhancedSubTableRow[],
  rowIdx: number,
  options: CopyRowOptions = {},
): EnhancedSubTableRow[] | null {
  if (rowIdx < 0 || rowIdx >= rows.length) return null;
  const base = options.sourceOverride ?? rows[rowIdx];
  if (!base) return null;
  const { filterTargetKey } = options;
  const copied: EnhancedSubTableRow = deepCloneRow(base);
  copied.__index__ = uid();
  copied.__is_new__ = true;
  delete copied.__is_stored__;
  // 复制已保存记录时去掉主键值，确保提交时作为新记录创建
  if (typeof filterTargetKey === 'string') {
    delete copied[filterTargetKey];
  } else if (Array.isArray(filterTargetKey)) {
    filterTargetKey.forEach((key) => delete copied[key]);
  }

  const next = [...rows];
  // 源行同步为最新提交值，避免后续 rows→表单写入把单元格刚改的值覆盖回去
  next[rowIdx] = base;
  next.splice(rowIdx + 1, 0, copied);
  return next;
}

type FilterTargetKey = string | string[] | null | undefined;

function getPersistedRowKey(record: EnhancedSubTableRow, filterTargetKey: FilterTargetKey): string | null {
  if (!filterTargetKey) return null;
  if (Array.isArray(filterTargetKey)) {
    const values = filterTargetKey.map((key) => record?.[key]);
    if (values.some((value) => value == null)) return null;
    return values.map((value) => String(value)).join('__');
  }
  const value = record?.[filterTargetKey];
  return value == null ? null : String(value);
}

export function getSubTableRowIdentity(record: EnhancedSubTableRow, filterTargetKey: FilterTargetKey): string | null {
  const tempKey = record?.__index__;
  if (record?.__is_new__ && tempKey != null && tempKey !== '') {
    return `tmp:${String(tempKey)}`;
  }
  const persistedKey = getPersistedRowKey(record, filterTargetKey);
  if (persistedKey != null) {
    return `pk:${persistedKey}`;
  }
  if (tempKey != null && tempKey !== '') {
    return `tmp:${String(tempKey)}`;
  }
  return null;
}

export function normalizeSubTableRows(rows: EnhancedSubTableRow[]): EnhancedSubTableRow[] {
  if (!rows.length) return rows;
  let changed = false;
  const normalized = rows.map((row) => {
    const tempKey = row?.__index__;
    if (!row.__is_new__ || (tempKey != null && tempKey !== '')) {
      return row;
    }
    changed = true;
    return {
      ...row,
      __index__: uid(),
    };
  });
  return changed ? normalized : rows;
}

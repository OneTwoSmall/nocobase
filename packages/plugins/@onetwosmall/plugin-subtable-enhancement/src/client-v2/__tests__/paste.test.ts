/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';
import {
  appendRow,
  applyPasteMatrix,
  convertCellValue,
  copyRowAt,
  isNumberInterface,
  parsePasteText,
  removeRowAt,
} from '../utils/paste';
import { createRow, type EnhancedColumnConfig, type EnhancedSubTableRow } from '../utils/types';

const columns: EnhancedColumnConfig[] = [
  { dataIndex: 'material_code', field: { interface: 'input' } },
  { dataIndex: 'materialName', field: { interface: 'input' } },
  { dataIndex: 'nastnum', field: { interface: 'number' } },
  { dataIndex: 'budget_amount', field: { interface: 'number' }, formula: 'nastnum * budget_price' },
];

describe('parsePasteText', () => {
  it('parses tab-separated rows from clipboard text', () => {
    expect(parsePasteText('a\tb\nc\td')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('preserves interior blank lines and only trims trailing empties', () => {
    // Excel 范围内含空行时需保留空行结构，避免数据整体上移
    expect(parsePasteText('a\n\nb\n')).toEqual([['a'], [''], ['b']]);
    expect(parsePasteText('a\tb\n\nc\td\n')).toEqual([['a', 'b'], [''], ['c', 'd']]);
    expect(parsePasteText('a\n\n')).toEqual([['a']]);
  });

  it('returns an empty array for empty input', () => {
    expect(parsePasteText('')).toEqual([]);
    expect(parsePasteText('  \n ')).toEqual([]);
  });
});

describe('isNumberInterface', () => {
  it('detects number-like interfaces (percent handled separately)', () => {
    expect(isNumberInterface('number')).toBe(true);
    expect(isNumberInterface('integer')).toBe(true);
    expect(isNumberInterface('double')).toBe(true);
    expect(isNumberInterface('percent')).toBe(false);
    expect(isNumberInterface('input')).toBe(false);
  });
});

describe('convertCellValue', () => {
  const selectCol = (options: any[]) => ({
    dataIndex: 'priority',
    field: { interface: 'select', uiSchema: { enum: options } },
  });
  const fieldOf = (interfaceName: string, extra: any = {}) => ({
    dataIndex: 'f',
    field: { interface: interfaceName, ...extra },
  });

  it('keeps trimmed strings for text columns', () => {
    expect(convertCellValue('  ABC-001  ', columns[0])).toEqual({ value: 'ABC-001' });
  });

  it('parses numbers (incl. thousand separators) and flags invalid ones', () => {
    expect(convertCellValue('12.5', columns[2])).toEqual({ value: 12.5 });
    expect(convertCellValue('1,234.5', columns[2])).toEqual({ value: 1234.5 });
    expect(convertCellValue('abc', columns[2])).toEqual({ value: null, issue: true });
    expect(convertCellValue('', columns[2])).toEqual({ value: null });
  });

  it('converts empty text to null', () => {
    expect(convertCellValue('  ', columns[0])).toEqual({ value: null });
  });

  it('converts percent values to fractions', () => {
    const col = fieldOf('percent');
    expect(convertCellValue('50%', col)).toEqual({ value: 0.5 });
    expect(convertCellValue('50', col)).toEqual({ value: 0.5 });
    expect(convertCellValue('12.5%', col)).toEqual({ value: 0.125 });
    expect(convertCellValue('abc%', col)).toEqual({ value: null, issue: true });
  });

  it('converts select labels to option values', () => {
    const col = selectCol([
      { label: '紧急', value: 'urgent' },
      { label: '普通', value: 'normal' },
    ]);
    expect(convertCellValue('紧急', col)).toEqual({ value: 'urgent' });
    expect(convertCellValue(' 普通 ', col)).toEqual({ value: 'normal' });
    // Excel 里直接复制了 value 也能识别
    expect(convertCellValue('urgent', col)).toEqual({ value: 'urgent' });
    // 未匹配 → 保留原文并标记 issue
    expect(convertCellValue('不存在', col)).toEqual({ value: '不存在', issue: true });
  });

  it('matches enum values case-insensitively', () => {
    const col = selectCol([{ label: '紧急', value: 'Urgent' }]);
    expect(convertCellValue('urgent', col)).toEqual({ value: 'Urgent' });
  });

  it('supports primitive enums and integer-coerced values', () => {
    const col = selectCol([
      { label: 'A', value: 1 },
      { label: 'B', value: 2 },
    ]);
    expect(convertCellValue('B', col)).toEqual({ value: 2 });
  });

  it('converts multipleSelect labels to an array of values', () => {
    const col = {
      dataIndex: 'tags',
      field: {
        interface: 'multipleSelect',
        uiSchema: {
          enum: [
            { label: 'a', value: '1' },
            { label: 'b', value: '2' },
            { label: 'c', value: '3' },
          ],
        },
      },
    };
    expect(convertCellValue('a,b', col)).toEqual({ value: ['1', '2'] });
    expect(convertCellValue('a，b、c', col)).toEqual({ value: ['1', '2', '3'] });
    expect(convertCellValue('a;x', col)).toEqual({ value: 'a;x', issue: true });
  });

  it('converts checkboxGroup labels to an array of values', () => {
    const col = {
      dataIndex: 'checks',
      field: { interface: 'checkboxGroup', uiSchema: { enum: [{ label: '甲', value: 'j' }] } },
    };
    expect(convertCellValue('甲', col)).toEqual({ value: ['j'] });
  });

  it('converts boolean tokens for checkbox fields', () => {
    const col = fieldOf('checkbox');
    expect(convertCellValue('是', col)).toEqual({ value: true });
    expect(convertCellValue('√', col)).toEqual({ value: true });
    expect(convertCellValue('否', col)).toEqual({ value: false });
    expect(convertCellValue('0', col)).toEqual({ value: false });
    expect(convertCellValue('maybe', col)).toEqual({ value: 'maybe', issue: true });
  });

  it('converts date-only text for date fields', () => {
    const col = fieldOf('date');
    expect(convertCellValue('2024/1/5', col)).toEqual({ value: '2024-01-05' });
    expect(convertCellValue('2024-01-05', col)).toEqual({ value: '2024-01-05' });
    expect(convertCellValue('2024.1.5', col)).toEqual({ value: '2024-01-05' });
    expect(convertCellValue('2024年1月5日', col)).toEqual({ value: '2024-01-05' });
  });

  it('keeps the raw text when the date cannot be parsed', () => {
    const col = fieldOf('date');
    expect(convertCellValue('下周一', col)).toEqual({ value: '下周一', issue: true });
  });

  it('converts datetimeNoTz with or without time part per showTime', () => {
    const noTime = fieldOf('datetimeNoTz', { uiSchema: { 'x-component-props': { showTime: false } } });
    expect(convertCellValue('2024-01-05', noTime)).toEqual({ value: '2024-01-05' });

    const withTime = fieldOf('datetimeNoTz', { uiSchema: { 'x-component-props': { showTime: true } } });
    expect(convertCellValue('2024-01-05 10:30', withTime)).toEqual({ value: '2024-01-05 10:30:00' });
    expect(convertCellValue('2024-01-05 10:30:45', withTime)).toEqual({ value: '2024-01-05 10:30:45' });
  });

  it('converts datetime fields to a UTC ISO string', () => {
    const col = fieldOf('datetime', { uiSchema: { 'x-component-props': { showTime: true } } });
    // ISO 基于本地时刻转换，与原生 DatePicker 提交的 Date 序列化一致（测试需时区无关）
    expect(convertCellValue('2024-01-05 10:30:00', col)).toEqual({
      value: new Date(2024, 0, 5, 10, 30, 0).toISOString(),
    });
    // 无时间组件：取当日 00:00
    const noTime = fieldOf('datetime');
    expect(convertCellValue('2024-01-05', noTime)).toEqual({ value: new Date(2024, 0, 5).toISOString() });
  });

  it('converts time text to HH:mm:ss', () => {
    const col = fieldOf('time');
    expect(convertCellValue('10:30', col)).toEqual({ value: '10:30:00' });
    expect(convertCellValue('8:05:30', col)).toEqual({ value: '08:05:30' });
    expect(convertCellValue('x点', col)).toEqual({ value: 'x点', issue: true });
  });
});

describe('applyPasteMatrix', () => {
  it('fills cells from the target position and extends rows', () => {
    const rows = [createRow()];
    const matrix = [
      ['M-001', '物料一', '5'],
      ['M-002', '物料二', '10'],
    ];
    const result = applyPasteMatrix(rows, 0, 0, matrix, columns);
    expect(result.rowCount).toBe(2);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ material_code: 'M-001', materialName: '物料一', nastnum: 5 });
    expect(result.rows[1]).toMatchObject({ material_code: 'M-002', materialName: '物料二', nastnum: 10 });
  });

  it('skips formula columns while filling', () => {
    const rows = [createRow()];
    const result = applyPasteMatrix(rows, 0, 0, [['M-001', '物料一', '5', '999']], columns);
    expect(result.rows[0]).toMatchObject({ material_code: 'M-001', materialName: '物料一', nastnum: 5 });
    expect(result.rows[0].budget_amount).toBeUndefined();
  });

  it('collects lookup targets for lookup columns', () => {
    const lookupColumns: EnhancedColumnConfig[] = [
      {
        dataIndex: 'material_code',
        field: { interface: 'input' },
        lookup: { targetCollection: 'materials', targetField: 'material_code', mappings: [] },
      },
    ];
    const rows = [createRow()];
    const result = applyPasteMatrix(rows, 0, 0, [['M-001']], lookupColumns);
    expect(result.lookupTargets).toEqual([{ rowIndex: 0, dataIndex: 'material_code' }]);
  });

  it('writes record objects for belongsTo columns even when a lookup config is present', () => {
    const assocWithLookup: EnhancedColumnConfig = {
      dataIndex: 'category',
      field: {
        interface: 'm2o',
        type: 'belongsTo',
        target: 'categories',
        targetCollectionTitleFieldName: 'name',
        targetCollection: { filterTargetKey: 'id' },
      },
      lookup: {
        targetCollection: 'categories',
        targetField: 'name',
        mappings: [{ sourceField: 'name', targetColumn: 'note' }],
      },
    };
    const noteColumn: EnhancedColumnConfig = { dataIndex: 'note', field: { interface: 'input' } };
    const rows = [createRow()];
    const assocRecords = new Map([['分类A', { id: 1, name: '分类A', note: 'x' }]]);
    const result = applyPasteMatrix(rows, 0, 0, [['分类A']], [assocWithLookup, noteColumn], {
      category: assocRecords,
    });
    // 关联下拉列（即使带 lookup 配置）仍按关联列写入目标记录对象
    expect(result.rows[0].category).toEqual({ id: 1, name: '分类A', note: 'x' });
    // 且不再进入“普通查找列”的标量校验队列
    expect(result.lookupTargets).toEqual([]);
  });

  it('appends rows when pasting beyond the current length', () => {
    const rows: any[] = [];
    const result = applyPasteMatrix(rows, 2, 0, [['x']], columns);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[2]).toMatchObject({ material_code: 'x' });
  });

  it('pastes from the clicked cell coordinates into existing rows (Excel-like)', () => {
    const rows: any[] = [
      { __index__: 'a', material_code: 'A', materialName: '甲', nastnum: 1 },
      { __index__: 'b', material_code: 'B', materialName: '乙', nastnum: 2 },
      { __index__: 'c', material_code: 'C', materialName: '丙', nastnum: 3 },
    ];
    const matrix = [
      ['X', '99'],
      ['Y', '88'],
    ];
    // 从第 2 行(下标1)第 2 列(下标1: materialName)开始粘贴
    const result = applyPasteMatrix(rows, 1, 1, matrix, columns);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toMatchObject({ material_code: 'A', materialName: '甲', nastnum: 1 });
    expect(result.rows[1]).toMatchObject({ material_code: 'B', materialName: 'X', nastnum: 99 });
    expect(result.rows[2]).toMatchObject({ material_code: 'C', materialName: 'Y', nastnum: 88 });
  });

  it('pastes exactly the matrix height when starting at the last row (no extra rows appended)', () => {
    const rows = [createRow()];
    const matrix = [
      ['M-001', '物料一', '5'],
      ['M-002', '物料二', '10'],
      ['M-003', '物料三', '15'],
    ];
    const result = applyPasteMatrix(rows, 0, 0, matrix, columns);
    expect(result.rows).toHaveLength(3);
    expect(result.rowCount).toBe(3);
    expect(result.rows[2]).toMatchObject({ material_code: 'M-003', materialName: '物料三', nastnum: 15 });
  });

  it('overwrites the target columns of an existing row while keeping untouched fields', () => {
    const rows = [{ __index__: 'a', materialName: '保留' }];
    const result = applyPasteMatrix(rows, 0, 0, [['M-001']], columns);
    expect(result.rows[0]).toMatchObject({ material_code: 'M-001', materialName: '保留' });
  });

  it('applies type-aware conversion and collects failed cells as issues', () => {
    const typedCols: EnhancedColumnConfig[] = [
      { dataIndex: 'required_date', field: { interface: 'date' } },
      {
        dataIndex: 'priority',
        field: { interface: 'select', uiSchema: { enum: [{ label: '紧急', value: 'urgent' }] } },
      },
      { dataIndex: 'nastnum', field: { interface: 'number' } },
    ];
    const rows = [createRow()];
    const result = applyPasteMatrix(
      rows,
      0,
      0,
      [
        ['2024/1/5', '紧急', '5'],
        ['坏日期', '没有此选项', 'abc'],
      ],
      typedCols,
    );
    expect(result.rows[0]).toMatchObject({ required_date: '2024-01-05', priority: 'urgent', nastnum: 5 });
    expect(result.rows[1]).toMatchObject({ required_date: '坏日期', priority: '没有此选项', nastnum: null });
    expect(result.issues).toEqual([
      { rowIndex: 1, dataIndex: 'required_date' },
      { rowIndex: 1, dataIndex: 'priority' },
      { rowIndex: 1, dataIndex: 'nastnum' },
    ]);
  });
});

describe('appendRow (新增行)', () => {
  it('appends one blank data row to the list', () => {
    const rows: EnhancedSubTableRow[] = [{ material_code: 'A', __index__: 'a' }];
    const next = appendRow(rows);
    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({ material_code: 'A' });
    expect(next[1]).toMatchObject({ __is_new__: true });
    expect(next[1].__index__).toBeTruthy();
  });

  it('does not mutate the original list', () => {
    const rows: EnhancedSubTableRow[] = [];
    appendRow(rows);
    expect(rows).toHaveLength(0);
  });
});

describe('removeRowAt (行删除)', () => {
  it('removes the row at the given index', () => {
    const rows = [
      { material_code: 'A', __index__: 'a' },
      { material_code: 'B', __index__: 'b' },
    ];
    const next = removeRowAt(rows, 1);
    expect(next).toEqual([{ material_code: 'A', __index__: 'a' }]);
  });

  it('returns an empty list when the last row is removed', () => {
    const rows = [{ material_code: 'A', __index__: 'a' }];
    expect(removeRowAt(rows, 0)).toEqual([]);
  });
});

describe('copyRowAt (复制行)', () => {
  it('duplicates the row right after itself with its data', () => {
    const rows: EnhancedSubTableRow[] = [
      { material_code: 'M-001', materialName: '螺栓', __index__: 'a', __is_new__: true },
    ];
    const result = copyRowAt(rows, 0);
    if (!result) throw new Error('expected copied rows');
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ material_code: 'M-001', materialName: '螺栓' });
    expect(result[1]).toMatchObject({ material_code: 'M-001', materialName: '螺栓' });
    expect(result[1].__index__).not.toBe('a');
    expect(result[1].__is_new__).toBe(true);
  });

  it('returns null when there is no source row', () => {
    expect(copyRowAt([], 0)).toBeNull();
  });

  it('strips the primary key of the copied persisted row so it is saved as a new record', () => {
    const rows: EnhancedSubTableRow[] = [{ id: 1, material_code: 'M-001', __index__: 'a' }];
    const result = copyRowAt(rows, 0, { filterTargetKey: 'id' });
    if (!result) throw new Error('expected copied rows');
    expect(result[1]).toMatchObject({ material_code: 'M-001', __is_new__: true });
    expect(result[1].id).toBeUndefined();
    expect(result[1].__is_stored__).toBeUndefined();
  });

  it('uses sourceOverride as the live snapshot and refreshes the source row (copy-after-commit fix)', () => {
    const rows: EnhancedSubTableRow[] = [{ material_code: '旧值', __index__: 'a', __is_new__: true }];
    const liveRow = { material_code: '新值', __index__: 'a', __is_new__: true };
    const result = copyRowAt(rows, 0, { sourceOverride: liveRow });
    if (!result) throw new Error('expected copied rows');
    // 源行被刷新为最新提交值，复制行携带最新值，而不是旧值
    expect(result[0]).toMatchObject({ material_code: '新值' });
    expect(result[1]).toMatchObject({ material_code: '新值' });
    expect(result[1]).not.toBe(liveRow);
  });

  it('deep-copies nested association record objects so the copy is fully isolated', () => {
    const supplier = { id: 7, name: '供应商A', tags: ['a', 'b'] };
    const rows: EnhancedSubTableRow[] = [
      {
        material_code: 'M-001',
        supplier,
        extra: { nested: { value: 1 } },
        __index__: 'src',
        __is_stored__: true,
      },
    ];
    const result = copyRowAt(rows, 0, { filterTargetKey: 'id' });
    if (!result) throw new Error('expected copied rows');
    const copied = result[1];
    expect(copied).toMatchObject({
      material_code: 'M-001',
      supplier: { id: 7, name: '供应商A', tags: ['a', 'b'] },
      extra: { nested: { value: 1 } },
      __is_new__: true,
    });
    // 引用完全隔离：修改复制行的嵌套关联值不影响原始行
    expect(copied.supplier).not.toBe(rows[0].supplier);
    copied.supplier.name = '供应商B';
    copied.supplier.tags.push('c');
    copied.extra.nested.value = 999;
    expect(rows[0].supplier).toEqual({ id: 7, name: '供应商A', tags: ['a', 'b'] });
    expect(rows[0].extra).toEqual({ nested: { value: 1 } });
  });

  it('keeps scalar date/select values intact while deep copying', () => {
    const date = new Date(2024, 0, 5, 10, 0, 0);
    const rows: EnhancedSubTableRow[] = [{ required_date: date, priority: 'urgent', __index__: 'src' }];
    const result = copyRowAt(rows, 0);
    if (!result) throw new Error('expected copied rows');
    const copied = result[1];
    expect(copied.required_date).toEqual(date);
    expect(copied.required_date).not.toBe(date);
    expect(copied.priority).toBe('urgent');
  });
});

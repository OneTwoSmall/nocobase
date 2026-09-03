/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  collectAssociationPasteTexts,
  collectBelongsToColumnIndexes,
  collectLookupPasteTexts,
  getAssociationColumnMeta,
  isBelongsToAssociationColumn,
  resolveAssociationRecordsByText,
  toAssociationCellValue,
  wrapAssociationLookupFill,
} from '../utils/association';
import { applyPasteMatrix, convertCellValue } from '../utils/paste';
import { createRow, type EnhancedColumnConfig } from '../utils/types';

const m2oField: any = {
  interface: 'm2o',
  type: 'belongsTo',
  target: 'categories',
  targetCollectionTitleFieldName: 'name',
  targetCollection: { filterTargetKey: 'id' },
  collection: { dataSourceKey: 'main' },
};
const m2oColumn: EnhancedColumnConfig = { dataIndex: 'category', field: m2oField };

describe('isBelongsToAssociationColumn', () => {
  it('detects belongsTo single association columns only', () => {
    expect(isBelongsToAssociationColumn(m2oColumn)).toBe(true);
    expect(isBelongsToAssociationColumn({ dataIndex: 'x', field: { interface: 'obo', target: 'a' } })).toBe(true);
    expect(isBelongsToAssociationColumn({ dataIndex: 'x', field: { interface: 'o2m', target: 'a' } })).toBe(false);
    expect(isBelongsToAssociationColumn({ dataIndex: 'x', field: { interface: 'oho', target: 'a' } })).toBe(false);
    expect(
      isBelongsToAssociationColumn({
        dataIndex: 'x',
        field: { interface: 'm2o', target: 'a' },
        lookup: { targetCollection: 'a', targetField: 'id', mappings: [] },
      }),
    ).toBe(false);
    expect(
      isBelongsToAssociationColumn({ dataIndex: 'x', field: { interface: 'm2o', target: 'a' }, formula: 'a' }),
    ).toBe(false);
    expect(isBelongsToAssociationColumn({ dataIndex: 'x', field: { interface: 'select' } })).toBe(false);
  });
});

describe('getAssociationColumnMeta', () => {
  it('resolves the title field and data source of the target collection', () => {
    const meta = getAssociationColumnMeta(m2oColumn);
    expect(meta).toEqual({
      dataIndex: 'category',
      collectionName: 'categories',
      titleField: 'name',
      idField: 'id',
      dataSourceKey: 'main',
    });
  });

  it('falls back to the target filterTargetKey when no title field is configured', () => {
    const col: EnhancedColumnConfig = {
      dataIndex: 'category',
      field: { interface: 'm2o', target: 'categories', targetCollection: { filterTargetKey: 'id' } },
    };
    expect(getAssociationColumnMeta(col)?.titleField).toBe('id');
  });

  it('prefers the currently displayed column field over the collection title field', () => {
    const col: EnhancedColumnConfig = { dataIndex: 'category', titleField: 'code', field: m2oField };
    expect(getAssociationColumnMeta(col)?.titleField).toBe('code');
  });

  it('skips columns without a usable title field or target', () => {
    const noTarget: EnhancedColumnConfig = { dataIndex: 'category', field: { interface: 'm2o' } };
    expect(getAssociationColumnMeta(noTarget)).toBeNull();
    const composite: EnhancedColumnConfig = {
      dataIndex: 'category',
      field: { interface: 'm2o', target: 'categories', targetCollection: { filterTargetKey: ['a', 'b'] } },
    };
    expect(getAssociationColumnMeta(composite)).toBeNull();
  });
});

describe('toAssociationCellValue / wrapAssociationLookupFill (关联列回填包装)', () => {
  it('wraps a scalar id into a target-record object', () => {
    expect(toAssociationCellValue(m2oField, 5)).toEqual({ id: 5 });
    expect(toAssociationCellValue(m2oField, 'cat-1')).toEqual({ id: 'cat-1' });
    expect(toAssociationCellValue(m2oField, null)).toBeNull();
    expect(toAssociationCellValue(m2oField, undefined)).toBeUndefined();
  });

  it('keeps object values untouched', () => {
    const record = { id: 5, name: '分类A' };
    expect(toAssociationCellValue(m2oField, record)).toBe(record);
  });

  it('uses a custom targetKey when configured', () => {
    const field = { ...m2oField, targetKey: 'code' };
    expect(toAssociationCellValue(field, 'c1')).toEqual({ code: 'c1' });
  });

  it('wraps association mapping targets during lookup fill', () => {
    const textColumn: EnhancedColumnConfig = { dataIndex: 'note', field: { interface: 'input' } };
    const indexes = collectBelongsToColumnIndexes([m2oColumn, textColumn]);
    expect(indexes.has('category')).toBe(true);
    expect(indexes.has('note')).toBe(false);

    const lookup = {
      targetCollection: 'materials',
      targetField: 'material_code',
      mappings: [
        { sourceField: 'categoryId', targetColumn: 'category' },
        { sourceField: 'name', targetColumn: 'note' },
      ],
    };
    const row = { material_code: 'M-001' };
    const record = { material_code: 'M-001', categoryId: 9, name: '螺栓' };
    const filled = wrapAssociationLookupFill(row, lookup, record, [m2oColumn, textColumn], indexes);
    expect(filled.category).toEqual({ id: 9 });
    expect(filled.note).toBe('螺栓');
  });
});

describe('resolveAssociationRecordsByText', () => {
  it('queries the target collection once with $in and maps text to records', async () => {
    const api = {
      request: vi.fn().mockResolvedValue({
        data: {
          data: [
            { id: 1, name: '分类A' },
            { id: 2, name: '分类B' },
          ],
          meta: {},
        },
      }),
    };
    const meta = getAssociationColumnMeta(m2oColumn);
    if (!meta) throw new Error('expected association column meta');
    const map = await resolveAssociationRecordsByText(api, meta, ['分类A', '分类B', '分类A']);
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'categories:list',
        params: expect.objectContaining({
          page: 1,
          pageSize: 2,
          filter: JSON.stringify({ name: { $in: ['分类A', '分类B'] } }),
        }),
      }),
    );
    expect(map.get('分类A')).toEqual({ id: 1, name: '分类A' });
    expect(map.get('分类B')).toEqual({ id: 2, name: '分类B' });
    expect(map.has('不存在')).toBe(false);
  });

  it('returns an empty map when nothing is queried', async () => {
    const api = { request: vi.fn() };
    const meta = getAssociationColumnMeta(m2oColumn);
    if (!meta) throw new Error('expected association column meta');
    expect((await resolveAssociationRecordsByText(api, meta, [])).size).toBe(0);
    expect((await resolveAssociationRecordsByText(undefined as any, meta, ['x'])).size).toBe(0);
    expect(api.request).not.toHaveBeenCalled();
  });

  it('falls back to matching the target primary key when the title field misses', async () => {
    const api = {
      request: vi
        .fn()
        .mockResolvedValueOnce({ data: { data: [{ id: 1, name: '分类A' }], meta: {} } })
        .mockResolvedValueOnce({ data: { data: [], meta: {} } }),
    };
    const meta = getAssociationColumnMeta(m2oColumn);
    if (!meta) throw new Error('expected association column meta');
    // '分类A' 标题命中；'不存在' 标题未命中 → 回退按 id 再查一次，仍无匹配
    const map = await resolveAssociationRecordsByText(api, meta, ['分类A', '不存在']);
    expect(map.get('分类A')).toEqual({ id: 1, name: '分类A' });
    expect(map.has('不存在')).toBe(false);
    expect(api.request).toHaveBeenCalledTimes(2);
    expect(api.request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        params: expect.objectContaining({
          filter: JSON.stringify({ id: { $in: ['不存在'] } }),
        }),
      }),
    );
  });

  it('matches pasted numeric ids against the record primary key', async () => {
    const api = {
      request: vi
        .fn()
        .mockResolvedValueOnce({ data: { data: [], meta: {} } })
        .mockResolvedValueOnce({
          data: { data: [{ id: 12, name: '分类12' }], meta: {} },
        }),
    };
    const meta = getAssociationColumnMeta(m2oColumn);
    if (!meta) throw new Error('expected association column meta');
    const map = await resolveAssociationRecordsByText(api, meta, ['12']);
    expect(map.get('12')).toEqual({ id: 12, name: '分类12' });
  });

  it('does not issue an id fallback query when idField equals titleField', async () => {
    const col: EnhancedColumnConfig = {
      dataIndex: 'category',
      field: {
        interface: 'm2o',
        target: 'categories',
        targetCollectionTitleFieldName: 'id',
        targetCollection: { filterTargetKey: 'id' },
      },
    };
    const api = {
      request: vi.fn().mockResolvedValue({ data: { data: [{ id: 3 }], meta: {} } }),
    };
    const meta = getAssociationColumnMeta(col);
    if (!meta) throw new Error('expected association column meta');
    const map = await resolveAssociationRecordsByText(api, meta, ['3']);
    expect(map.get('3')).toEqual({ id: 3 });
    expect(api.request).toHaveBeenCalledTimes(1);
  });
});

describe('convertCellValue for association columns', () => {
  it('writes the resolved target record for a matched text', () => {
    const map = new Map([['分类A', { id: 1, name: '分类A' }]]);
    expect(convertCellValue('分类A', m2oColumn, map)).toEqual({ value: { id: 1, name: '分类A' } });
  });

  it('keeps the raw text and flags an issue when no record matches', () => {
    const map = new Map([['分类A', { id: 1, name: '分类A' }]]);
    expect(convertCellValue('不存在的分类', m2oColumn, map)).toEqual({ value: '不存在的分类', issue: true });
    expect(convertCellValue('分类A', m2oColumn)).toEqual({ value: '分类A', issue: true });
  });
});

describe('applyPasteMatrix with association columns', () => {
  it('fills matched records and flags unmatched ones', () => {
    const rows = [createRow()];
    const map = new Map([['分类A', { id: 1, name: '分类A' }]]);
    const result = applyPasteMatrix(rows, 0, 0, [['分类A'], ['不存在']], [m2oColumn], { category: map });
    expect(result.rows[0]).toMatchObject({ category: { id: 1, name: '分类A' } });
    expect(result.rows[1]).toMatchObject({ category: '不存在' });
    expect(result.issues).toEqual([{ rowIndex: 1, dataIndex: 'category' }]);
  });
});

describe('collectAssociationPasteTexts', () => {
  it('collects deduplicated texts per association column from the matrix', () => {
    const textColumn: EnhancedColumnConfig = { dataIndex: 'note', field: { interface: 'input' } };
    const matrix = [
      ['分类A', '备注1'],
      ['分类B', '备注2'],
      ['分类A', '备注3'],
    ];
    const tasks = collectAssociationPasteTexts(matrix, 0, 0, [m2oColumn, textColumn]);
    expect(tasks).toEqual([{ columnIndex: 0, texts: ['分类A', '分类B'] }]);
  });

  it('respects the start column offset', () => {
    // 从第 2 个数据列(下标1，即 m2o 列)开始粘贴
    const textColumn: EnhancedColumnConfig = { dataIndex: 'note', field: { interface: 'input' } };
    const matrix = [['分类A']];
    const tasks = collectAssociationPasteTexts(matrix, 0, 1, [textColumn, m2oColumn]);
    expect(tasks).toEqual([{ columnIndex: 1, texts: ['分类A'] }]);
  });
});

describe('collectLookupPasteTexts', () => {
  const lookupColumn: EnhancedColumnConfig = {
    dataIndex: 'material_code',
    field: { interface: 'input' },
    lookup: { targetCollection: 'materials', targetField: 'material_code', mappings: [] },
  };

  it('collects deduplicated texts from lookup configured columns only', () => {
    const matrix = [
      ['M-001', '分类A'],
      ['M-002', '分类B'],
      ['M-001', '分类A'],
    ];
    const tasks = collectLookupPasteTexts(matrix, 0, 0, [lookupColumn, m2oColumn]);
    expect(tasks).toEqual([{ columnIndex: 0, texts: ['M-001', 'M-002'] }]);
  });

  it('respects the start column offset and skips non-lookup columns', () => {
    const matrix = [['M-001']];
    const tasks = collectLookupPasteTexts(matrix, 0, 1, [m2oColumn, lookupColumn]);
    expect(tasks).toEqual([{ columnIndex: 1, texts: ['M-001'] }]);
  });
});

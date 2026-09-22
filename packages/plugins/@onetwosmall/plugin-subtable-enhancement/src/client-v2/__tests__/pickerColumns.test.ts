/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';

import { estimateTextWidth, formatPickerCellValue, resolvePickerColumn } from '../utils/pickerColumns';

function field(name: string, title: string, extra: Record<string, any> = {}) {
  return { name, title, interface: 'input', ...extra };
}

const unitsCollection: any = {
  getField: (name: string) =>
    ({
      id: field('id', 'ID', { interface: 'number' }),
      unit_name: field('unit_name', '单位名称'),
      unit_code: field('unit_code', '单位编码'),
    })[name],
};

const materialsCollection: any = {
  getField: (name: string) =>
    ({
      name: field('name', '物料名称'),
      primary_unit: field('primary_unit', '主单位', {
        interface: 'm2o',
        target: 'units',
        targetCollection: unitsCollection,
        targetCollectionTitleFieldName: 'unit_name',
      }),
      supplier: field('supplier', '供应商', {
        interface: 'm2o',
        target: 'suppliers',
        targetCollection: {
          getField: (inner: string) =>
            inner === 'company'
              ? field('company', '公司', {
                  interface: 'm2o',
                  target: 'companies',
                  targetCollection: {
                    getField: (leaf: string) => (leaf === 'name' ? field('name', '公司名称') : undefined),
                    titleCollectionField: { name: 'name' },
                  },
                  targetCollectionTitleFieldName: 'name',
                })
              : inner === 'name'
                ? field('name', '供应商名称')
                : undefined,
          titleCollectionField: { name: 'name' },
        },
        targetCollectionTitleFieldName: 'name',
      }),
    })[name],
};

describe('resolvePickerColumn', () => {
  it('resolves a plain scalar field', () => {
    expect(resolvePickerColumn(materialsCollection, 'name')).toEqual({
      path: 'name',
      title: '物料名称',
      displayPath: 'name',
      isAssociation: false,
    });
  });

  it('resolves a trailing association field to its target title field', () => {
    expect(resolvePickerColumn(materialsCollection, 'primary_unit')).toEqual({
      path: 'primary_unit',
      title: '主单位 · 单位名称',
      displayPath: 'primary_unit.unit_name',
      isAssociation: true,
    });
  });

  it('keeps an explicit nested scalar path', () => {
    expect(resolvePickerColumn(materialsCollection, 'primary_unit.unit_code')).toEqual({
      path: 'primary_unit.unit_code',
      title: '单位编码',
      displayPath: 'primary_unit.unit_code',
      isAssociation: false,
    });
  });

  it('resolves a nested association field through multiple levels', () => {
    expect(resolvePickerColumn(materialsCollection, 'supplier.company')).toEqual({
      path: 'supplier.company',
      title: '公司 · 公司名称',
      displayPath: 'supplier.company.name',
      isAssociation: true,
    });
  });

  it('falls back to the raw path when metadata is missing', () => {
    expect(resolvePickerColumn(materialsCollection, 'unknown_field')).toEqual({
      path: 'unknown_field',
      title: 'unknown_field',
      displayPath: 'unknown_field',
      isAssociation: false,
    });
  });
});

describe('formatPickerCellValue', () => {
  it('formats empty values as a placeholder', () => {
    expect(formatPickerCellValue(null)).toBe('-');
    expect(formatPickerCellValue(undefined)).toBe('-');
    expect(formatPickerCellValue('')).toBe('-');
  });

  it('prefers common title-like keys for objects', () => {
    expect(formatPickerCellValue({ name: '螺栓' })).toBe('螺栓');
    expect(formatPickerCellValue({ title: '标题' })).toBe('标题');
  });

  it('falls back to JSON for objects without a title-like key', () => {
    expect(formatPickerCellValue({ unit_name: 'KG', id: 1 })).toBe('{"unit_name":"KG","id":1}');
  });

  it('joins array values', () => {
    expect(formatPickerCellValue(['a', 'b'])).toBe('a, b');
  });

  it('stringifies scalar values', () => {
    expect(formatPickerCellValue(42)).toBe('42');
    expect(formatPickerCellValue(false)).toBe('false');
  });
});

describe('estimateTextWidth', () => {
  it('returns 0 for empty text', () => {
    expect(estimateTextWidth('')).toBe(0);
    expect(estimateTextWidth(undefined)).toBe(0);
  });

  it('estimates CJK text wider than the same number of ASCII characters', () => {
    expect(estimateTextWidth('中文标题')).toBeGreaterThan(estimateTextWidth('abcd'));
  });
});

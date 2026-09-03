/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';
import { getFieldDisplayTitle, getFieldTitleMap } from '../utils/fieldMeta';

describe('getFieldDisplayTitle (数据源字段显示名称)', () => {
  it('prefers the uiSchema title, then the field title, then the field name', () => {
    expect(getFieldDisplayTitle({ name: 'qty', title: '数量', uiSchema: { title: '数量2' } })).toBe('数量2');
    expect(getFieldDisplayTitle({ name: 'qty', title: '数量' })).toBe('数量');
    expect(getFieldDisplayTitle({ name: 'qty' })).toBe('qty');
  });

  it('returns an empty string for missing fields', () => {
    expect(getFieldDisplayTitle(undefined)).toBe('');
    expect(getFieldDisplayTitle(null)).toBe('');
  });
});

describe('getFieldTitleMap', () => {
  it('builds a name → display-name map from a collection', () => {
    const collection = {
      getFields: () => [
        { name: 'material_code', title: '物料编码' },
        { name: 'nastnum', title: '数量' },
        { name: 'raw' },
      ],
    };
    expect(getFieldTitleMap(collection)).toEqual({
      material_code: '物料编码',
      nastnum: '数量',
      raw: 'raw',
    });
  });

  it('handles a collection without fields', () => {
    expect(getFieldTitleMap(undefined)).toEqual({});
    expect(getFieldTitleMap({ getFields: () => [] })).toEqual({});
  });
});

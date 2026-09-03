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
  applyLookupFill,
  clearLookupFields,
  lookupRecord,
  requestList,
  resolveLookupRecordsByText,
} from '../utils/lookup';
import type { LookupConfig } from '../utils/types';

const config: LookupConfig = {
  targetCollection: 'materials',
  targetField: 'material_code',
  mappings: [
    { sourceField: 'name', targetColumn: 'materialName' },
    { sourceField: 'specification', targetColumn: 'specification' },
    { sourceField: 'primary_unit.unit_name', targetColumn: 'second_unit_name' },
  ],
  searchFields: ['material_code', 'name', 'specification'],
};

describe('requestList', () => {
  it('requests the list action with params and returns items and meta', async () => {
    const api = {
      request: vi.fn().mockResolvedValue({
        data: { data: [{ id: 1 }], meta: { count: 1, page: 1, pageSize: 10 } },
      }),
    };
    const result = await requestList(api, 'main', 'materials', { page: 1, pageSize: 10 });
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'materials:list', method: 'get', params: { page: 1, pageSize: 10 } }),
    );
    expect(result.items).toEqual([{ id: 1 }]);
    expect(result.meta.count).toBe(1);
  });

  it('adds the X-Data-Source header for non-main data sources', async () => {
    const api = {
      request: vi.fn().mockResolvedValue({ data: { data: [], meta: {} } }),
    };
    await requestList(api, 'erp', 'materials', {});
    expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ headers: { 'X-Data-Source': 'erp' } }));
  });
});

describe('lookupRecord', () => {
  it('queries by the target field with equality filter', async () => {
    const api = {
      request: vi.fn().mockResolvedValue({
        data: { data: [{ id: 9, material_code: 'M-001' }], meta: { count: 1 } },
      }),
    };
    const record = await lookupRecord(api, 'main', config, 'M-001');
    expect(record).toEqual({ id: 9, material_code: 'M-001' });
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          filter: JSON.stringify({ material_code: 'M-001' }),
          pageSize: 1,
        }),
      }),
    );
  });

  it('returns null when no record matches', async () => {
    const api = {
      request: vi.fn().mockResolvedValue({ data: { data: [], meta: { count: 0 } } }),
    };
    expect(await lookupRecord(api, 'main', config, 'NOPE')).toBeNull();
  });

  it('returns null for missing config or empty value', async () => {
    const api = { request: vi.fn() };
    expect(await lookupRecord(api, 'main', undefined, 'x')).toBeNull();
    expect(await lookupRecord(api, 'main', config, '')).toBeNull();
    expect(api.request).not.toHaveBeenCalled();
  });
});

describe('resolveLookupRecordsByText', () => {
  it('batches a single $in query on the target field and maps matched records', async () => {
    const api = {
      request: vi.fn().mockResolvedValue({
        data: {
          data: [
            { id: 1, material_code: 'M-001', name: '螺栓' },
            { id: 2, material_code: 'M-002', name: '螺母' },
          ],
          meta: {},
        },
      }),
    };
    const map = await resolveLookupRecordsByText(api, 'main', config, ['M-001', 'M-002', 'M-001']);
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          filter: JSON.stringify({ material_code: { $in: ['M-001', 'M-002'] } }),
        }),
      }),
    );
    expect(map.get('M-001')).toEqual({ id: 1, material_code: 'M-001', name: '螺栓' });
    expect(map.get('M-002')).toEqual({ id: 2, material_code: 'M-002', name: '螺母' });
    expect(map.has('NOPE')).toBe(false);
  });

  it('falls back to search fields when the target field does not match', async () => {
    const api = {
      request: vi
        .fn()
        .mockResolvedValueOnce({ data: { data: [], meta: {} } })
        .mockResolvedValueOnce({ data: { data: [{ id: 3, material_code: 'M-003', name: '垫圈' }], meta: {} } }),
    };
    const map = await resolveLookupRecordsByText(api, 'main', config, ['垫圈']);
    expect(api.request).toHaveBeenCalledTimes(2);
    expect(api.request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        params: expect.objectContaining({ filter: JSON.stringify({ name: { $in: ['垫圈'] } }) }),
      }),
    );
    expect(map.get('垫圈')).toEqual({ id: 3, material_code: 'M-003', name: '垫圈' });
  });

  it('returns an empty map without querying when config is missing', async () => {
    const api = { request: vi.fn() };
    expect((await resolveLookupRecordsByText(api, 'main', undefined, ['x'])).size).toBe(0);
    expect((await resolveLookupRecordsByText(api, 'main', config, [])).size).toBe(0);
    expect(api.request).not.toHaveBeenCalled();
  });
});

describe('applyLookupFill', () => {
  it('fills mapped columns from the record including nested paths', () => {
    const row = { material_code: 'M-001' };
    const record = {
      material_code: 'M-001',
      name: '螺栓',
      specification: 'M8',
      primary_unit: { unit_name: '个' },
    };
    const filled = applyLookupFill(row, config, record);
    expect(filled).toMatchObject({
      material_code: 'M-001',
      materialName: '螺栓',
      specification: 'M8',
      second_unit_name: '个',
    });
  });

  it('keeps the original row object untouched', () => {
    const row: Record<string, any> = { material_code: 'M-001' };
    applyLookupFill(row, config, { name: 'x' });
    expect(row.materialName).toBeUndefined();
  });
});

describe('clearLookupFields', () => {
  it('clears mapped columns', () => {
    const row = { material_code: 'M-001', materialName: '螺栓', specification: 'M8' };
    const cleared = clearLookupFields(row, config);
    expect(cleared.materialName).toBeUndefined();
    expect(cleared.specification).toBeUndefined();
    expect(cleared.material_code).toBe('M-001');
  });
});

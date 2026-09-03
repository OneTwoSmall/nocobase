/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';
import { dedupeColumnModels, getColumnFieldName, isBelongsToField, isNumericField } from '../utils/columnIdentity';

describe('getColumnFieldName (列字段标识解析)', () => {
  it('prefers props.dataIndex', () => {
    expect(getColumnFieldName({ props: { dataIndex: 'material_code' } })).toBe('material_code');
  });

  it('falls back to the tail of fieldSettings.init.fieldPath', () => {
    expect(
      getColumnFieldName({
        getStepParams: () => ({ fieldPath: 'items.material_code' }),
      }),
    ).toBe('material_code');
  });

  it('falls back to collectionField.name', () => {
    expect(getColumnFieldName({ collectionField: { name: 'nastnum' } })).toBe('nastnum');
  });

  it('returns null when nothing can be resolved', () => {
    expect(getColumnFieldName({})).toBeNull();
    expect(getColumnFieldName(null)).toBeNull();
  });
});

describe('dedupeColumnModels (按字段标识去重，保留首个)', () => {
  it('keeps only the first column per field name', () => {
    const columns = [{ props: { dataIndex: 'a' } }, { props: { dataIndex: 'b' } }, { props: { dataIndex: 'a' } }];
    const result = dedupeColumnModels(columns, (column) => column.props.dataIndex);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(columns[0]);
    expect(result[1]).toBe(columns[1]);
  });

  it('keeps unnamed columns as-is', () => {
    const unnamed = { getStepParams: () => undefined };
    const result = dedupeColumnModels([unnamed, { props: { dataIndex: 'a' } }], (column: any) =>
      getColumnFieldName(column),
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(unnamed);
  });
});

describe('isNumericField / isBelongsToField', () => {
  it('detects numeric interfaces', () => {
    for (const iface of ['integer', 'number', 'bigInt', 'double', 'decimal', 'percent']) {
      expect(isNumericField(iface)).toBe(true);
    }
    expect(isNumericField('input')).toBe(false);
    expect(isNumericField('date')).toBe(false);
    expect(isNumericField(undefined)).toBe(false);
  });

  it('detects belongsTo association fields only', () => {
    expect(isBelongsToField({ interface: 'm2o', target: 'products' })).toBe(true);
    expect(isBelongsToField({ interface: 'obo', target: 'profiles' })).toBe(true);
    expect(isBelongsToField({ interface: 'o2m', target: 'items' })).toBe(false);
    expect(isBelongsToField({ interface: 'input' })).toBe(false);
    expect(isBelongsToField(undefined)).toBe(false);
  });
});

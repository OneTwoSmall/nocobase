/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';
import { extractSummaryValues, formatSummaryValue, isNumericField, parseFilterParam } from '../summary';

describe('isNumericField', () => {
  it('should detect numeric fields by type or interface', () => {
    expect(isNumericField({ type: 'integer' })).toBe(true);
    expect(isNumericField({ type: 'double' })).toBe(true);
    expect(isNumericField({ type: 'string' })).toBe(false);
    expect(isNumericField({ type: 'string', interface: 'currency' })).toBe(true);
    expect(isNumericField({ type: 'string', interface: 'checkbox' })).toBe(false);
  });
});

describe('formatSummaryValue', () => {
  it('should render integers without decimals', () => {
    expect(formatSummaryValue(175)).toBe('175');
    expect(formatSummaryValue(0)).toBe('0');
  });

  it('should keep two decimals for non-integer values', () => {
    expect(formatSummaryValue(49.5)).toBe('49.50');
    expect(formatSummaryValue(11.1666)).toBe('11.17');
  });

  it('should render nothing for empty values', () => {
    expect(formatSummaryValue(null)).toBe('');
    expect(formatSummaryValue(undefined)).toBe('');
    expect(formatSummaryValue(Number.NaN)).toBe('');
  });
});

describe('extractSummaryValues', () => {
  it('should unwrap the axios response and the data payload', () => {
    const response = { data: { data: { amount: 49.5, count: 3 } }, status: 200 };
    expect(extractSummaryValues(response)).toEqual({ amount: 49.5, count: 3 });
  });

  it('should accept a body that already is the value map', () => {
    expect(extractSummaryValues({ data: { amount: 10 } })).toEqual({ amount: 10 });
  });

  it('should return an empty map for unexpected payloads', () => {
    expect(extractSummaryValues(undefined)).toEqual({});
    expect(extractSummaryValues({ data: null })).toEqual({});
    expect(extractSummaryValues({ data: [1, 2] })).toEqual({});
  });
});

describe('parseFilterParam', () => {
  it('should parse the json string stored by the resource', () => {
    expect(parseFilterParam('{"status":{"$eq":"active"}}')).toEqual({ status: { $eq: 'active' } });
  });

  it('should pass through object filters', () => {
    expect(parseFilterParam({ id: { $eq: 1 } })).toEqual({ id: { $eq: 1 } });
  });

  it('should ignore empty or invalid filters', () => {
    expect(parseFilterParam(undefined)).toBeUndefined();
    expect(parseFilterParam('')).toBeUndefined();
    expect(parseFilterParam('not-json')).toBeUndefined();
    expect(parseFilterParam([1, 2])).toBeUndefined();
  });
});

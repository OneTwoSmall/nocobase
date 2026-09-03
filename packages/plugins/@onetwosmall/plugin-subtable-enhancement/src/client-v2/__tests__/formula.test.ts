/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';
import { evaluateFormula, recalcFormulas } from '../utils/formula';
import { type EnhancedColumnConfig } from '../utils/types';

describe('evaluateFormula', () => {
  it('evaluates expressions with {{variable}} syntax against a scope', () => {
    expect(evaluateFormula('{{nastnum}} * {{budget_price}}', { nastnum: 5, budget_price: 100 })).toBe(500);
  });

  it('returns null on invalid expressions', () => {
    expect(evaluateFormula('{{nastnum}} **', { nastnum: 5 })).toBeNull();
  });

  it('returns undefined for empty expressions', () => {
    expect(evaluateFormula('', {})).toBeUndefined();
    expect(evaluateFormula(undefined, {})).toBeUndefined();
  });

  it('resolves missing variables to null', () => {
    const value = evaluateFormula('{{nastnum}} * {{budget_price}}', { nastnum: 5 });
    expect(value).toBeNull();
  });
});

describe('recalcFormulas', () => {
  const columns: EnhancedColumnConfig[] = [
    { dataIndex: 'nastnum', field: { interface: 'number' } },
    { dataIndex: 'budget_price', field: { interface: 'number' } },
    { dataIndex: 'budget_amount', field: { interface: 'number' }, formula: '{{nastnum}} * {{budget_price}}' },
  ];

  it('computes formula columns for every row', () => {
    const rows: any[] = [
      { nastnum: 2, budget_price: 50 },
      { nastnum: 3, budget_price: 100 },
    ];
    const result = recalcFormulas(rows, columns);
    expect(result.changed).toBe(true);
    expect(result.rows[0].budget_amount).toBe(100);
    expect(result.rows[1].budget_amount).toBe(300);
  });

  it('leaves rows untouched when formulas are already up to date', () => {
    const rows: any[] = [{ nastnum: 2, budget_price: 50, budget_amount: 100 }];
    const result = recalcFormulas(rows, columns);
    expect(result.changed).toBe(false);
    expect(result.rows).toBe(rows);
  });

  it('returns rows unchanged when there is nothing to recalc', () => {
    const result = recalcFormulas([], columns);
    expect(result.changed).toBe(false);
    expect(result.rows).toEqual([]);
  });

  it('recalculates after a dependency changes', () => {
    const rows: any[] = [{ nastnum: 4, budget_price: 25, budget_amount: 100 }];
    rows[0].nastnum = 8;
    const result = recalcFormulas(rows, columns);
    expect(result.changed).toBe(true);
    expect(result.rows[0].budget_amount).toBe(200);
  });

  it('no-ops without formula columns', () => {
    const rows: any[] = [{ a: 1 }];
    const result = recalcFormulas(rows, [columns[0]]);
    expect(result.changed).toBe(false);
    expect(result.rows).toBe(rows);
  });
});

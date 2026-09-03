/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { evaluators, type Evaluator } from '@nocobase/evaluators/client';
import { Registry } from '@nocobase/utils/client';

import { type EnhancedColumnConfig, type EnhancedSubTableRow } from './types';

const mathEvaluator = (evaluators as Registry<Evaluator>).get('math.js');

/**
 * 在指定位置（或末尾）插入字段引用 token，如 {{nastnum}}。供公式编辑器“插入字段”使用。
 */
export function insertFormulaToken(formula: string | undefined, fieldName: string, selectionStart: number): string {
  const current = formula ?? '';
  const token = `{{${fieldName}}}`;
  const start = Math.max(0, Math.min(selectionStart, current.length));
  return current.slice(0, start) + token + current.slice(start);
}

export function evaluateFormula(expression: string | undefined, scope: Record<string, any>): any {
  if (!expression || !expression.trim()) {
    return undefined;
  }
  try {
    const value = mathEvaluator?.evaluate(expression, scope);
    if (typeof value === 'number' && Number.isNaN(value)) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export interface RecalcResult {
  rows: EnhancedSubTableRow[];
  changed: boolean;
}

export function recalcFormulas(rows: EnhancedSubTableRow[], columns: EnhancedColumnConfig[]): RecalcResult {
  const formulaColumns = columns.filter((column) => !!column.formula);
  if (!formulaColumns.length) {
    return { rows, changed: false };
  }

  let changed = false;
  const next = rows.map((row) => {
    if (!row) {
      return row;
    }
    let rowChanged = false;
    const updated = { ...row };
    for (const column of formulaColumns) {
      const value = evaluateFormula(column.formula, updated);
      if (value === undefined || value === null) {
        continue;
      }
      if (updated[column.dataIndex] !== value) {
        updated[column.dataIndex] = value;
        rowChanged = true;
      }
    }
    if (rowChanged) {
      changed = true;
      return updated;
    }
    return row;
  });

  return changed ? { rows: next, changed: true } : { rows, changed: false };
}

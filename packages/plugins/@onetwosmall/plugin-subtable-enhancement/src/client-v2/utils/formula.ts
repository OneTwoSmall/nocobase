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
 * 计算规则中的特殊变量：记录在子表格中的行号（第几行，1 起始，跨分页连续）。
 *
 * 命名说明：
 * - 系统内置变量统一用 `$` 前缀（$user/$env/$date/$system），`$` 亦用作操作符前缀，故不使用 `$`；
 * - 行级元数据统一用 `__…__`（__is_new__/__is_stored__/__index__），其中 __index__ 已被占用（存 UID 字符串）；
 * - `__rowIndex__` 语义明确且与字段名冲突概率极低，故作为保留变量名。
 *
 * 该变量仅注入公式求值作用域，不会写入行数据/表单值。
 */
export const SUB_TABLE_ROW_INDEX_VARIABLE = '__rowIndex__';

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
  const next = rows.map((row, rowIndex) => {
    if (!row) {
      return row;
    }
    let rowChanged = false;
    const updated = { ...row };
    for (const column of formulaColumns) {
      // 行号变量只注入求值作用域，不写回行数据；每次基于最新 updated 构造，
      // 保证公式列之间按顺序相互引用时仍能取到刚算出的值
      const scope = { ...updated, [SUB_TABLE_ROW_INDEX_VARIABLE]: rowIndex + 1 };
      const value = evaluateFormula(column.formula, scope);
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

/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

export type SummaryType = 'sum' | 'avg' | 'count' | 'min' | 'max';

export type SummaryConfig = Record<string, SummaryType>;

export interface SummaryColumnMeta {
  numericFields: Set<string>;
  columnTitles: Record<string, string>;
}

export const SUMMARY_LABELS: Record<SummaryType, string> = {
  sum: 'Sum',
  avg: 'Average',
  count: 'Count',
  min: 'Min',
  max: 'Max',
};

export function isNumericField(field: { type?: string; interface?: string }): boolean {
  const numericTypes = ['integer', 'bigInt', 'float', 'double', 'decimal', 'number'];
  const numericInterfaces = ['number', 'integer', 'percent', 'currency'];
  return numericTypes.includes(field.type) || numericInterfaces.includes(field.interface);
}

/**
 * 汇总行数值的展示格式：整数原样输出，小数保留两位；空值（无数据或字段不支持聚合）不显示。
 */
export function formatSummaryValue(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return '';
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

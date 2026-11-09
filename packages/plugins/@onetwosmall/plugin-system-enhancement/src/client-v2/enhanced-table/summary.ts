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
 * 提取行中指定字段的数值集合（字符串数字会被转换，非数字被过滤）。
 */
export function getNumericValues(rows: any[], dataIndex: string): number[] {
  return rows
    .map((row: any) => {
      const raw = row?.[dataIndex];
      if (typeof raw === 'function') {
        return null;
      }
      if (typeof raw === 'string') {
        return Number(raw);
      }
      return typeof raw === 'number' ? raw : null;
    })
    .filter((v: any): v is number => typeof v === 'number' && !isNaN(v));
}

/**
 * 计算单列聚合值。
 */
export function computeAggregation(values: number[], type: SummaryType): number | string {
  if (!values || values.length === 0) {
    return '';
  }
  let result: number;
  switch (type) {
    case 'sum':
      result = values.reduce((a, b) => a + b, 0);
      break;
    case 'avg':
      result = values.reduce((a, b) => a + b, 0) / values.length;
      break;
    case 'count':
      return values.length;
    case 'max':
      result = Math.max(...values);
      break;
    case 'min':
      result = Math.min(...values);
      break;
    default:
      return '';
  }
  return Number.isInteger(result) ? result : parseFloat(result.toFixed(2));
}

/**
 * 计算汇总行数据：{ [dataIndex]: 聚合值 }。
 */
export function computeSummaryRow(rows: any[], config: SummaryConfig): Record<string, number | string> {
  const result: Record<string, number | string> = {};
  for (const [dataIndex, type] of Object.entries(config)) {
    result[dataIndex] = computeAggregation(getNumericValues(rows, dataIndex), type);
  }
  return result;
}

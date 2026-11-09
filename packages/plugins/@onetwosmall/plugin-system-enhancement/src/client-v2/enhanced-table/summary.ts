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

export type SummaryValues = Record<string, number | null>;

/**
 * 从 `api.request` 的响应里取出汇总值。
 * `api.request` 返回 axios 响应对象，响应体在 `response.data`，服务端又把数据包在 `{ data }` 里，
 * 因此汇总值在 `response.data.data`；同时兼容直接返回映射的响应体。
 */
export function extractSummaryValues(response: unknown): SummaryValues {
  const body = (response as { data?: unknown } | null | undefined)?.data;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {};
  }
  const payload = (body as { data?: unknown }).data;
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : body;
  return source as SummaryValues;
}

/**
 * 表格资源把筛选条件以 JSON 字符串的形式存在 request.params.filter 上，这里统一解析成对象，
 * 供汇总聚合接口使用。
 */
export function parseFilterParam(raw: unknown): Record<string, unknown> | undefined {
  if (!raw) {
    return undefined;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : undefined;
    } catch (error) {
      console.warn('[system-enhancement] failed to parse the table filter', error);
      return undefined;
    }
  }
  return typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : undefined;
}

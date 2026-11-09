/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Filter } from '@nocobase/database';

export const SUMMARY_AGGREGATIONS = ['sum', 'avg', 'count', 'min', 'max'] as const;

export type SummaryAggregation = (typeof SUMMARY_AGGREGATIONS)[number];

export interface SummaryAggregationPayload {
  collection?: string;
  dataSourceKey?: string;
  filter?: Filter;
  aggregations?: Record<string, SummaryAggregation>;
}

/**
 * 只接受受支持的聚合方式，忽略非法值，避免把任意方法透传到仓储层。
 */
export function normalizeAggregations(input: unknown): Record<string, SummaryAggregation> {
  if (!input || typeof input !== 'object') {
    return {};
  }

  const result: Record<string, SummaryAggregation> = {};
  for (const [field, method] of Object.entries(input as Record<string, unknown>)) {
    if (typeof method === 'string' && (SUMMARY_AGGREGATIONS as readonly string[]).includes(method)) {
      result[field] = method as SummaryAggregation;
    }
  }
  return result;
}

/**
 * 合并角色数据范围（list 权限的 filter）与用户筛选条件，保证聚合结果不越权。
 */
export function mergeScopeFilter(scopeFilter: unknown, filter: unknown): Filter | undefined {
  if (!scopeFilter) {
    return filter as Filter | undefined;
  }
  if (!filter) {
    return scopeFilter as Filter;
  }
  return { $and: [scopeFilter, filter] } as Filter;
}

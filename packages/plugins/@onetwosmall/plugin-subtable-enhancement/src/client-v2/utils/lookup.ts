/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { get } from 'lodash';

import type { LookupConfig } from './types';

export interface RequestListParams {
  page?: number;
  pageSize?: number;
  sort?: string[];
  filter?: string;
  appends?: string[];
}

export interface ListResult {
  items: any[];
  meta: Record<string, any>;
}

export async function requestList(
  api: any,
  dataSourceKey: string | undefined,
  collectionName: string,
  params: RequestListParams = {},
): Promise<ListResult> {
  const headers = dataSourceKey && dataSourceKey !== 'main' ? { 'X-Data-Source': dataSourceKey } : undefined;
  const response = await api.request({
    url: `${collectionName}:list`,
    method: 'get',
    params,
    ...(headers ? { headers } : {}),
  });
  const body = response?.data ?? {};
  return {
    items: body?.data ?? [],
    meta: body?.meta ?? {},
  };
}

export async function lookupRecord(
  api: any,
  dataSourceKey: string | undefined,
  config: LookupConfig | undefined,
  value: string,
): Promise<any | null> {
  if (!config?.targetCollection || !config?.targetField || !value) {
    return null;
  }
  const { items } = await requestList(api, dataSourceKey, config.targetCollection, {
    page: 1,
    pageSize: 1,
    filter: JSON.stringify({ [config.targetField]: value }),
  });
  return items.length ? items[0] : null;
}

function normalizeKey(value: any) {
  return value == null ? '' : String(value).trim();
}

/**
 * 批量按查找配置解析粘贴文本 → 目标记录。匹配字段顺序：
 * 先按 config.targetField 精确匹配，再按配置的 searchFields 依次兜底。
 * 返回 文本(trim 后) → 记录 的映射，未命中的文本不在映射内。
 */
export async function resolveLookupRecordsByText(
  api: any,
  dataSourceKey: string | undefined,
  config: LookupConfig | undefined,
  texts: string[],
): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  if (!api || !config?.targetCollection || !config?.targetField || !texts.length) return map;
  const unique = Array.from(new Set(texts.map((text) => text.trim()).filter(Boolean)));
  if (!unique.length) return map;

  const matchFields = [config.targetField];
  for (const field of config.searchFields || []) {
    if (field && !matchFields.includes(field)) {
      matchFields.push(field);
    }
  }

  const CHUNK_SIZE = 100;
  const putItems = (items: any[], keyField: string) => {
    for (const item of items) {
      const key = normalizeKey(item?.[keyField]);
      if (key && !map.has(key)) {
        map.set(key, item);
      }
    }
  };

  for (let index = 0; index < unique.length; index += CHUNK_SIZE) {
    let remaining = unique.slice(index, index + CHUNK_SIZE);
    for (const field of matchFields) {
      if (!remaining.length) break;
      const { items } = await requestList(api, dataSourceKey, config.targetCollection, {
        page: 1,
        pageSize: remaining.length,
        filter: JSON.stringify({ [field]: { $in: remaining } }),
      });
      putItems(items, field);
      remaining = remaining.filter((text) => !map.has(normalizeKey(text)));
    }
  }
  return map;
}

export function applyLookupFill(row: Record<string, any>, config: LookupConfig, record: any): Record<string, any> {
  const next = { ...row };
  for (const mapping of config.mappings || []) {
    if (!mapping?.targetColumn) {
      continue;
    }
    const sourceValue = get(record, mapping.sourceField);
    if (sourceValue !== undefined) {
      next[mapping.targetColumn] = sourceValue;
    }
  }
  return next;
}

export function clearLookupFields(row: Record<string, any>, config: LookupConfig): Record<string, any> {
  const next = { ...row };
  for (const mapping of config.mappings || []) {
    if (mapping?.targetColumn) {
      next[mapping.targetColumn] = undefined;
    }
  }
  return next;
}

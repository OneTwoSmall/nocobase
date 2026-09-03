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

/** 取字段路径的首段并去重，用于 list 请求的 appends（如 'primary_unit.unit_name' → 'primary_unit'）。 */
export function buildAppendFields(fields: Array<string | undefined | null>): string[] {
  const result: string[] = [];
  for (const field of fields || []) {
    if (!field) continue;
    const top = String(field).split('.').filter(Boolean)[0];
    if (top && !result.includes(top)) {
      result.push(top);
    }
  }
  return result;
}

/** 从查找回填配置收集所需的 append 字段：匹配字段、搜索字段与所有映射来源字段。 */
export function collectLookupRecordAppends(config: LookupConfig | undefined): string[] {
  if (!config) return [];
  return buildAppendFields([
    config.targetField,
    ...(config.searchFields || []),
    ...(config.mappings || []).map((mapping) => mapping?.sourceField),
  ]);
}

/**
 * 通用批量解析：按 matchFields 依次对去重后的文本做 $in 分块精确查询，
 * 前一个字段命中的文本不再参与后续字段，保证匹配顺序（先到先得）。
 */
export async function resolveRecordsByFields(
  api: any,
  dataSourceKey: string | undefined,
  collectionName: string,
  matchFields: Array<string | undefined | null>,
  texts: string[],
  appends: string[] = [],
): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  const fields = (matchFields || [])
    .filter((field): field is string => !!field)
    .filter((field, index, list) => list.indexOf(field) === index);
  if (!api || !collectionName || !fields.length || !texts.length) return map;
  const unique = Array.from(new Set(texts.map((text) => text.trim()).filter(Boolean)));
  if (!unique.length) return map;

  const CHUNK_SIZE = 100;
  const putItems = (items: any[], keyField: string) => {
    for (const item of items) {
      const key = normalizeKey(item?.[keyField]);
      if (key && !map.has(key)) {
        map.set(key, item);
      }
    }
  };
  const params: RequestListParams = { page: 1 };
  if (appends.length) {
    params.appends = appends;
  }

  for (let index = 0; index < unique.length; index += CHUNK_SIZE) {
    let remaining = unique.slice(index, index + CHUNK_SIZE);
    for (const field of fields) {
      if (!remaining.length) break;
      params.pageSize = remaining.length;
      params.filter = JSON.stringify({ [field]: { $in: remaining } });
      try {
        const { items } = await requestList(api, dataSourceKey, collectionName, { ...params });
        putItems(items, field);
      } catch {
        // 整组查询失败（如把非数字文本拼进数字字段触发的类型错误）时，
        // 逐条降级查询：成功的并入映射，无法查询的单条保持未匹配，避免影响其它数据。
        for (const token of remaining) {
          try {
            params.pageSize = 1;
            params.filter = JSON.stringify({ [field]: { $in: [token] } });
            const { items } = await requestList(api, dataSourceKey, collectionName, { ...params });
            putItems(items, field);
          } catch {
            // 忽略单条无法匹配的文本
          }
        }
      }
      remaining = remaining.filter((text) => !map.has(normalizeKey(text)));
    }
  }
  return map;
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
  if (!api || !config?.targetCollection || !config?.targetField || !texts.length) {
    return new Map<string, any>();
  }
  return resolveRecordsByFields(
    api,
    dataSourceKey,
    config.targetCollection,
    [config.targetField, ...(config.searchFields || [])],
    texts,
    collectLookupRecordAppends(config),
  );
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

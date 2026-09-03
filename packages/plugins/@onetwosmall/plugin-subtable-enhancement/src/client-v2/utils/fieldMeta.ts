/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

export interface FieldLike {
  name?: string;
  title?: string;
  interface?: string;
  uiSchema?: { title?: string };
  [key: string]: any;
}

/**
 * 取集合字段的“显示名称”：优先字段 UI 标题，其次字段标题，最后退回数据库字段名。
 * 该名称来自数据源字段设置，与用户看到/配置的列标题一致。
 */
export function getFieldDisplayTitle(field: FieldLike | undefined | null): string {
  if (!field) return '';
  return field.uiSchema?.title ?? field.title ?? field.name ?? '';
}

/**
 * 为指定集合的可见字段构建 name → 显示名称 的映射。
 */
export function getFieldTitleMap(collection: any): Record<string, string> {
  const map: Record<string, string> = {};
  for (const field of collection?.getFields?.() ?? []) {
    if (field?.name) {
      map[field.name] = getFieldDisplayTitle(field);
    }
  }
  return map;
}

/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { applyLookupFill, requestList } from './lookup';
import type { EnhancedColumnConfig, LookupConfig } from './types';

/**
 * 子表格列中可安全粘贴赋值的关联类型：belongsTo（m2o/obo）单值列。
 * 其外键位于当前行，粘贴的显示文本可解析为“目标记录对象”，与原生下拉组件写入的值一致。
 * hasOne（oho/o2o）等外键位于目标侧，粘贴写入不生效，不处理。
 */
export function isBelongsToAssociationColumn(column: EnhancedColumnConfig): boolean {
  const field = column.field;
  if (!field || column.lookup || column.formula) return false;
  const iface = field.interface;
  return (iface === 'm2o' || iface === 'obo') && !!field.target;
}

export interface AssociationColumnMeta {
  dataIndex: string;
  /** 目标表集合名 */
  collectionName: string;
  /** 用于匹配/显示的目标表字段（无标题字段配置时回退 filterTargetKey/''id''） */
  titleField: string;
  /** 目标表主键（单值）字段：标题匹配未命中时回退按主键匹配；复合主键时为 null */
  idField: string | null;
  dataSourceKey?: string;
}

function resolveSingleTargetKey(field: any): string | null {
  const raw = field?.targetKey || field?.targetCollection?.filterTargetKey || 'id';
  if (Array.isArray(raw)) return raw.length === 1 ? raw[0] : null;
  return typeof raw === 'string' && raw ? raw : null;
}

export function getAssociationColumnMeta(
  column: EnhancedColumnConfig,
  fallbackDataSourceKey?: string,
): AssociationColumnMeta | null {
  const field = column.field;
  if (!field || !isBelongsToAssociationColumn(column)) return null;
  const targetCollection = field.targetCollection;
  // 优先使用“当前列实际展示的字段”（列设置 titleField / fieldNames.label 等），
  // 其次回退目标表标题字段，最后回退目标主键（支持直接粘贴 id）
  let titleField: string | undefined = column.titleField;
  if (!titleField) {
    titleField = field.targetCollectionTitleFieldName;
  }
  if (!titleField && targetCollection) {
    const filterTargetKey = targetCollection.filterTargetKey;
    titleField = Array.isArray(filterTargetKey)
      ? filterTargetKey.length === 1
        ? filterTargetKey[0]
        : undefined
      : filterTargetKey || 'id';
  }
  if (!titleField) return null;
  const dataSourceKey = field.collection?.dataSourceKey || field.dataSourceKey || fallbackDataSourceKey;
  return {
    dataIndex: column.dataIndex,
    collectionName: field.target,
    titleField,
    idField: resolveSingleTargetKey(field),
    dataSourceKey,
  };
}

/**
 * belongsTo 关联列的单元格期望值是“目标记录对象”，而查找回填的源值往往是标量 id。
 * 标量 → { [filterTargetKey || 'id']: value }（下拉组件会按 id 自动取回标签回显）；
 * 对象（完整/部分目标记录）原样保留。
 */
export function toAssociationCellValue(field: any, value: any): any {
  if (value == null) {
    return value;
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  const targetKey = field?.targetKey || field?.targetCollection?.filterTargetKey || 'id';
  const key = Array.isArray(targetKey) ? (targetKey.length === 1 ? targetKey[0] : 'id') : targetKey;
  return { [key]: value };
}

/**
 * 计算属于 belongsTo 关联列（m2o/obo）的 dataIndex 集合。
 */
export function collectBelongsToColumnIndexes(columns: EnhancedColumnConfig[]): Set<string> {
  const indexes = new Set<string>();
  columns.forEach((column) => {
    if (column.dataIndex && isBelongsToAssociationColumn(column)) {
      indexes.add(column.dataIndex);
    }
  });
  return indexes;
}

/**
 * 查找回填（Lookup & fill）落盘：对映射目标是 belongsTo 关联列的字段做对象包装，
 * 使下拉框能识别并回显选中记录（标量 id → { [targetKey]: id }）。
 */
export function wrapAssociationLookupFill(
  row: Record<string, any>,
  lookup: LookupConfig,
  record: any,
  columns: EnhancedColumnConfig[],
  associationIndexes: Set<string>,
): Record<string, any> {
  const next = applyLookupFill(row, lookup, record);
  for (const mapping of lookup.mappings || []) {
    if (!mapping?.targetColumn || !associationIndexes.has(mapping.targetColumn)) continue;
    const column = columns.find((c) => c.dataIndex === mapping.targetColumn);
    if (!column) continue;
    const value = next[mapping.targetColumn];
    next[mapping.targetColumn] = toAssociationCellValue(column.field, value);
  }
  return next;
}

/**
 * 批量按标题字段解析粘贴文本 → 目标记录（$in 分块查询，单值即可命中 id）。
 * 匹配顺序：先按“当前列标题字段”精确匹配；未命中时回退按目标表主键匹配
 * （支持直接把主键值从 Excel 粘贴进来）。
 */
export async function resolveAssociationRecordsByText(
  api: any,
  meta: AssociationColumnMeta,
  texts: string[],
): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  if (!api || !texts.length) return map;
  const unique = Array.from(new Set(texts.map((text) => text.trim()).filter(Boolean)));
  if (!unique.length) return map;

  const normalizeKey = (value: any) => (value == null ? '' : String(value).trim());
  const CHUNK_SIZE = 100;
  const putItems = (items: any[], keyField: string) => {
    for (const item of items) {
      const key = normalizeKey(item?.[keyField]);
      if (key && !map.has(key)) {
        map.set(key, item);
      }
    }
  };

  const { titleField, idField } = meta;
  for (let index = 0; index < unique.length; index += CHUNK_SIZE) {
    const chunk = unique.slice(index, index + CHUNK_SIZE);
    const { items } = await requestList(api, meta.dataSourceKey, meta.collectionName, {
      page: 1,
      pageSize: chunk.length,
      filter: JSON.stringify({ [titleField]: { $in: chunk } }),
    });
    putItems(items, titleField);
    // 标题未命中的文本回退按主键查找（同一记录可能通过 id 被命中）
    const remaining = chunk.filter((text) => !map.has(normalizeKey(text)));
    if (remaining.length && idField && idField !== titleField) {
      const idResult = await requestList(api, meta.dataSourceKey, meta.collectionName, {
        page: 1,
        pageSize: remaining.length,
        filter: JSON.stringify({ [idField]: { $in: remaining } }),
      });
      putItems(idResult.items, idField);
    }
  }
  return map;
}

/**
 * 从待粘贴矩阵中收集各关联列命中的去重文本，返回按 enhancedColumns 下标分组的列表。
 */
export function collectAssociationPasteTexts(
  matrix: string[][],
  startRowIdx: number,
  startColIdx: number,
  columns: EnhancedColumnConfig[],
): Array<{ columnIndex: number; texts: string[] }> {
  const byColumn = new Map<number, Set<string>>();
  matrix.forEach((row) => {
    row.forEach((cell, ci) => {
      const colIndex = startColIdx + ci;
      const column = columns[colIndex];
      if (!column || !isBelongsToAssociationColumn(column)) return;
      const text = cell.trim();
      if (!text) return;
      const texts = byColumn.get(colIndex) ?? new Set<string>();
      texts.add(text);
      byColumn.set(colIndex, texts);
    });
  });
  return Array.from(byColumn.entries()).map(([columnIndex, texts]) => ({
    columnIndex,
    texts: Array.from(texts),
  }));
}

/**
 * 从待粘贴矩阵中收集各“查找回填”（lookup）列命中的去重文本，
 * 返回按 enhancedColumns 下标分组的列表。查找列的值通常是被粘贴的
 * 目标表匹配字段（如物料编码），按列批量解析后即可同步回填。
 */
export function collectLookupPasteTexts(
  matrix: string[][],
  startRowIdx: number,
  startColIdx: number,
  columns: EnhancedColumnConfig[],
): Array<{ columnIndex: number; texts: string[] }> {
  const byColumn = new Map<number, Set<string>>();
  matrix.forEach((row) => {
    row.forEach((cell, ci) => {
      const colIndex = startColIdx + ci;
      const column = columns[colIndex];
      if (!column || !column.lookup) return;
      const text = cell.trim();
      if (!text) return;
      const texts = byColumn.get(colIndex) ?? new Set<string>();
      texts.add(text);
      byColumn.set(colIndex, texts);
    });
  });
  return Array.from(byColumn.entries()).map(([columnIndex, texts]) => ({
    columnIndex,
    texts: Array.from(texts),
  }));
}

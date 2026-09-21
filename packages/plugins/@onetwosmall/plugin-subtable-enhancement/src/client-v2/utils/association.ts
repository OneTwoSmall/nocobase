/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { isNumericField } from './columnIdentity';
import { applyLookupFill, requestList, resolveRecordsByFields } from './lookup';
import type { EnhancedColumnConfig, LookupConfig } from './types';

/** 目标集合中数值类型的字段 type（DB 类型），用于判断匹配字段是否数值字段。 */
const NUMERIC_FIELD_TYPES = new Set([
  'bigInt',
  'bigint',
  'integer',
  'int',
  'float',
  'double',
  'decimal',
  'real',
  'number',
  'percent',
]);

/**
 * 判断目标集合字段是否数值字段：优先看 interface，其次看 type。
 * 返回 null 表示元数据缺失、无法判断（调用方按值兜底）。
 */
function isNumericTargetField(targetField: any): boolean | null {
  if (!targetField) return null;
  const iface = typeof targetField.interface === 'string' ? targetField.interface : '';
  const type = typeof targetField.type === 'string' ? targetField.type : '';
  if (!iface && !type) return null;
  return isNumericField(iface) || NUMERIC_FIELD_TYPES.has(type);
}

/**
 * 子表格列中可按“目标记录对象”写入的关联类型：belongsTo（m2o/obo）单值列。
 * 其外键位于当前行，粘贴的显示文本可解析为“目标记录对象”，与原生下拉组件写入的值一致。
 * 查找回填配置可叠加在此类列上（匹配仍沿用标题字段→主键），因此这里不排除 lookup。
 * hasOne（oho/o2o）等外键位于目标侧，粘贴写入不生效，不处理。
 */
export function isBelongsToAssociationColumn(column: EnhancedColumnConfig): boolean {
  const field = column.field;
  if (!field || column.formula) return false;
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
 * 把标量源值解析为关联目标记录：按关联的标题字段与关联键（targetKey，可能是非主键的唯一字段）
 * 组合成一次查询匹配。为避免 `character varying = bigint` / `invalid input syntax for type bigint`
 * 之类的类型错误，按字段类型给出正确类型的值：
 * - 文本字段：传 String(value)；
 * - 数值字段：仅当值可解析为数字时才参与，传数字；
 * - 元数据缺失：按值兜底（数字值传数字，否则传字符串）。
 * 用于回填到 belongsTo 关联列时，避免把文本当作 bigint 主键去查。
 */
export async function resolveAssociationTargetRecord(
  api: any,
  dataSourceKey: string | undefined,
  field: any,
  value: any,
): Promise<any | null> {
  if (!api || value == null || typeof value === 'object') return null;
  const targetCollection = field?.target;
  if (!targetCollection) return null;
  const matchFields = [field?.targetCollectionTitleFieldName, resolveSingleTargetKey(field)]
    .filter((name): name is string => typeof name === 'string' && !!name)
    .filter((name, index, list) => list.indexOf(name) === index);
  if (!matchFields.length) return null;

  const targetCollectionObj = field?.targetCollection;
  const valueText = String(value);
  const valueIsNumeric = isNumericToken(valueText);
  const numericValue = valueIsNumeric ? Number(valueText) : undefined;

  const conditions: Array<Record<string, any>> = [];
  for (const name of matchFields) {
    const numeric = isNumericTargetField(targetCollectionObj?.getField?.(name));
    if (numeric === true) {
      // 数值字段：非数字值直接跳过，避免 bigint 类型错误
      if (!valueIsNumeric) continue;
      conditions.push({ [name]: numericValue });
    } else if (numeric === false) {
      // 文本字段：一律传字符串，避免 varchar 与 bigint 比较
      conditions.push({ [name]: valueText });
    } else {
      // 元数据缺失：按值兜底
      conditions.push({ [name]: valueIsNumeric ? numericValue : valueText });
    }
  }
  if (!conditions.length) return null;
  const filter = conditions.length > 1 ? { $or: conditions } : conditions[0];

  const dataSource = field?.collection?.dataSourceKey || field?.dataSourceKey || dataSourceKey;
  try {
    const { items } = await requestList(api, dataSource, targetCollection, {
      page: 1,
      pageSize: 1,
      filter: JSON.stringify(filter),
    });
    return items.length ? items[0] : null;
  } catch {
    return null;
  }
}

/**
 * 查找回填（异步）：先按映射写入源值，再把落到 belongsTo 关联列上的标量源值解析为目标记录，
 * 写入完整记录对象；未命中时保留原标量（不当作主键包装，避免 bigint 查询报错）。
 */
export async function resolveAssociationLookupFill(
  api: any,
  dataSourceKey: string | undefined,
  row: Record<string, any>,
  lookup: LookupConfig,
  record: any,
  columns: EnhancedColumnConfig[],
  associationIndexes: Set<string>,
): Promise<Record<string, any>> {
  let next = applyLookupFill(row, lookup, record);
  const associationMappings = (lookup.mappings || []).filter(
    (mapping) => mapping?.targetColumn && associationIndexes.has(mapping.targetColumn),
  );
  for (const mapping of associationMappings) {
    const value = next[mapping.targetColumn];
    if (value == null || typeof value === 'object') continue;
    const column = columns.find((c) => c.dataIndex === mapping.targetColumn);
    const resolved = await resolveAssociationTargetRecord(api, dataSourceKey, column?.field, value);
    if (resolved) {
      next = { ...next, [mapping.targetColumn]: resolved };
    }
  }
  return next;
}

function isNumericToken(text: string): boolean {
  return /^-?\d+(?:\.\d+)?$/.test(text);
}

/**
 * 批量按标题字段解析粘贴文本 → 目标记录（$in 分块查询）。
 * 匹配顺序与 Excel 粘贴一致：先按“当前列标题字段”精确匹配；
 * 只有“数字形式”的未命中文本才回退按主键匹配 —— 数字主键（如 bigint）无法接受
 * A4 这类非数字文本，盲目 $in 会让整列查询被 DB 类型错误中断。
 * appends 用于把回填所需的映射来源字段（含关联字段）一并查回。
 */
export async function resolveAssociationRecordsByText(
  api: any,
  meta: AssociationColumnMeta,
  texts: string[],
  appends: string[] = [],
): Promise<Map<string, any>> {
  // 正常路径：先按标题字段精确匹配（不含数字主键类型风险）
  const map = await resolveRecordsByFields(
    api,
    meta.dataSourceKey,
    meta.collectionName,
    [meta.titleField],
    texts,
    appends,
  );
  if (!api || !texts.length || !meta?.idField || meta.idField === meta.titleField) {
    return map;
  }

  const remainingNumeric = Array.from(new Set(texts.map((text) => text.trim()).filter(Boolean))).filter(
    (text) => !map.has(text) && isNumericToken(text),
  );
  if (!remainingNumeric.length) {
    return map;
  }

  const CHUNK_SIZE = 100;
  const params: Record<string, any> = { page: 1 };
  if (appends.length) {
    params.appends = appends;
  }
  for (let index = 0; index < remainingNumeric.length; index += CHUNK_SIZE) {
    const chunk = remainingNumeric.slice(index, index + CHUNK_SIZE);
    params.pageSize = chunk.length;
    params.filter = JSON.stringify({ [meta.idField]: { $in: chunk } });
    try {
      const { items } = await requestList(api, meta.dataSourceKey, meta.collectionName, { ...params });
      for (const item of items) {
        const key = item?.[meta.idField];
        if (key != null) {
          map.set(String(key).trim(), item);
        }
      }
    } catch {
      // 数字主键查询失败则跳过该块，保留已由标题字段匹配的结果
    }
  }
  return map;
}

/**
 * 按主键取回一条完整记录（含回填所需 append 字段）。下拉框直接选择记录时，
 * 单元格里可能只有 id + 标题，需要再按主键取回完整记录用于回填。
 */
export async function fetchAssociationRecordById(
  api: any,
  meta: AssociationColumnMeta,
  idValue: any,
  appends: string[] = [],
): Promise<any | null> {
  if (!api || !meta?.collectionName || !meta?.idField || idValue == null) {
    return null;
  }
  const params: Record<string, any> = {
    page: 1,
    pageSize: 1,
    filter: JSON.stringify({ [meta.idField]: idValue }),
  };
  if (appends.length) {
    params.appends = appends;
  }
  const { items } = await requestList(api, meta.dataSourceKey, meta.collectionName, params);
  return items.length ? items[0] : null;
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
 * 返回按 enhancedColumns 下标分组的列表。belongsTo 下拉列已并入“关联列”批量解析
 * （单元格写入记录对象 + 直接回填），不再走普通查找列的标量校验路径。
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
      if (!column || !column.lookup || isBelongsToAssociationColumn(column)) return;
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

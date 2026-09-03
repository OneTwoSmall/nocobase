/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * 数值字段 interface 集合：只有这些列的“计算规则（formula）”可配置。
 * percent 以小数存储（0.5 = 50%），与普通数值一样参与计算，故一并纳入。
 */
export const NUMERIC_INTERFACES = ['integer', 'number', 'bigInt', 'double', 'decimal', 'percent'];

export function isNumericField(interfaceName: string | undefined | null): boolean {
  return !!interfaceName && NUMERIC_INTERFACES.includes(interfaceName);
}

/**
 * 关联字段下拉框列（belongsTo 单值关联 m2o/obo）：其下拉框本身就表示“选择另一张表的记录”，
 * 由原生选择器与 Excel 粘贴的标题匹配负责；不应再叠加“查找回填”配置。
 */
export function isBelongsToField(field: any): boolean {
  if (!field) return false;
  const iface = field.interface;
  return (iface === 'm2o' || iface === 'obo') && !!field.target;
}

/**
 * 解析列模型的“字段标识”。用于 Displayed fields 的增删去重，兼容两类列：
 * 增强列带有 fieldSettings.init.fieldPath；原生/历史列仅带 props.dataIndex。
 * 优先级：props.dataIndex > fieldPath 末段 > collectionField.name。
 */
export function getColumnFieldName(column: any): string | null {
  if (!column) return null;
  const dataIndex = column?.props?.dataIndex;
  if (typeof dataIndex === 'string' && dataIndex) {
    return dataIndex;
  }
  const fieldPath = column?.getStepParams?.('fieldSettings', 'init')?.fieldPath;
  if (typeof fieldPath === 'string' && fieldPath) {
    const tail = fieldPath.split('.').filter(Boolean).pop();
    if (tail) return tail;
  }
  const collectionName = column?.collectionField?.name;
  return typeof collectionName === 'string' && collectionName ? collectionName : null;
}

/**
 * 按字段标识去重（保留首个），用于渲染前防御性去重，避免历史遗留的重复列模型被重复渲染。
 */
export function dedupeColumnModels<T>(columns: T[], nameOf: (column: T) => string | null = getColumnFieldName): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const column of columns) {
    const name = nameOf(column);
    if (name == null) {
      result.push(column);
      continue;
    }
    if (seen.has(name)) continue;
    seen.add(name);
    result.push(column);
  }
  return result;
}

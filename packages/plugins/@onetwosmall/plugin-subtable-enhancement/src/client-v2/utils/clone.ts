/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * 递归深拷贝“纯数据”值。用于行复制时把单元格值（尤其 belongsTo 关联列存放的
 * 目标记录对象）与原行彻底隔离，避免复制行后续编辑通过共享引用覆盖原始行数据。
 *
 * 仅克隆纯对象/数组/Date；类实例（dayjs 等带私有内部状态的对象）保持共享引用，
 * 避免克隆破坏其内部结构。
 */
function isPlainObject(value: unknown): value is Record<string, any> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function deepCloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => deepCloneValue(item)) as unknown as T;
  }
  if (value instanceof Date) {
    return new Date(value.getTime()) as unknown as T;
  }
  if (isPlainObject(value)) {
    const result: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      result[key] = deepCloneValue(value[key]);
    }
    return result as unknown as T;
  }
  return value;
}

export function deepCloneRow<T extends Record<string, any>>(row: T): T {
  return deepCloneValue(row);
}

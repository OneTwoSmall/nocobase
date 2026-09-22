/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { getFieldDisplayTitle } from './fieldMeta';

export interface ResolvedPickerColumn {
  /** 原始字段路径（列 key）。 */
  path: string;
  /** 列标题：字段显示名称；关联字段追加其标题字段名。 */
  title: string;
  /** 实际取值路径：关联字段解析为目标表标题字段路径（支持多级关联）。 */
  displayPath: string;
  /** 末尾字段是否为关联字段。 */
  isAssociation: boolean;
}

function isAssociationField(field: any): boolean {
  return !!field && !!field.targetCollection;
}

function getAssociationTitleFieldName(field: any): string | undefined {
  const targetCollection = field?.targetCollection;
  const candidates = [
    field?.targetCollectionTitleFieldName,
    targetCollection?.titleCollectionField?.name,
    targetCollection?.titleField,
    targetCollection?.options?.titleField,
  ];
  return candidates.find((name): name is string => typeof name === 'string' && !!name);
}

/**
 * 解析一个字段路径在弹窗表格中的展示信息：
 * - 普通字段：直接展示该字段；
 * - 末尾为关联字段：展示目标表的标题字段（多级关联会逐层解析）。
 *
 * 例如 `primary_unit` → `primary_unit.unit_name`（目标表标题字段），
 * `department.company.name` → `department.company.name`。
 */
export function resolvePickerColumn(collection: any, path: string): ResolvedPickerColumn {
  const segments = String(path || '')
    .split('.')
    .filter(Boolean);
  if (!segments.length) {
    return { path, title: path, displayPath: path, isAssociation: false };
  }

  let currentCollection = collection;
  const displaySegments: string[] = [];
  let isAssociation = false;
  let title = path;

  for (let index = 0; index < segments.length; index++) {
    const name = segments[index];
    const field = currentCollection?.getField?.(name);
    displaySegments.push(name);
    title = getFieldDisplayTitle(field) || name;

    if (!field) {
      break;
    }
    if (!isAssociationField(field)) {
      break;
    }

    const isLast = index === segments.length - 1;
    if (isLast) {
      isAssociation = true;
      const titleField = getAssociationTitleFieldName(field);
      if (titleField) {
        displaySegments.push(titleField);
        const titleFieldMeta = field.targetCollection?.getField?.(titleField);
        title = `${title} · ${getFieldDisplayTitle(titleFieldMeta) || titleField}`;
      }
      break;
    }

    currentCollection = field.targetCollection;
  }

  return { path, title, displayPath: displaySegments.join('.'), isAssociation };
}

/**
 * 单元格取值展示：空值占位；对象值优先取标题类字段，无法识别时回退 JSON；
 * 数组逐项拼接。关联字段已在上游按标题字段解析为标量，这里主要作为兜底。
 */
export function formatPickerCellValue(value: any): string {
  if (value == null || value === '') return '-';
  if (Array.isArray(value)) {
    const parts = value.map((item) => formatPickerCellValue(item)).filter((part) => part !== '-');
    return parts.length ? parts.join(', ') : '-';
  }
  if (typeof value === 'object') {
    for (const key of ['name', 'title', 'label']) {
      const candidate = (value as any)[key];
      if (typeof candidate === 'string' && candidate) return candidate;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return '-';
    }
  }
  return String(value);
}

/**
 * 估算文本渲染宽度（px），用于给「自适应列宽」补上表头标题所需的最小宽度。
 * 浏览器环境用隐藏 span 精确测量；jsdom 等无法测量时按字符宽度回退估算（CJK 按 2 个字符宽）。
 */
export function estimateTextWidth(text: unknown, font = '600 14px sans-serif'): number {
  const content = String(text ?? '');
  if (!content) return 0;
  try {
    if (typeof document !== 'undefined' && document.body) {
      const span = document.createElement('span');
      span.style.position = 'absolute';
      span.style.visibility = 'hidden';
      span.style.whiteSpace = 'nowrap';
      span.style.font = font;
      span.textContent = content;
      document.body.appendChild(span);
      const measured = span.getBoundingClientRect().width || span.offsetWidth;
      document.body.removeChild(span);
      if (measured > 0) return measured;
    }
  } catch {
    // 忽略测量失败，回退到字符估算
  }
  let units = 0;
  for (const char of content) {
    units += /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(char) ? 2 : 1;
  }
  return units * 8;
}

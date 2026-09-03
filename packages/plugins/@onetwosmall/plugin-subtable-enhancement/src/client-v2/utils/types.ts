/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { uid } from '@formily/shared';

export interface LookupMapping {
  sourceField: string;
  targetColumn: string;
}

export interface LookupConfig {
  targetCollection: string;
  targetField: string;
  mappings: LookupMapping[];
  searchFields?: string[];
}

export interface EnhancedColumnConfig {
  dataIndex: string;
  title?: string;
  width?: number;
  field?: any;
  lookup?: LookupConfig;
  formula?: string;
  /**
   * 关联列当前实际展示的字段名（列设置 titleField / 列内字段 props.titleField / fieldNames.label）。
   * 粘贴/回填时按该字段的值与粘贴文本比对。
   */
  titleField?: string;
}

export interface EnhancedSubTableRow {
  __is_new__?: boolean;
  __is_stored__?: boolean;
  __index__?: string;
  [key: string]: any;
}

/**
 * 创建一条空白“真实”数据行（非幽灵行）。新增表单默认空行、点击“新增”都使用它，
 * 写入表单值后与普通数据行一致。
 */
export function createRow(): EnhancedSubTableRow {
  return {
    __is_new__: true,
    __index__: uid(),
  };
}

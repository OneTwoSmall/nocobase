/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { observable } from '@nocobase/flow-engine';

/**
 * 系统增强功能的运行时开关。
 * 集中存放在单一可观察对象中：设置页切换后，已渲染的表格/表头会通过 observer 立即响应，无需刷新页面。
 */
export const enhancementFlags = observable({
  enableTableColumnResize: true,
  enableEnhancedTable: true,
});

export function isTableColumnResizeEnabled(): boolean {
  return enhancementFlags.enableTableColumnResize;
}

export function isEnhancedTableEnabled(): boolean {
  return enhancementFlags.enableEnhancedTable;
}

export function setTableColumnResizeEnabled(enabled: boolean) {
  enhancementFlags.enableTableColumnResize = enabled !== false;
}

export function setEnhancedTableEnabled(enabled: boolean) {
  enhancementFlags.enableEnhancedTable = enabled !== false;
}

/**
 * 用服务端返回的设置初始化开关，未返回的字段按“开启”处理。
 */
export function applyEnhancementFlags(settings: Record<string, any> | null | undefined) {
  setTableColumnResizeEnabled(settings?.enableTableColumnResize !== false);
  setEnhancedTableEnabled(settings?.enableEnhancedTable !== false);
}

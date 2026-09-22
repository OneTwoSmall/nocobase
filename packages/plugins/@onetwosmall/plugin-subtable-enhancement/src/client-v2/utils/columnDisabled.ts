/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

export interface DisabledColumnLike {
  props?: { disabled?: boolean };
  setProps?: (props: Record<string, unknown>) => void;
}

/**
 * 字段禁用前各列自身的 disabled 快照（列自身可能通过「显示模式 = 禁用」配置）。
 *
 * 使用模块级 WeakMap 而不是组件内 ref：字段禁用期间组件可能因表单值/布局变化重新挂载，
 * 若快照随组件实例丢失，重新挂载后会把“被字段强制为 true 的列”误判成列自身禁用，
 * 导致字段恢复时无法还原、子表格一直保持禁用（条件联动失效）。
 */
const ownDisabledByColumn = new WeakMap<object, boolean>();

/**
 * 把子表格字段（区块）的 disabled 透传到列模型，使单元格编辑器禁用：
 * - 字段禁用时：记住列自身的 disabled 后强制为 true（字段优先级高于列）；
 * - 字段恢复时：还原列自身的 disabled（列自身禁用仍生效）。
 *
 * 列模型是原生 MemoCell 读取 `parent.props.disabled` 的来源，因此透传到列即可禁用所有单元格。
 */
export function syncColumnDisabled(
  columns: Array<DisabledColumnLike | null | undefined>,
  blockDisabled: boolean,
): void {
  for (const column of columns) {
    if (!column) continue;
    if (!blockDisabled) {
      if (ownDisabledByColumn.has(column)) {
        const own = ownDisabledByColumn.get(column);
        ownDisabledByColumn.delete(column);
        if (!!column.props?.disabled !== own) {
          column.setProps?.({ disabled: own });
        }
      }
      continue;
    }
    if (!ownDisabledByColumn.has(column)) {
      ownDisabledByColumn.set(column, !!column.props?.disabled);
    }
    if (!column.props?.disabled) {
      column.setProps?.({ disabled: true });
    }
  }
}

/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { SubTableColumnModel, TableColumnModel } from '@nocobase/client-v2';
import React from 'react';
import { ResizableHeader } from './ResizableHeader';

type ColumnProps = Record<string, any> & { title?: React.ReactNode };

/**
 * 把列宽拖拽手柄挂到列标题上；未设置宽度的列不处理（与核心行为保持一致）。
 */
function withResizableHeader(model: any, props: ColumnProps | undefined, flowKey: string) {
  if (!props || !props.title) {
    return props;
  }
  const persistFlowKey = model?.context?.flowSettingsEnabled ? flowKey : undefined;
  return {
    ...props,
    title: (
      <ResizableHeader model={model} width={model?.props?.width} persistFlowKey={persistFlowKey}>
        {props.title}
      </ResizableHeader>
    ),
  };
}

/**
 * 表格列模型：用子类覆盖注册替代改写核心原型，避免与其他插件冲突、也避免核心改签名时直接失效。
 */
export class ResizableTableColumnModel extends TableColumnModel {
  getColumnProps() {
    const props = super.getColumnProps();
    return withResizableHeader(this, props as ColumnProps, 'tableColumnSettings') as typeof props;
  }
}

export class ResizableSubTableColumnModel extends SubTableColumnModel {
  getColumnProps() {
    const props = super.getColumnProps();
    return withResizableHeader(this, props as ColumnProps, 'subTableColumnSettings') as typeof props;
  }
}

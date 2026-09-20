/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { DndProvider, useFlowEngine } from '@nocobase/flow-engine';
import {
  FormItemModel,
  normalizeTableColumnWidth,
  SubTableFieldModel,
  type SubTableColumnModel,
} from '@nocobase/client-v2';
import { DragEndEvent } from '@dnd-kit/core';
import React from 'react';

import { EnhancedSubTableField } from '../components/EnhancedSubTableField';
import { tExpr } from '../locale';
import { dedupeColumnModels } from '../utils/columnIdentity';
import { type EnhancedColumnConfig } from '../utils/types';

function adjustColumnOrder(columns: any[]) {
  const leftFixedColumns: any[] = [];
  const normalColumns: any[] = [];
  const rightFixedColumns: any[] = [];

  columns.forEach((column) => {
    if (column.fixed === 'left') {
      leftFixedColumns.push(column);
    } else if (column.fixed === 'right') {
      rightFixedColumns.push(column);
    } else {
      normalColumns.push(column);
    }
  });

  return [...leftFixedColumns, ...normalColumns, ...rightFixedColumns];
}

function isSubTableColumnFieldComponentContext(ctx: any) {
  return (ctx?.model?.constructor as any)?.fieldComponentContext === 'subTableColumn';
}

const HeaderWrapperComponent = React.memo((props: any) => {
  const engine = useFlowEngine();

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (active.id && over?.id && active.id !== over.id) {
      engine.moveModel(active.id as string, over.id as string);
    }
  };

  return (
    <DndProvider onDragEnd={onDragEnd}>
      <thead {...props} />
    </DndProvider>
  );
});

export class EnhancedSubTableFieldModel extends SubTableFieldModel {
  getColumns() {
    const { enableIndexColumn } = this.props;

    // 先按字段标识对列模型去重（历史遗留的重复列只渲染首个），再生成列配置
    const columnModels = dedupeColumnModels(
      this.mapSubModels('columns', (column: SubTableColumnModel) => column) ?? [],
    );
    const baseColumns = columnModels.map((column) => column.getColumnProps()).filter(Boolean);

    return adjustColumnOrder(
      [
        enableIndexColumn && {
          key: '__index__',
          width: 48,
          align: 'center',
          fixed: 'left',
          render: (props: any) => {
            return props.rowIdx + 1;
          },
        },
        ...baseColumns.concat({
          key: '_empty',
        }),
      ].filter(Boolean),
    ) as any;
  }

  /**
   * 由操作列表头的「复制」按钮调用：更新复制行保留的字段并持久化。
   * undefined 表示复制全部字段；空数组表示都不复制。
   */
  async setCopyFields(copyFields?: string[]) {
    this.setStepParams('enhancedSubTableSettings', 'copyFields', { copyFields });
    this.setProps({ copyFields });
    await this.saveStepParams();
  }

  /**
   * 由操作列表头的宽度控件调用：更新操作列宽度并持久化。
   */
  async setActionsColumnWidth(width?: number) {
    const actionsColumnWidth = normalizeTableColumnWidth(width);
    this.setStepParams('enhancedSubTableSettings', 'actionsColumnWidth', { actionsColumnWidth });
    this.setProps({ actionsColumnWidth });
    await this.saveStepParams();
  }

  /**
   * 由操作列表头的固定控件调用：更新操作列的固定位置（左/右）并持久化。
   */
  async setActionsColumnFixed(fixed?: 'left' | 'right') {
    this.setStepParams('enhancedSubTableSettings', 'actionsColumnFixed', { actionsColumnFixed: fixed });
    this.setProps({ actionsColumnFixed: fixed });
    await this.saveStepParams();
  }

  render() {
    const columns = this.getColumns();
    const enhancedColumns: EnhancedColumnConfig[] = dedupeColumnModels(
      this.mapSubModels('columns', (column: any): EnhancedColumnConfig | null => {
        const dataIndex = column?.props?.dataIndex;
        if (!dataIndex) return null;
        const collectionField = column?.collectionField;
        const fieldModel = column?.subModels?.field;
        // 关联列当前展示字段：列设置 titleField > 列内字段 titleField > fieldNames.label > 目标表标题字段
        const titleField =
          column?.props?.titleField ||
          fieldModel?.props?.titleField ||
          column?.props?.fieldNames?.label ||
          collectionField?.targetCollectionTitleFieldName;
        return {
          dataIndex,
          title: column?.props?.title,
          width: column?.props?.width,
          field: collectionField,
          lookup: column?.props?.lookup,
          formula: column?.props?.formula,
          titleField,
        };
      }).filter(Boolean),
      (column) => column.dataIndex,
    );

    const components = {
      header: {
        wrapper: HeaderWrapperComponent,
      },
    };
    const isConfigMode = !!this.context.flowSettingsEnabled;
    const isCreateForm = this.context.blockModel?.context?.actionName === 'create';
    const fieldPathArray = this.context.fieldPathArray ?? this.parent?.context?.fieldPathArray;
    const onResetFieldValue = () => {
      const value = [];
      this.setProps({ value });
      this.context.blockModel?.setFieldValue?.(fieldPathArray, value);
    };
    return (
      <EnhancedSubTableField
        {...this.props}
        model={this}
        columns={columns}
        enhancedColumns={enhancedColumns}
        components={components}
        isConfigMode={isConfigMode}
        isCreateForm={isCreateForm}
        parentFieldIndex={this.context.fieldIndex}
        parentItem={this.context.item}
        filterTargetKey={this.collection.filterTargetKey}
        formValuesChangeEmitter={this.context.blockModel?.emitter}
        fieldPathArray={fieldPathArray}
        getCurrentValue={() => this.getCurrentValue()}
        onResetFieldValue={onResetFieldValue}
        api={this.context.api}
        dataSourceKey={this.collection?.dataSourceKey}
        actionsColumnWidth={this.props.actionsColumnWidth}
        actionsColumnFixed={this.props.actionsColumnFixed}
        allowClearAll={this.props.allowClearAll}
        copyFields={this.props.copyFields}
      />
    );
  }
}

EnhancedSubTableFieldModel.define({
  label: tExpr('Enhanced sub-table'),
});

EnhancedSubTableFieldModel.registerFlow({
  key: 'enhancedSubTableSettings',
  title: tExpr('Enhanced sub-table settings'),
  sort: 250,
  steps: {
    allowBatchDelete: {
      title: tExpr('Enable batch delete'),
      uiMode: { type: 'switch', key: 'allowBatchDelete' },
      defaultParams: {
        allowBatchDelete: true,
      },
      handler(ctx, params) {
        ctx.model.setProps({
          allowBatchDelete: params.allowBatchDelete,
        });
      },
    },
    allowClearAll: {
      title: tExpr('Enable delete all'),
      uiMode: { type: 'switch', key: 'allowClearAll' },
      defaultParams: {
        allowClearAll: true,
      },
      handler(ctx, params) {
        ctx.model.setProps({
          allowClearAll: params.allowClearAll,
        });
      },
    },
    allowCopyRow: {
      title: tExpr('Enable copy row'),
      uiMode: { type: 'switch', key: 'allowCopyRow' },
      defaultParams: {
        allowCopyRow: true,
      },
      handler(ctx, params) {
        ctx.model.setProps({
          allowCopyRow: params.allowCopyRow,
        });
      },
    },
    // 配置入口在操作列表头的「复制」按钮（EnhancedSubTableFieldModel.setCopyFields）；
    // 此处不提供 uiSchema，仅负责在 beforeRender 时从 stepParams 把 copyFields 写回 props，
    // 因此不会出现在设置抽屉中。
    copyFields: {
      title: tExpr('Copy fields'),
      handler(ctx, params) {
        const raw = (params as any).copyFields;
        const copyFields = Array.isArray(raw)
          ? raw.filter((field: unknown): field is string => typeof field === 'string' && !!field)
          : undefined;
        ctx.model.setProps({ copyFields });
      },
    },
    allowPaste: {
      title: tExpr('Enable Excel paste'),
      uiMode: { type: 'switch', key: 'allowPaste' },
      defaultParams: {
        allowPaste: true,
      },
      handler(ctx, params) {
        ctx.model.setProps({
          allowPaste: params.allowPaste,
        });
      },
    },
    // 配置入口在操作列表头的宽度控件（EnhancedSubTableFieldModel.setActionsColumnWidth）；
    // 此处不提供 uiMode，仅负责在 beforeRender 时从 stepParams 把宽度写回 props。
    actionsColumnWidth: {
      title: tExpr('Actions column width'),
      handler(ctx, params) {
        ctx.model.setProps({
          actionsColumnWidth: normalizeTableColumnWidth(params.actionsColumnWidth),
        });
      },
    },
    // 配置入口在操作列表头的固定控件（EnhancedSubTableFieldModel.setActionsColumnFixed）；
    // 此处不提供 uiMode，仅负责在 beforeRender 时从 stepParams 把固定位置写回 props。
    actionsColumnFixed: {
      title: tExpr('Fixed'),
      handler(ctx, params) {
        ctx.model.setProps({
          actionsColumnFixed: params.actionsColumnFixed,
        });
      },
    },
  },
});

FormItemModel.bindModelToInterface('EnhancedSubTableFieldModel', ['m2m', 'o2m', 'mbm'], {
  order: 250,
  when: (ctx, field) => {
    if (isSubTableColumnFieldComponentContext(ctx)) {
      return false;
    }
    if (field.targetCollection) {
      return field.targetCollection.template !== 'file';
    }
    return true;
  },
});

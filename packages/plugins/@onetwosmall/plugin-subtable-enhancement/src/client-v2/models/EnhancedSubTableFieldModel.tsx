/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { SettingOutlined } from '@ant-design/icons';
import { AddSubModelButton, DndProvider, FlowSettingsButton, useFlowEngine } from '@nocobase/flow-engine';
import {
  CustomWidth,
  FormItemModel,
  normalizeTableColumnWidth,
  SubTableFieldModel,
  type SubTableColumnModel,
} from '@nocobase/client-v2';
import { Divider } from 'antd';
import { DragEndEvent } from '@dnd-kit/core';
import React from 'react';

import { EnhancedSubTableField } from '../components/EnhancedSubTableField';
import { EnhancedSubTableColumnModel } from './EnhancedSubTableColumnModel';
import { PLUGIN_NAMESPACE, tExpr } from '../locale';
import { dedupeColumnModels, getColumnFieldName } from '../utils/columnIdentity';
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

function collectVisibleFieldPaths(model: any): string[] {
  const names = model?.mapSubModels?.('columns', (column: any) => getColumnFieldName(column)) ?? [];
  return (names || []).filter(Boolean);
}

function isSubTableColumnFieldComponentContext(ctx: any) {
  return (ctx?.model?.constructor as any)?.fieldComponentContext === 'subTableColumn';
}

const AddFieldColumn = ({ model }: { model: any }) => {
  return (
    <AddSubModelButton
      model={model}
      subModelKey={'columns'}
      subModelBaseClasses={['EnhancedSubTableColumnModel']}
      keepDropdownOpen
    >
      <FlowSettingsButton icon={<SettingOutlined />}>
        {model.translate('Fields', { ns: [PLUGIN_NAMESPACE, 'client'] })}
      </FlowSettingsButton>
    </AddSubModelButton>
  );
};

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
        this.context.flowSettingsEnabled && {
          key: 'addColumn',
          fixed: 'right',
          width: 100,
          title: <AddFieldColumn model={this} />,
        },
      ].filter(Boolean),
    ) as any;
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
    fields: {
      title: tExpr('Displayed fields'),
      uiSchema: {
        fields: {
          type: 'array',
          'x-decorator': 'FormItem',
          'x-component': 'FieldsVisibilityEditor',
        },
      },
      defaultParams(ctx) {
        return {
          fields: collectVisibleFieldPaths(ctx.model),
        };
      },
      async handler(ctx, params) {
        const rawFields = Array.isArray(params.fields) ? (params.fields as unknown[]) : [];
        const desired: string[] = rawFields
          .filter((field: unknown): field is string => typeof field === 'string' && !!field)
          .filter((field, index, list) => list.indexOf(field) === index);
        const desiredSet = new Set(desired);

        // 清理历史遗留的重复列模型（同一字段标识保留首个），避免重复列被持久化
        const columns = ctx.model.subModels?.columns;
        if (Array.isArray(columns)) {
          const seen = new Set<string>();
          const duplicates: any[] = [];
          for (const column of columns) {
            const name = getColumnFieldName(column);
            if (name == null) continue;
            if (seen.has(name)) {
              duplicates.push(column);
            } else {
              seen.add(name);
            }
          }
          for (const duplicate of duplicates) {
            await duplicate?.destroy?.();
            const index = columns.indexOf(duplicate);
            if (index > -1) {
              columns.splice(index, 1);
            }
          }
        }

        let items: any[] = [];
        try {
          items = (EnhancedSubTableColumnModel.defineChildren(ctx.model.context as any) as any[]) || [];
        } catch {
          items = [];
        }
        const itemByKey = new Map(items.map((item) => [item.key, item]));
        const current = collectVisibleFieldPaths(ctx.model);

        // 移除被取消勾选的列（customRemove 会按字段标识移除该字段下的所有列）
        for (const name of current) {
          if (desiredSet.has(name)) continue;
          const item = itemByKey.get(name);
          if (item?.customRemove) {
            await item.customRemove(ctx.model.context);
          }
        }

        // 新增勾选且当前仍不存在的列（移除后重新计算，避免与旧列重复叠加）
        const remainingNames = new Set(collectVisibleFieldPaths(ctx.model));
        for (const name of desired) {
          if (remainingNames.has(name)) continue;
          const item = itemByKey.get(name);
          if (!item?.createModelOptions) continue;
          const engine = ctx.model.flowEngine;
          if (!engine) continue;
          const createOpts = await item.createModelOptions();
          const addedModel = await engine.createModelAsync({
            ...createOpts,
            parentId: ctx.model.uid,
            subKey: 'columns',
            subType: 'array',
          });
          addedModel.isNew = true;
          addedModel.setParent(ctx.model);
          ctx.model.addSubModel('columns', addedModel);
          await addedModel.afterAddAsSubModel();
          await addedModel.save();
          remainingNames.add(name);
        }
      },
    },
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
    actionsColumnWidth: {
      title: tExpr('Actions column width'),
      uiMode(ctx) {
        return {
          type: 'select',
          key: 'actionsColumnWidth',
          props: {
            options: [
              { label: 60, value: 60 },
              { label: 70, value: 70 },
              { label: 80, value: 80 },
              { label: 90, value: 90 },
              { label: 100, value: 100 },
              { label: 110, value: 110 },
              { label: 120, value: 120 },
              { label: 140, value: 140 },
              { label: 160, value: 160 },
              { label: 180, value: 180 },
              { label: 200, value: 200 },
            ],
            dropdownRender: (menu, setOpen, handleChange) => {
              return (
                <>
                  {menu}
                  <Divider style={{ margin: '4px 0' }} />
                  <CustomWidth
                    setOpen={setOpen}
                    handleChange={handleChange}
                    t={ctx.t}
                    defaultValue={
                      [60, 70, 80, 90, 100, 110, 120, 140, 160, 180, 200].includes(ctx.model.props.actionsColumnWidth)
                        ? null
                        : ctx.model.props.actionsColumnWidth
                    }
                  />
                </>
              );
            },
          },
        };
      },
      defaultParams(ctx) {
        return {
          actionsColumnWidth: ctx.model.props.actionsColumnWidth ?? 80,
        };
      },
      handler(ctx, params) {
        ctx.model.setProps({
          actionsColumnWidth: normalizeTableColumnWidth(params.actionsColumnWidth),
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

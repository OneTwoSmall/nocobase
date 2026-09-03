/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { type FlowModelContext } from '@nocobase/flow-engine';
import { SubTableColumnModel } from '@nocobase/client-v2';

import { PLUGIN_NAMESPACE, tExpr } from '../locale';
import { getColumnFieldName, isBelongsToField, isNumericField } from '../utils/columnIdentity';

function handleModelName(modelName: string) {
  if (['RadioGroupFieldModel', 'CheckboxGroupFieldModel'].includes(modelName)) {
    return 'SelectFieldModel';
  }
  return modelName;
}

export class EnhancedSubTableColumnModel extends SubTableColumnModel {
  static defineChildren(ctx: FlowModelContext) {
    const collection = (ctx.model as any).collection || ctx.collection;
    return collection
      .getFields()
      .map((field) => {
        if (!field.interface) {
          return null;
        }
        const binding = this.getDefaultBindingByField(ctx, field, { fallbackToTargetTitleField: true });
        if (!binding) return null;
        const fieldModel = handleModelName(binding.modelName);
        const fullName = ctx.fieldPath ? `${ctx.fieldPath}.${field.name}` : field.name;
        // 列的唯一标识使用集合字段名（dataIndex），而非可选的 fieldSettings.fieldPath，
        // 以便与原生/历史列一起参与 Displayed fields 的去重与增删。
        const columnName = field.name;

        return {
          key: columnName,
          label: field.title,
          refreshTargets: ['SubTableColumnModel/TableJSFieldItemModel'],
          toggleable: (subModel) => getColumnFieldName(subModel) === columnName,
          useModel: this.name,
          createModelOptions: () => ({
            use: this.name,
            stepParams: {
              fieldSettings: {
                init: {
                  dataSourceKey: collection.dataSourceKey,
                  collectionName: ctx.model.context.blockModel.collection.name,
                  fieldPath: fullName,
                },
              },
            },
            subModels: {
              field: {
                use: fieldModel,
                props:
                  typeof binding.defaultProps === 'function' ? binding.defaultProps(ctx, field) : binding.defaultProps,
              },
            },
          }),
          // 从原生子表格切换过来的列可能仍是 SubTableColumnModel 实例，
          // 按类匹配无法移除，这里改为按字段标识定位，并移除该字段下的所有重复列。
          customRemove: async (removeCtx: any) => {
            const parentModel = removeCtx?.model;
            const subModels = parentModel?.subModels?.columns;
            if (!Array.isArray(subModels)) {
              return;
            }
            const targets = subModels.filter((subModel) => getColumnFieldName(subModel) === columnName);
            for (const target of targets) {
              await target?.destroy?.();
              const index = subModels.indexOf(target);
              if (index > -1) {
                subModels.splice(index, 1);
              }
            }
          },
        };
      })
      .filter(Boolean);
  }
}

EnhancedSubTableColumnModel.define({
  label: tExpr('Table column'),
  icon: 'TableColumn',
  createModelOptions: {
    use: 'EnhancedSubTableColumnModel',
  },
  sort: 0,
});

EnhancedSubTableColumnModel.registerFlow({
  key: 'enhancedColumnSettings',
  title: tExpr('Enhanced column settings'),
  sort: 100,
  steps: {
    formula: {
      title: tExpr('Calculation rule'),
      // 仅数字类型的字段列可设置计算规则；与“查找回填”互斥
      hideInSettings(ctx) {
        const field = ctx.model.collectionField;
        return !!ctx.model.props.lookup || !isNumericField(field?.interface);
      },
      uiSchema: {
        formula: {
          type: 'string',
          title: tExpr('Calculation rule'),
          'x-decorator': 'FormItem',
          'x-component': 'Input',
          description: tExpr('Formula example'),
        },
      },
      defaultParams(ctx) {
        return {
          formula: ctx.model.props.formula || '',
        };
      },
      handler(ctx, params) {
        ctx.model.setProps({
          formula: params.formula?.trim() || undefined,
        });
      },
    },
    lookup: {
      title: tExpr('Lookup & fill'),
      // 关联字段下拉框列（m2o/obo）由原生下拉 + Excel 粘贴按标题字段选择记录承担，
      // 不再叠加“查找回填”；与“计算规则”互斥
      hideInSettings(ctx) {
        const field = ctx.model.collectionField;
        return !!ctx.model.props.formula || isBelongsToField(field);
      },
      uiSchema: (ctx) => ({
        lookup: {
          type: 'object',
          title: tExpr('Lookup configuration'),
          'x-decorator': 'FormItem',
          'x-component': 'LookupMappingEditor',
          'x-component-props': {
            dataSourceKey: ctx.model.collection?.dataSourceKey,
            collectionName: ctx.model.collection?.name,
          },
        },
      }),
      defaultParams(ctx) {
        return {
          lookup: ctx.model.props.lookup || {
            targetCollection: '',
            targetField: '',
            mappings: [],
            searchFields: [],
          },
        };
      },
      handler(ctx, params) {
        const lookup = params.lookup;
        // 关联字段下拉框列不保留回填配置（即使历史配置残留也被清掉）
        if (!lookup?.targetCollection || !lookup?.targetField || isBelongsToField(ctx.model.collectionField)) {
          ctx.model.setProps({ lookup: undefined });
          return;
        }
        ctx.model.setProps({ lookup });
      },
    },
  },
});

// 在字段子模型创建后同步查找列的输入提示（在原生 subTableColumnSettings.init 之后执行）
EnhancedSubTableColumnModel.registerFlow({
  key: 'enhancedColumnLookupSync',
  sort: 600,
  steps: {
    syncLookupInput: {
      handler(ctx) {
        const fieldModel = (ctx.model as any)?.subModels?.field;
        if (!fieldModel?.setProps) {
          return;
        }
        const lookup = ctx.model.props.lookup;
        if (lookup?.targetCollection && lookup?.targetField) {
          fieldModel.setProps({
            placeholder: ctx.t('Input code and press Enter to validate', { ns: [PLUGIN_NAMESPACE, 'client'] }),
          });
        } else if (fieldModel.props?.placeholder) {
          fieldModel.setProps({ placeholder: undefined });
        }
      },
    },
  },
});

EnhancedSubTableColumnModel.define({
  hide: true,
  label: tExpr('Table column'),
  searchable: true,
  searchPlaceholder: tExpr('Search columns'),
});

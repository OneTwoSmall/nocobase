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
import { getFieldDisplayTitle } from '../utils/fieldMeta';

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
      uiSchema: (ctx) => {
        // 公式引用按数据源设置的“字段显示名称”列出数字字段，点击即可插入 {{字段名}}
        const collection = ctx.model.collection;
        const numericFields = (collection?.getFields?.() ?? []).filter((field: any) =>
          isNumericField(field?.interface),
        );
        const options = numericFields.map((field: any) => ({
          label: getFieldDisplayTitle(field),
          value: field?.name,
        }));
        return {
          formula: {
            type: 'string',
            title: tExpr('Calculation rule'),
            'x-decorator': 'FormItem',
            'x-component': 'FormulaEditor',
            'x-component-props': { options },
            description: tExpr('Formula example'),
          },
        };
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
      // 所有可编辑列（含关联字段 m2o/obo 下拉列）都可配置查找回填；
      // 与“计算规则”互斥
      hideInSettings(ctx) {
        return !!ctx.model.props.formula;
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
        const existing = ctx.model.props.lookup;
        if (existing) {
          // 规范化历史配置：保证 mappings/searchFields 恒为数组
          return {
            lookup: {
              targetCollection: existing.targetCollection || '',
              targetField: existing.targetField || '',
              mappings: Array.isArray(existing.mappings) ? existing.mappings : [],
              searchFields: Array.isArray(existing.searchFields) ? existing.searchFields : [],
            },
          };
        }
        // 关联下拉列预填目标集合与标题字段，便于直接使用（运行期仍按“标题字段→主键”匹配）
        const field = ctx.model.collectionField;
        let targetCollection = '';
        let targetField = '';
        if (isBelongsToField(field)) {
          targetCollection = field.target || '';
          targetField = field.targetCollectionTitleFieldName || '';
        }
        return {
          lookup: {
            targetCollection,
            targetField,
            mappings: [],
            searchFields: targetField ? [targetField] : [],
          },
        };
      },
      handler(ctx, params) {
        const raw = params.lookup;
        const lookup =
          raw && (raw.targetCollection || raw.targetField)
            ? {
                targetCollection: raw.targetCollection || '',
                targetField: raw.targetField || '',
                mappings: Array.isArray(raw.mappings) ? raw.mappings : [],
                searchFields: Array.isArray(raw.searchFields) ? raw.searchFields : [],
              }
            : undefined;
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
        const field = ctx.model.collectionField;
        if (lookup?.targetCollection && lookup?.targetField && !isBelongsToField(field)) {
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

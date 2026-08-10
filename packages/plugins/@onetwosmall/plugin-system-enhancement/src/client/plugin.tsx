/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin, useCollectionManager_deprecated, useDesignable } from '@nocobase/client';
import { useFieldSchema } from '@formily/react';
import { EnhancedTableBlockModel } from '../client-v2/enhanced-table/EnhancedTableBlockModel';
import TableEnhancementSettings from './pages/TableEnhancementSettings';
import { EnhancedTableV1Wrapper, setEnhancedTableEnabled } from './enhanced-table/EnhancedTableV1Wrapper';
import EnhancedTableBlockInitializer from './enhanced-table/EnhancedTableBlockInitializer';
import { NAMESPACE } from './constants';
import { useT } from './locale';
// @ts-ignore
import pkg from '../../package.json';

const NS_LIST = [pkg.name, NAMESPACE, 'client'];

export class PluginSystemEnhancementClient extends Plugin {
  declare app: any;
  declare t: any;

  async load() {
    this.app.pluginSettingsManager.add(`${NAMESPACE}`, {
      title: this.t('System Enhancement'),
      icon: 'ToolOutlined',
      Component: TableEnhancementSettings,
      aclSnippet: `pm.${NAMESPACE}.settings`,
    });

    // v2 模式：注册增强表格区块模型（v1 应用内嵌 v2 引擎同样生效）
    this.flowEngine.registerModels({ EnhancedTableBlockModel });

    try {
      const res = await this.app.apiClient.request({
        url: 'systemEnhancementSettings:get/1',
        method: 'get',
      });
      const data = res?.data?.data;
      if (data) {
        setEnhancedTableEnabled(data.enableEnhancedTable !== false);
      }
    } catch {
      /* default */
    }

    // v1 模式：注册增强表格区块
    this.app.addComponents({
      EnhancedTableV1Wrapper,
      EnhancedTableBlockInitializer,
    });

    this.app.schemaInitializerManager.addItem('page:addBlock', 'dataBlocks.enhancedTable', {
      title: `{{t("Enhanced Table", { ns: ${JSON.stringify(NS_LIST)} })}}`,
      Component: EnhancedTableBlockInitializer,
    });
    this.app.schemaInitializerManager.addItem('RecordBlockInitializers', 'dataBlocks.enhancedTable', {
      title: `{{t("Enhanced Table", { ns: ${JSON.stringify(NS_LIST)} })}}`,
      Component: EnhancedTableBlockInitializer,
    });

    this.app.schemaSettingsManager.addItem('blockSettings:table', 'summaryConfig', {
      type: 'modal',
      useVisible() {
        const fieldSchema = useFieldSchema();
        // Check if TableV2 has EnhancedTableV1Wrapper
        return Object.values(fieldSchema?.properties || {}).some(
          (prop: any) => prop['x-component'] === 'TableV2' && prop['x-decorator'] === 'EnhancedTableV1Wrapper',
        );
      },
      useComponentProps() {
        const t = useT();
        const fieldSchema = useFieldSchema();
        const { getCollection } = useCollectionManager_deprecated();
        const { dn } = useDesignable();

        const tableSchema = Object.values(fieldSchema.properties || {}).find(
          (prop: any) => prop['x-component'] === 'TableV2',
        ) as any;

        const collectionName =
          fieldSchema?.['x-decorator-props']?.collection ||
          fieldSchema?.['x-decorator-props']?.association?.split('.')[0];
        const collection = getCollection(collectionName);

        const currentConfig = tableSchema?.['x-decorator-props']?.summaryConfig || {};

        return {
          title: t('Summary row settings'),
          schema: () => {
            const columnsToSelect: { label: string; value: string; disabled?: boolean }[] = [];
            if (collection) {
              collection.fields?.forEach((collectionField: any) => {
                const isNumeric =
                  ['integer', 'bigInt', 'float', 'double', 'decimal', 'number'].includes(collectionField.type) ||
                  ['number', 'integer', 'percent', 'currency'].includes(collectionField.interface);

                if (isNumeric) {
                  columnsToSelect.push({
                    label: collectionField.uiSchema?.title || collectionField.title || collectionField.name,
                    value: collectionField.name,
                  });
                }
              });
            }

            return {
              type: 'object',
              properties: {
                summaryConfig: {
                  type: 'object',
                  'x-decorator': 'FormItem',
                  'x-component': 'div',
                  default: currentConfig,
                  properties: columnsToSelect.reduce(
                    (acc, col) => {
                      acc[col.value] = {
                        type: 'string',
                        title: col.label,
                        'x-decorator': 'FormItem',
                        'x-component': 'Select',
                        'x-component-props': {
                          allowClear: true,
                          options: [
                            { label: t('Sum'), value: 'sum' },
                            { label: t('Average'), value: 'avg' },
                            { label: t('Count'), value: 'count' },
                            { label: t('Min'), value: 'min' },
                            { label: t('Max'), value: 'max' },
                          ],
                          disabled: col.disabled,
                        },
                      };
                      return acc;
                    },
                    {} as Record<string, any>,
                  ),
                },
              },
            };
          },
          onSubmit({ summaryConfig }: any) {
            if (tableSchema) {
              tableSchema['x-decorator-props'] = tableSchema['x-decorator-props'] || {};
              tableSchema['x-decorator-props'].summaryConfig = summaryConfig;

              dn.emit('patch', {
                schema: {
                  ['x-uid']: tableSchema['x-uid'],
                  'x-decorator-props': tableSchema['x-decorator-props'],
                },
              });
              dn.refresh();
            }
          },
        };
      },
    });
  }
}

export default PluginSystemEnhancementClient;

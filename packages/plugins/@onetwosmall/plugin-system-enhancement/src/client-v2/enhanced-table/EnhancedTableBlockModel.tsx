/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { observer } from '@formily/react';
import { TableBlockModel } from '@nocobase/client-v2';
import { tExpr } from '@nocobase/flow-engine';
import React, { useEffect, useMemo, useRef } from 'react';
import { PLUGIN_NAME } from '../../common/pluginMeta';
import { NAMESPACE } from '../constants';
import { useT } from '../locale';
import { isEnhancedTableEnabled } from '../state';
import { createSummaryRenderer } from './SummaryRow';
import {
  extractSummaryValues,
  isNumericField,
  type SummaryColumnMeta,
  type SummaryConfig,
  type SummaryValues,
} from './summary';
import { ENHANCED_TABLE_WRAPPER_CSS, SelectionStatsPopup, useCellSelection } from './tableDomEnhancer';
const ns = [PLUGIN_NAME, NAMESPACE, 'client'];
const EMPTY_CONFIG: SummaryConfig = {};
const EMPTY_VALUES: SummaryValues = {};
const SUMMARY_FETCH_DEBOUNCE = 300;

const EnhancedTableWrapper = observer(({ model, children }: { model?: any; children: React.ReactNode }) => {
  if (!isEnhancedTableEnabled()) {
    return <>{children}</>;
  }
  const config: SummaryConfig = model?.props?.summaryConfig || EMPTY_CONFIG;
  if (Object.keys(config).length === 0) {
    return <>{children}</>;
  }
  return <EnhancedTableWrapperInner model={model}>{children}</EnhancedTableWrapperInner>;
});

const EnhancedTableWrapperInner = observer(({ model, children }: { model?: any; children: React.ReactNode }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const t = useT();
  const config: SummaryConfig = model?.props?.summaryConfig || EMPTY_CONFIG;
  const hasConfig = Object.keys(config).length > 0;

  const columnMeta: SummaryColumnMeta = useMemo(() => {
    const numericFields = new Set<string>();
    const columnTitles: Record<string, string> = {};
    model?.mapSubModels?.('columns', (column: any) => {
      const collectionField = column?.collectionField;
      if (!collectionField) return;
      columnTitles[collectionField.name] = column.props?.title || collectionField.title || collectionField.name;
      if (isNumericField(collectionField)) {
        numericFields.add(collectionField.name);
      }
    });
    return { numericFields, columnTitles };
  }, [model]);

  // 只跟随筛选/排序参数变化聚合：分页或数据本身变化不应触发重新请求
  const requestParamsStr = JSON.stringify((model?.resource as any)?.request?.params || {});
  const configKey = JSON.stringify(config);

  useEffect(() => {
    if (!hasConfig || typeof model?.context?.api?.request !== 'function') {
      model?.setProps?.('summaryValues', EMPTY_VALUES);
      return;
    }

    let isMounted = true;
    const timer = setTimeout(async () => {
      try {
        const collectionName = model?.collection?.name;
        if (!collectionName) {
          return;
        }
        const currentOptions = (model.resource as any).getRefreshRequestOptions?.();
        // 汇总由服务端聚合，前端不再整表取数；数据范围由服务端按当前用户对该集合的 list 权限合并
        const response = await model.context.api.request({
          url: 'systemEnhancementSettings:aggregate',
          method: 'post',
          data: {
            collection: collectionName,
            dataSourceKey: (model.resource as any).getDataSourceKey?.() || model.collection?.dataSourceKey || 'main',
            filter: currentOptions?.params?.filter,
            aggregations: config,
          },
        });
        if (!isMounted) return;
        model.setProps('summaryValues', extractSummaryValues(response));
      } catch (error) {
        console.warn('[system-enhancement] failed to load the summary row values', error);
      }
    }, SUMMARY_FETCH_DEBOUNCE);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, requestParamsStr, hasConfig, configKey]);

  const { selectionStats, mousePos } = useCellSelection(containerRef, columnMeta);

  return (
    <div className={ENHANCED_TABLE_WRAPPER_CSS} ref={containerRef}>
      {children}
      {selectionStats && mousePos ? <SelectionStatsPopup stats={selectionStats} pos={mousePos} t={t} /> : null}
    </div>
  );
});

export class EnhancedTableBlockModel extends TableBlockModel {
  onInit(options: any) {
    super.onInit(options);
    // 提前挂载 summary 渲染函数：antd Table 只在自身渲染时读取该 prop，挂载后由汇总组件自行更新
    this.setProps('summary', createSummaryRenderer(this));
  }

  renderComponent() {
    const original = super.renderComponent();
    return <EnhancedTableWrapper model={this}>{original}</EnhancedTableWrapper>;
  }
}

EnhancedTableBlockModel.registerFlow({
  key: 'enhancedTableSettings',
  sort: 600,
  title: tExpr('Enhanced table settings', { ns }),
  steps: {
    summaryConfig: {
      title: tExpr('Summary row settings', { ns }),
      uiSchema: (ctx) => {
        const columnsToSelect: { label: string; value: string }[] = [];
        ctx.model.mapSubModels('columns', (column: any) => {
          const collectionField = column?.collectionField;
          if (!collectionField) return;
          if (isNumericField(collectionField)) {
            columnsToSelect.push({
              label: column.props?.title || collectionField.title || collectionField.name,
              value: collectionField.name,
            });
          }
        });

        return {
          summaryConfig: {
            type: 'object',
            'x-decorator': 'FormItem',
            'x-component': 'div',
            properties: columnsToSelect.reduce(
              (acc, col) => {
                acc[col.value] = {
                  type: 'string',
                  title: col.label,
                  'x-decorator': 'FormItem',
                  'x-component': 'Select',
                  'x-component-props': {
                    allowClear: true,
                    placeholder: `{{t("Select aggregation type", { ns: ${JSON.stringify(ns)} })}}`,
                    options: [
                      { label: `{{t("Sum", { ns: ${JSON.stringify(ns)} })}}`, value: 'sum' },
                      { label: `{{t("Average", { ns: ${JSON.stringify(ns)} })}}`, value: 'avg' },
                      { label: `{{t("Count", { ns: ${JSON.stringify(ns)} })}}`, value: 'count' },
                      { label: `{{t("Min", { ns: ${JSON.stringify(ns)} })}}`, value: 'min' },
                      { label: `{{t("Max", { ns: ${JSON.stringify(ns)} })}}`, value: 'max' },
                    ],
                  },
                };
                return acc;
              },
              {} as Record<string, any>,
            ),
          },
        };
      },
      defaultParams: { summaryConfig: {} },
      handler(ctx, params) {
        const config: SummaryConfig = {};
        for (const [key, value] of Object.entries(params.summaryConfig || {})) {
          if (value) {
            config[key] = value as SummaryConfig[string];
          }
        }
        ctx.model.setProps('summaryConfig', config);
        ctx.model.setProps('summary', createSummaryRenderer(ctx.model));
      },
    },
  },
});

EnhancedTableBlockModel.define({
  label: tExpr('Enhanced Table', { ns }),
  group: tExpr('Content'),
  searchable: true,
  searchPlaceholder: tExpr('Search'),
  createModelOptions: () => ({
    use: 'TableBlockModel',
    subModels: {
      columns: [
        {
          use: 'TableActionsColumnModel',
        },
      ],
    },
  }),
  sort: 301,
});

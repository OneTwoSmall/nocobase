/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { observer } from '@formily/react';
import { Table } from 'antd';
import React from 'react';
import { useT } from '../locale';
import { isEnhancedTableEnabled } from '../state';
import { computeSummaryRow, SUMMARY_LABELS, type SummaryConfig } from './summary';

interface SummaryColumn {
  name: string | null;
  type?: SummaryConfig[string];
}

/**
 * 汇总行需要为每个表格列渲染一个单元格（未配置聚合的列留空），否则后续列会错位。
 * 非字段列（如操作列）没有 collectionField，只占位不显示内容。
 */
function getSummaryColumns(model: any, config: SummaryConfig): SummaryColumn[] {
  const columns: SummaryColumn[] = [];
  model?.mapSubModels?.('columns', (column: any) => {
    const name: string | null = column?.collectionField?.name ?? null;
    columns.push({ name, type: name ? config[name] : undefined });
  });
  return columns;
}
/**
 * 汇总行：使用 antd Table 原生 summary 渲染（含底部固定），数据来自 model.props，
 * 汇总配置或数据变化时由 observer 自行更新，无需操作 DOM。
 */
export const EnhancedTableSummary = observer(({ model }: { model: any }) => {
  const t = useT();
  const config: SummaryConfig = model?.props?.summaryConfig || {};
  const rows: any[] = model?.props?.summaryRows || [];

  if (!isEnhancedTableEnabled() || Object.keys(config).length === 0) {
    return null;
  }

  // rowSelection 列与左侧辅助列（拖拽排序等）排在数据列之前，汇总行需要用空单元格占位
  const hasRowSelection = !!model?.isRowSelectionEnabled?.();
  const leadingCells = hasRowSelection ? 1 : model?.getLeftAuxiliaryColumn?.() ? 1 : 0;

  const values = computeSummaryRow(rows, config);
  const columns = getSummaryColumns(model, config);

  return (
    <Table.Summary fixed>
      <Table.Summary.Row>
        {Array.from({ length: leadingCells }).map((_, index) => (
          <Table.Summary.Cell key={`summary-leading-${index}`} index={index} />
        ))}
        {columns.map((column, index) => {
          const value = column.name ? values[column.name] : undefined;
          if (value === undefined || value === '') {
            return <Table.Summary.Cell key={`summary-cell-${index}`} index={leadingCells + index} />;
          }
          return (
            <Table.Summary.Cell key={`summary-cell-${index}`} index={leadingCells + index}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.4 }}>
                <span style={{ color: '#1890ff', fontWeight: 'bold', fontSize: 14 }}>{value}</span>
                <span style={{ color: '#8c8c8c', fontSize: 11, fontWeight: 'normal', letterSpacing: 0.5 }}>
                  {column.type ? t(SUMMARY_LABELS[column.type]).toUpperCase() : ''}
                </span>
              </div>
            </Table.Summary.Cell>
          );
        })}
      </Table.Summary.Row>
    </Table.Summary>
  );
});

const rendererCache = new WeakMap<object, () => React.ReactElement>();

/**
 * 生成稳定的 summary 渲染函数：同一个模型始终返回同一引用，避免表格因引用变化反复渲染。
 */
export function createSummaryRenderer(model: object): () => React.ReactElement {
  let renderer = rendererCache.get(model);
  if (!renderer) {
    renderer = () => <EnhancedTableSummary model={model} />;
    rendererCache.set(model, renderer);
  }
  return renderer;
}

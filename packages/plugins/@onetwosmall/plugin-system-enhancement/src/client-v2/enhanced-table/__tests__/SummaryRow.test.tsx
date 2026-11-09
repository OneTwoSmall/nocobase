/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { FlowEngine, FlowEngineProvider } from '@nocobase/flow-engine';
import { render } from '@testing-library/react';
import { Table } from 'antd';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { applyEnhancementFlags } from '../../state';
import { createSummaryRenderer } from '../SummaryRow';

const columns = [
  { title: 'Amount', dataIndex: 'amount' },
  { title: 'Count', dataIndex: 'count' },
  { title: 'Note', dataIndex: 'note' },
];

function createModel(overrides: Record<string, any> = {}) {
  return {
    props: {
      summaryConfig: { amount: 'sum', count: 'count' },
      summaryValues: { amount: 49.5, count: 3 },
    },
    mapSubModels: (key: string, callback: (column: any) => void) => {
      if (key !== 'columns') {
        return;
      }
      callback({ collectionField: { name: 'amount' } });
      callback({ collectionField: { name: 'count' } });
      callback({ collectionField: { name: 'note' } });
    },
    isRowSelectionEnabled: () => false,
    getLeftAuxiliaryColumn: () => null,
    ...overrides,
  };
}

function renderSummary(model: any) {
  const engine = new FlowEngine();
  return render(
    <FlowEngineProvider engine={engine}>
      <Table columns={columns} dataSource={[]} pagination={false} summary={createSummaryRenderer(model)} />
    </FlowEngineProvider>,
  );
}

describe('EnhancedTableSummary', () => {
  afterEach(() => {
    applyEnhancementFlags(undefined);
  });

  it('should render aggregated values with their labels through the native table summary', () => {
    const { container } = renderSummary(createModel());

    const cells = container.querySelectorAll('.ant-table-summary tbody td, .ant-table-summary td');
    expect(cells).toHaveLength(columns.length);
    expect(cells[0].textContent).toContain('49.50');
    expect(cells[0].textContent).toContain('SUM');
    expect(cells[1].textContent).toContain('3');
    expect(cells[1].textContent).toContain('COUNT');
    // 未配置聚合的列保持为空
    expect(cells[2].textContent).toBe('');
  });

  it('should render an extra leading cell when row selection is enabled', () => {
    const { container } = renderSummary(createModel({ isRowSelectionEnabled: () => true }));

    const cells = container.querySelectorAll('.ant-table-summary tbody td, .ant-table-summary td');
    expect(cells).toHaveLength(columns.length + 1);
    expect(cells[1].textContent).toContain('49.50');
  });

  it('should render nothing when no aggregation is configured', () => {
    const model = createModel();
    model.props.summaryConfig = {};

    const { container } = renderSummary(model);

    expect(container.querySelectorAll('.ant-table-summary td')).toHaveLength(0);
  });

  it('should render nothing when the enhanced table is disabled', () => {
    applyEnhancementFlags({ enableEnhancedTable: false });

    const { container } = renderSummary(createModel());

    expect(container.querySelectorAll('.ant-table-summary td')).toHaveLength(0);
  });
});

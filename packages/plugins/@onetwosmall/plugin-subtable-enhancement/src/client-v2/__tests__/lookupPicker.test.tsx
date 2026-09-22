/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { FlowEngine, FlowEngineProvider } from '@nocobase/flow-engine';
import { describe, expect, it, vi } from 'vitest';

import { LookupPickerModal } from '../components/LookupPickerModal';
import type { LookupConfig } from '../utils/types';

function setupEngine() {
  const engine = new FlowEngine();
  const ds = engine.dataSourceManager.getDataSource('main');
  ds.addCollection({
    name: 'units',
    filterTargetKey: 'id',
    titleField: 'unit_name',
    fields: [
      { name: 'id', type: 'integer', interface: 'number' },
      { name: 'unit_name', type: 'string', interface: 'input', title: 'Unit name' },
    ],
  });
  ds.addCollection({
    name: 'materials',
    filterTargetKey: 'id',
    titleField: 'name',
    fields: [
      { name: 'id', type: 'integer', interface: 'number' },
      { name: 'name', type: 'string', interface: 'input', title: 'Name' },
      { name: 'primary_unit', type: 'belongsTo', target: 'units', interface: 'm2o', title: 'Primary unit' },
    ],
  });
  return engine;
}

const config: LookupConfig = {
  targetCollection: 'materials',
  targetField: 'name',
  mappings: [],
  searchFields: ['name'],
  displayFields: ['name', 'primary_unit'],
};

describe('LookupPickerModal', () => {
  it('renders association columns using the target title field and exposes resize handles', async () => {
    const engine = setupEngine();
    const api = {
      request: vi.fn().mockResolvedValue({
        data: {
          data: [{ id: 1, name: 'Material A', primary_unit: { id: 1, unit_name: 'KG' } }],
          meta: { count: 1, page: 1, pageSize: 10 },
        },
      }),
    };

    render(
      <FlowEngineProvider engine={engine}>
        <LookupPickerModal open config={config} dataSourceKey="main" api={api} onClose={() => {}} onSelect={() => {}} />
      </FlowEngineProvider>,
    );

    // 关联字段列展示目标表标题字段的值，而不是整个对象 JSON
    expect(await screen.findByText('KG')).toBeTruthy();
    expect(screen.queryByText(/"unit_name":"KG"/)).toBeNull();

    // 每个表头都提供拖拽调整列宽的把手（运行时即可拖动，无需配置模式）
    await waitFor(() => {
      expect(document.querySelectorAll('[role="separator"]').length).toBeGreaterThan(0);
    });

    // 自适应列宽：列对象携带 minWidth（rc-table 写成 <col style="min-width">），
    // 标题更长的列获得更大的最小宽度，避免表头标题被省略
    const cols = Array.from(document.querySelectorAll('colgroup col')) as HTMLElement[];
    const minWidths = cols.map((col) => parseInt(col.style.minWidth || '0', 10));
    expect(minWidths.length).toBeGreaterThanOrEqual(2);
    expect(minWidths[0]).toBeGreaterThan(0);
    expect(minWidths[1]).toBeGreaterThan(minWidths[0]);

    // 自定义表头单元格仍带有 antd 的 ellipsis 类，但会被覆盖为换行完整展示
    expect(document.querySelector('th.ant-table-cell-ellipsis')).toBeTruthy();
  });
});

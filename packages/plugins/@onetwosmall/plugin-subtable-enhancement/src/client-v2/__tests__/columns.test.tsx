/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it, vi } from 'vitest';
import { FlowEngine } from '@nocobase/flow-engine';
import { EnhancedSubTableColumnModel } from '../models/EnhancedSubTableColumnModel';

const binding = {
  modelName: 'InputFieldModel',
  isDefault: true,
  order: 1,
  when: () => true,
  defaultProps: null,
};

const field = { name: 'material_code', title: '物料编码', interface: 'input' };
const collection = {
  name: 'request_details',
  dataSourceKey: 'main',
  getFields: () => [field],
};

function createCtx() {
  const blockModel = { collection: { name: collection.name } };
  const parentModel = {
    context: {},
    findSubModel: vi.fn().mockReturnValue(null),
    subModels: { columns: [] },
  } as any;
  parentModel.context = { blockModel, model: parentModel };
  return {
    ctx: {
      model: parentModel,
      collection,
      fieldPath: '',
    } as any,
    parentModel,
  };
}

describe('EnhancedSubTableColumnModel.defineChildren', () => {
  it('builds toggleable column items that create EnhancedSubTableColumnModel columns', async () => {
    const bindingSpy = vi
      .spyOn(EnhancedSubTableColumnModel, 'getDefaultBindingByField')
      .mockReturnValue(binding as any);
    try {
      const { ctx } = createCtx();
      const items = (await EnhancedSubTableColumnModel.defineChildren(ctx as any)) as any[];
      expect(items).toHaveLength(1);
      const item = items[0];
      expect(item.key).toBe('material_code');
      expect(item.label).toBe('物料编码');
      expect(item.useModel).toBe('EnhancedSubTableColumnModel');
      expect(typeof item.toggleable).toBe('function');
      expect(typeof item.customRemove).toBe('function');

      const options = await item.createModelOptions();
      expect(options).toMatchObject({
        use: 'EnhancedSubTableColumnModel',
        stepParams: {
          fieldSettings: {
            init: {
              dataSourceKey: 'main',
              collectionName: 'request_details',
              fieldPath: 'material_code',
            },
          },
        },
        subModels: {
          field: { use: 'InputFieldModel' },
        },
      });
    } finally {
      bindingSpy.mockRestore();
    }
  });

  it('skips fields without an interface', async () => {
    const bindingSpy = vi
      .spyOn(EnhancedSubTableColumnModel, 'getDefaultBindingByField')
      .mockReturnValue(binding as any);
    try {
      const { ctx } = createCtx();
      (ctx as any).collection = { ...collection, getFields: () => [{ name: 'raw', title: '无界面字段' }] };
      const items = (await EnhancedSubTableColumnModel.defineChildren(ctx as any)) as any[];
      expect(items).toHaveLength(0);
    } finally {
      bindingSpy.mockRestore();
    }
  });

  it('removes columns by fieldPath regardless of the column model class', async () => {
    const bindingSpy = vi
      .spyOn(EnhancedSubTableColumnModel, 'getDefaultBindingByField')
      .mockReturnValue(binding as any);
    try {
      const destroy = vi.fn().mockResolvedValue(undefined);
      const legacyColumn = {
        getStepParams: vi.fn().mockReturnValue({ fieldPath: 'material_code' }),
        destroy,
      };
      const subModels = [legacyColumn];
      const { ctx } = createCtx();
      ctx.model.findSubModel = vi.fn((key: string, cb: (m: any) => boolean) => {
        return subModels.find(cb) || null;
      });
      ctx.model.subModels = { columns: subModels };

      const items = (await EnhancedSubTableColumnModel.defineChildren(ctx as any)) as any[];
      await items[0].customRemove(ctx.model.context);

      expect(destroy).toHaveBeenCalledTimes(1);
      expect(subModels).toHaveLength(0);
    } finally {
      bindingSpy.mockRestore();
    }
  });

  it('does nothing when the column is already gone', async () => {
    const bindingSpy = vi
      .spyOn(EnhancedSubTableColumnModel, 'getDefaultBindingByField')
      .mockReturnValue(binding as any);
    try {
      const { ctx } = createCtx();
      const items = (await EnhancedSubTableColumnModel.defineChildren(ctx as any)) as any[];
      await expect(items[0].customRemove(ctx.model.context)).resolves.toBeUndefined();
      // 没有匹配列时不做任何删除
      expect(ctx.model.subModels.columns).toHaveLength(0);
    } finally {
      bindingSpy.mockRestore();
    }
  });
});

describe('EnhancedSubTableColumnModel column width', () => {
  it('exposes the inherited native width setting step', () => {
    const engine = new FlowEngine();
    engine.registerModels({ EnhancedSubTableColumnModel });
    const model = engine.createModel<any>({
      use: 'EnhancedSubTableColumnModel',
      uid: 'EnhancedSubTableColumnModel',
      props: {},
    });
    const flow = model.getFlows().get('subTableColumnSettings');
    expect(flow).toBeDefined();
    expect(flow.steps.width).toBeDefined();
  });

  it('applies the width setting to the column props through the native handler', () => {
    const engine = new FlowEngine();
    engine.registerModels({ EnhancedSubTableColumnModel });
    const model = engine.createModel<any>({
      use: 'EnhancedSubTableColumnModel',
      uid: 'EnhancedSubTableColumnModel',
      props: { dataIndex: 'material_code', width: 200 },
    });
    const flow = model.getFlows().get('subTableColumnSettings');

    // 模拟设置抽屉保存：宽度 320 → 原生 handler → props.width
    flow.steps.width.handler(
      {
        model: {
          setProps: (key: any, value: any) => model.setProps(key, value),
        },
      } as any,
      { width: 320 },
    );

    expect(model.props.width).toBe(320);

    // 列定义必须携带新宽度（getColumnProps 来自原生实现，由表格消费）
    const columnProps = model.getColumnProps();
    expect(columnProps.width).toBe(320);
  });
});

describe('EnhancedSubTableColumnModel settings visibility', () => {
  function getSettingsFlow() {
    const engine = new FlowEngine();
    engine.registerModels({ EnhancedSubTableColumnModel });
    const model = engine.createModel<any>({
      use: 'EnhancedSubTableColumnModel',
      uid: 'EnhancedSubTableColumnModel',
      props: {},
    });
    return model.getFlows().get('enhancedColumnSettings');
  }

  it('only offers the calculation rule on numeric field columns', () => {
    const flow = getSettingsFlow();
    const hide = (iface?: string, lookup?: any) =>
      flow.steps.formula.hideInSettings({ model: { props: { lookup }, collectionField: { interface: iface } } } as any);
    expect(hide('number')).toBe(false);
    expect(hide('integer')).toBe(false);
    expect(hide('decimal')).toBe(false);
    expect(hide('percent')).toBe(false);
    expect(hide('input')).toBe(true);
    expect(hide('select')).toBe(true);
    // 与“查找回填”互斥
    expect(hide('number', { targetCollection: 'materials', targetField: 'code' })).toBe(true);
  });

  it('hides lookup & fill on association (m2o/obo) dropdown columns', () => {
    const flow = getSettingsFlow();
    const hide = (field?: any, formula?: string) =>
      flow.steps.lookup.hideInSettings({ model: { props: { formula }, collectionField: field } } as any);
    expect(hide({ interface: 'm2o', target: 'products' })).toBe(true);
    expect(hide({ interface: 'obo', target: 'profiles' })).toBe(true);
    expect(hide({ interface: 'input' })).toBe(false);
    expect(hide({ interface: 'number' })).toBe(false);
    // 与“计算规则”互斥
    expect(hide({ interface: 'input' }, '{{a}} * {{b}}')).toBe(true);
  });
});

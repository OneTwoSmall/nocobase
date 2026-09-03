/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { FlowEngine } from '@nocobase/flow-engine';
import { FormItemModel } from '@nocobase/client-v2';
import { describe, expect, it, vi } from 'vitest';

import { EnhancedSubTableColumnModel } from '../models/EnhancedSubTableColumnModel';
import { EnhancedSubTableFieldModel } from '../models/EnhancedSubTableFieldModel';
import PluginSubtableEnhancementClientV2 from '../plugin';

describe('EnhancedSubTable models', () => {
  it('registers model loaders and the lookup mapping editor loader', async () => {
    const registerModelLoaders = vi.fn();
    const registerComponentLoaders = vi.fn();
    const flowEngine = {
      flowSettings: { registerComponentLoaders },
      registerModelLoaders,
    };
    const plugin = Object.create(PluginSubtableEnhancementClientV2.prototype) as PluginSubtableEnhancementClientV2 & {
      app: { flowEngine: typeof flowEngine };
    };
    plugin.app = { flowEngine } as any;

    await plugin.load();

    expect(registerComponentLoaders).toHaveBeenCalledWith({
      LookupMappingEditor: expect.any(Function),
      FieldsVisibilityEditor: expect.any(Function),
    });
    expect(registerModelLoaders).toHaveBeenCalledWith({
      EnhancedSubTableFieldModel: { loader: expect.any(Function) },
      EnhancedSubTableColumnModel: { loader: expect.any(Function) },
    });

    const loaders = registerModelLoaders.mock.calls[0][0];
    await expect(loaders.EnhancedSubTableFieldModel.loader()).resolves.toHaveProperty(
      'EnhancedSubTableFieldModel',
      EnhancedSubTableFieldModel,
    );
    await expect(loaders.EnhancedSubTableColumnModel.loader()).resolves.toHaveProperty(
      'EnhancedSubTableColumnModel',
      EnhancedSubTableColumnModel,
    );
  });

  it('binds the enhanced sub-table to m2m/o2m/mbm interfaces', () => {
    const bindings = FormItemModel.bindings as Map<string, any[]>;
    for (const interfaceName of ['m2m', 'o2m', 'mbm']) {
      const list = bindings.get(interfaceName) || [];
      const binding = list.find((item) => item.modelName === 'EnhancedSubTableFieldModel');
      expect(binding).toBeDefined();
      expect(binding.order).toBe(250);
    }
  });

  it('defines the field model flow steps with defaults', () => {
    const engine = new FlowEngine();
    engine.registerModels({ EnhancedSubTableFieldModel });
    const model = engine.createModel<any>({
      use: 'EnhancedSubTableFieldModel',
      uid: 'EnhancedSubTableFieldModel',
      props: {},
    });
    const flow = model.getFlows().get('enhancedSubTableSettings');
    expect(flow).toBeDefined();
    expect(flow.steps.allowBatchDelete.defaultParams).toEqual({ allowBatchDelete: true });
    expect(flow.steps.allowCopyRow.defaultParams).toEqual({ allowCopyRow: true });
    expect(flow.steps.allowPaste.defaultParams).toEqual({ allowPaste: true });
    // 幽灵行/保留空行设置已移除
    expect(flow.steps.keepEmptyRow).toBeUndefined();

    const setProps = vi.fn();
    const ctx = { model: { props: {}, setProps } } as any;
    flow.steps.allowBatchDelete.handler(ctx, { allowBatchDelete: false });
    expect(setProps).toHaveBeenCalledWith({ allowBatchDelete: false });
  });

  it('defines the actions column width step with a default of 80', () => {
    const engine = new FlowEngine();
    engine.registerModels({ EnhancedSubTableFieldModel });
    const model = engine.createModel<any>({
      use: 'EnhancedSubTableFieldModel',
      uid: 'EnhancedSubTableFieldModel',
      props: {},
    });
    const flow = model.getFlows().get('enhancedSubTableSettings');
    expect(flow.steps.actionsColumnWidth).toBeDefined();

    const setProps = vi.fn();
    const ctx = { model: { props: {}, setProps } } as any;
    expect(flow.steps.actionsColumnWidth.defaultParams(ctx)).toEqual({ actionsColumnWidth: 80 });
    expect(flow.steps.actionsColumnWidth.uiMode(ctx)).toMatchObject({
      type: 'select',
      key: 'actionsColumnWidth',
    });

    flow.steps.actionsColumnWidth.handler(ctx, { actionsColumnWidth: 120 });
    expect(setProps).toHaveBeenCalledWith({ actionsColumnWidth: 120 });

    flow.steps.actionsColumnWidth.handler(ctx, { actionsColumnWidth: 88 });
    expect(setProps).toHaveBeenCalledWith({ actionsColumnWidth: 88 });
  });

  it('keeps the native column settings flow inherited from SubTableColumnModel', () => {
    const engine = new FlowEngine();
    engine.registerModels({ EnhancedSubTableColumnModel });
    const model = engine.createModel<any>({
      use: 'EnhancedSubTableColumnModel',
      uid: 'EnhancedSubTableColumnModel',
      props: {},
    });
    const flows = model.getFlows();
    // 原生列设置（列宽/标题/固定/字段组件等）必须对增强列可用
    expect(flows.get('subTableColumnSettings')).toBeDefined();
    expect(flows.get('fieldSettings')).toBeDefined();
  });

  it('defines the column model flow steps for formula and lookup', () => {
    const engine = new FlowEngine();
    engine.registerModels({ EnhancedSubTableColumnModel });
    const model = engine.createModel<any>({
      use: 'EnhancedSubTableColumnModel',
      uid: 'EnhancedSubTableColumnModel',
      props: {},
    });
    const flow = model.getFlows().get('enhancedColumnSettings');
    expect(flow).toBeDefined();

    const setProps = vi.fn();
    const ctx = { model: { props: {}, setProps } } as any;

    expect(flow.steps.formula.defaultParams(ctx)).toEqual({ formula: '' });
    flow.steps.formula.handler(ctx, { formula: 'nastnum * budget_price' });
    expect(setProps).toHaveBeenCalledWith({ formula: 'nastnum * budget_price' });

    expect(flow.steps.lookup.defaultParams(ctx)).toEqual({
      lookup: { targetCollection: '', targetField: '', mappings: [], searchFields: [] },
    });
    flow.steps.lookup.handler(ctx, {
      lookup: { targetCollection: 'materials', targetField: 'material_code', mappings: [], searchFields: [] },
    });
    expect(setProps).toHaveBeenCalledWith({
      lookup: { targetCollection: 'materials', targetField: 'material_code', mappings: [], searchFields: [] },
    });

    flow.steps.lookup.handler(ctx, { lookup: { targetCollection: '', targetField: '' } });
    expect(setProps).toHaveBeenCalledWith({ lookup: undefined });
  });

  it('defines the displayed-fields step reporting current visible columns', () => {
    const engine = new FlowEngine();
    engine.registerModels({ EnhancedSubTableFieldModel });
    const model = engine.createModel<any>({
      use: 'EnhancedSubTableFieldModel',
      uid: 'EnhancedSubTableFieldModel',
      props: {},
    });
    const flow = model.getFlows().get('enhancedSubTableSettings');
    expect(flow.steps.fields).toBeDefined();
    expect(flow.steps.fields.uiSchema.fields).toMatchObject({
      type: 'array',
      'x-component': 'FieldsVisibilityEditor',
    });

    const fakeModel = {
      mapSubModels: (_key: string, fn: (m: any) => any) =>
        [
          { getStepParams: () => ({ fieldPath: 'material_code' }) },
          { getStepParams: () => ({ fieldPath: 'nastnum' }) },
          { getStepParams: () => undefined },
        ].map(fn),
    };
    expect(flow.steps.fields.defaultParams({ model: fakeModel })).toEqual({
      fields: ['material_code', 'nastnum'],
    });
  });

  it('applies field visibility changes by removing unchecked and adding checked columns', async () => {
    const removeMaterialCode = vi.fn().mockResolvedValue(undefined);
    const removeNastnum = vi.fn().mockResolvedValue(undefined);
    const defineChildrenSpy = vi.spyOn(EnhancedSubTableColumnModel, 'defineChildren').mockReturnValue([
      { key: 'material_code', customRemove: removeMaterialCode, createModelOptions: async () => ({}) },
      { key: 'nastnum', customRemove: removeNastnum, createModelOptions: async () => ({}) },
    ] as any);

    const addedModel = {
      isNew: false,
      setParent: vi.fn(),
      afterAddAsSubModel: vi.fn().mockResolvedValue(undefined),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const createModelAsync = vi.fn().mockResolvedValue(addedModel);
    const parentModel = {
      uid: 'field-model',
      context: {},
      flowEngine: { createModelAsync },
      currentFieldPaths: ['material_code', 'nastnum'],
      mapSubModels: (_key: string, fn: (m: any) => any) =>
        parentModel.currentFieldPaths.map((fieldPath: string) => ({ getStepParams: () => ({ fieldPath }) })).map(fn),
      addSubModel: vi.fn(),
      subModels: { columns: [] },
    } as any;

    try {
      const engine = new FlowEngine();
      engine.registerModels({ EnhancedSubTableFieldModel });
      const model = engine.createModel<any>({
        use: 'EnhancedSubTableFieldModel',
        uid: 'fields-handler-model',
        props: {},
      });
      const flow = model.getFlows().get('enhancedSubTableSettings');

      // 当前列: [material_code, nastnum]，勾选结果: [material_code] → nastnum 被移除
      await flow.steps.fields.handler({ model: parentModel }, { fields: ['material_code'] });
      expect(removeNastnum).toHaveBeenCalledTimes(1);
      expect(removeMaterialCode).not.toHaveBeenCalled();

      // 勾选新增列: 当前仅 material_code，勾选 [material_code, nastnum] → nastnum 新建
      removeNastnum.mockClear();
      removeMaterialCode.mockClear();
      createModelAsync.mockClear();
      parentModel.currentFieldPaths = ['material_code'];
      await flow.steps.fields.handler({ model: parentModel }, { fields: ['material_code', 'nastnum'] });
      expect(removeNastnum).not.toHaveBeenCalled();
      expect(removeMaterialCode).not.toHaveBeenCalled();
      expect(createModelAsync).toHaveBeenCalledTimes(1);
      expect(addedModel.setParent).toHaveBeenCalledWith(parentModel);
      expect(addedModel.afterAddAsSubModel).toHaveBeenCalledTimes(1);
      expect(addedModel.save).toHaveBeenCalledTimes(1);
    } finally {
      defineChildrenSpy.mockRestore();
    }
  });

  it('deduplicates persisted duplicate columns when fields are saved', async () => {
    const dupA = { props: { dataIndex: 'material_code' }, destroy: vi.fn().mockResolvedValue(undefined) };
    const dupB = { props: { dataIndex: 'material_code' }, destroy: vi.fn().mockResolvedValue(undefined) };
    const kept = { props: { dataIndex: 'nastnum' }, destroy: vi.fn().mockResolvedValue(undefined) };
    const columns: any[] = [dupA, dupB, kept];

    const defineChildrenSpy = vi.spyOn(EnhancedSubTableColumnModel, 'defineChildren').mockReturnValue([
      { key: 'material_code', customRemove: vi.fn(), createModelOptions: async () => ({}) },
      { key: 'nastnum', customRemove: vi.fn(), createModelOptions: async () => ({}) },
    ] as any);

    const parentModel = {
      uid: 'fields-dedupe',
      context: {},
      flowEngine: { createModelAsync: vi.fn() },
      subModels: { columns },
      mapSubModels: (_key: string, fn: (m: any) => any) => columns.map(fn),
      addSubModel: vi.fn(),
    } as any;

    try {
      const engine = new FlowEngine();
      engine.registerModels({ EnhancedSubTableFieldModel });
      const model = engine.createModel<any>({
        use: 'EnhancedSubTableFieldModel',
        uid: 'fields-dedupe-model',
        props: {},
      });
      const flow = model.getFlows().get('enhancedSubTableSettings');

      // 保存“显示字段”时清理同字段的重复列（保留首个），且不会重复新增
      await flow.steps.fields.handler({ model: parentModel }, { fields: ['material_code', 'nastnum'] });

      expect(dupB.destroy).toHaveBeenCalledTimes(1);
      expect(dupA.destroy).not.toHaveBeenCalled();
      expect(kept.destroy).not.toHaveBeenCalled();
      expect(columns).toHaveLength(2);
      expect(columns[0]).toBe(dupA);
      expect(columns[1]).toBe(kept);
      expect(parentModel.flowEngine.createModelAsync).not.toHaveBeenCalled();
    } finally {
      defineChildrenSpy.mockRestore();
    }
  });
});

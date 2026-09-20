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
      FormulaEditor: expect.any(Function),
      LookupMappingEditor: expect.any(Function),
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
    expect(flow.steps.allowClearAll.defaultParams).toEqual({ allowClearAll: true });
    expect(flow.steps.allowCopyRow.defaultParams).toEqual({ allowCopyRow: true });
    expect(flow.steps.allowPaste.defaultParams).toEqual({ allowPaste: true });
    // 幽灵行/保留空行设置已移除
    expect(flow.steps.keepEmptyRow).toBeUndefined();

    const setProps = vi.fn();
    const ctx = { model: { props: {}, setProps } } as any;
    flow.steps.allowBatchDelete.handler(ctx, { allowBatchDelete: false });
    expect(setProps).toHaveBeenCalledWith({ allowBatchDelete: false });
    flow.steps.allowClearAll.handler(ctx, { allowClearAll: false });
    expect(setProps).toHaveBeenCalledWith({ allowClearAll: false });
  });

  it('defines hidden copy-fields / actions-column steps that apply props on beforeRender', () => {
    const engine = new FlowEngine();
    engine.registerModels({ EnhancedSubTableFieldModel });
    const model = engine.createModel<any>({
      use: 'EnhancedSubTableFieldModel',
      uid: 'EnhancedSubTableFieldModel-hidden-steps',
      props: {},
    });
    const flow = model.getFlows().get('enhancedSubTableSettings');
    expect(flow.steps.copyFields).toBeDefined();
    expect(flow.steps.actionsColumnWidth).toBeDefined();
    expect(flow.steps.actionsColumnFixed).toBeDefined();
    // 配置入口已移到操作列表头，抽屉中不再提供 uiSchema / uiMode
    expect(flow.steps.copyFields.uiSchema).toBeUndefined();
    expect(flow.steps.actionsColumnWidth.uiMode).toBeUndefined();
    expect(flow.steps.actionsColumnFixed.uiMode).toBeUndefined();

    const setProps = vi.fn();
    const ctx = { model: { props: {}, setProps } } as any;
    flow.steps.copyFields.handler(ctx, { copyFields: ['material_code', 'nastnum'] });
    expect(setProps).toHaveBeenCalledWith({ copyFields: ['material_code', 'nastnum'] });
    flow.steps.copyFields.handler(ctx, { copyFields: undefined });
    expect(setProps).toHaveBeenCalledWith({ copyFields: undefined });

    flow.steps.actionsColumnWidth.handler(ctx, { actionsColumnWidth: 120 });
    expect(setProps).toHaveBeenCalledWith({ actionsColumnWidth: 120 });

    flow.steps.actionsColumnFixed.handler(ctx, { actionsColumnFixed: 'left' });
    expect(setProps).toHaveBeenCalledWith({ actionsColumnFixed: 'left' });
  });

  it('persists copy fields / actions column width and fixed through the model setters', async () => {
    const engine = new FlowEngine();
    engine.registerModels({ EnhancedSubTableFieldModel });
    const model = engine.createModel<any>({
      use: 'EnhancedSubTableFieldModel',
      uid: 'EnhancedSubTableFieldModel-setters',
      props: {},
    });
    const saveStepParams = vi.fn().mockResolvedValue(undefined);
    model.saveStepParams = saveStepParams;

    await model.setCopyFields(['material_code']);
    expect(model.props.copyFields).toEqual(['material_code']);
    expect(model.getStepParams('enhancedSubTableSettings', 'copyFields')).toEqual({
      copyFields: ['material_code'],
    });
    expect(saveStepParams).toHaveBeenCalledTimes(1);

    await model.setActionsColumnWidth(120);
    expect(model.props.actionsColumnWidth).toBe(120);
    expect(model.getStepParams('enhancedSubTableSettings', 'actionsColumnWidth')).toEqual({
      actionsColumnWidth: 120,
    });
    expect(saveStepParams).toHaveBeenCalledTimes(2);

    await model.setActionsColumnFixed('left');
    expect(model.props.actionsColumnFixed).toBe('left');
    expect(model.getStepParams('enhancedSubTableSettings', 'actionsColumnFixed')).toEqual({
      actionsColumnFixed: 'left',
    });
    expect(saveStepParams).toHaveBeenCalledTimes(3);
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
});

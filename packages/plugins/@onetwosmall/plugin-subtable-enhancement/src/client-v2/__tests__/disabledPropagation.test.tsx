/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { Form } from 'antd';
import { FlowEngine, FlowEngineProvider, FlowModelRenderer } from '@nocobase/flow-engine';
import { InputFieldModel } from '@nocobase/client-v2';
import { describe, expect, it } from 'vitest';

import { EnhancedSubTableColumnModel } from '../models/EnhancedSubTableColumnModel';
import { EnhancedSubTableFieldModel } from '../models/EnhancedSubTableFieldModel';

function setupField() {
  const engine = new FlowEngine();
  engine.registerModels({
    EnhancedSubTableFieldModel,
    EnhancedSubTableColumnModel,
    InputFieldModel,
  });

  const ds = engine.dataSourceManager.getDataSource('main');
  ds.addCollection({
    name: 'users',
    filterTargetKey: 'id',
    fields: [
      { name: 'id', type: 'integer', interface: 'number' },
      { name: 'roles', type: 'hasMany', interface: 'o2m', target: 'roles', title: 'Roles' },
    ],
  });
  ds.addCollection({
    name: 'roles',
    filterTargetKey: 'id',
    fields: [
      { name: 'id', type: 'integer', interface: 'number' },
      { name: 'name', type: 'string', interface: 'input', title: 'Name' },
    ],
  });
  const targetCollection = ds.getCollection('roles');

  const fieldModel: any = engine.createModel({
    use: 'EnhancedSubTableFieldModel',
    uid: 'field-1',
    props: { disabled: false, value: [{ id: 1, name: 'a' }] },
    stepParams: {
      fieldSettings: { init: { dataSourceKey: 'main', collectionName: 'users', fieldPath: 'roles' } },
    },
    subModels: {
      columns: [
        {
          use: 'EnhancedSubTableColumnModel',
          uid: 'col-1',
          props: { dataIndex: 'name', title: 'Name', width: 200, disabled: false },
          stepParams: {
            fieldSettings: { init: { dataSourceKey: 'main', collectionName: 'roles', fieldPath: 'name' } },
          },
          subModels: {
            field: {
              use: 'InputFieldModel',
              uid: 'col-field-1',
              props: {},
              stepParams: {
                fieldSettings: { init: { dataSourceKey: 'main', collectionName: 'roles', fieldPath: 'name' } },
              },
            },
          },
        },
      ],
    },
  });
  fieldModel.context.defineProperty('collection', { value: targetCollection });
  fieldModel.context.defineProperty('collectionField', {
    value: { name: 'roles', target: 'roles', targetCollection, targetCollectionTitleFieldName: 'name' },
  });
  fieldModel.context.defineProperty('blockModel', {
    value: {
      context: { actionName: 'update', form: { getFieldValue: () => fieldModel.props.value } },
      setFieldValue: () => {},
    },
  });

  return { engine, fieldModel };
}

function renderField(engine: FlowEngine, fieldModel: any) {
  return render(
    <FlowEngineProvider engine={engine}>
      <Form>
        <FlowModelRenderer model={fieldModel} />
      </Form>
    </FlowEngineProvider>,
  );
}

describe('EnhancedSubTableField disabled propagation', () => {
  it('disables cells when the field is disabled and restores them when enabled', async () => {
    const { engine, fieldModel } = setupField();

    const { container } = renderField(engine, fieldModel);
    await waitFor(() => expect(container.querySelector('input')).toBeTruthy());
    expect(container.querySelector('input')?.disabled).toBe(false);

    await act(async () => {
      fieldModel.setProps({ disabled: true });
    });
    await waitFor(() => expect(container.querySelector('input')?.disabled).toBe(true));

    await act(async () => {
      fieldModel.setProps({ disabled: false });
    });
    await waitFor(() => expect(container.querySelector('input')?.disabled).toBe(false));
  });

  it('restores cells after the field component remounts while disabled', async () => {
    const { engine, fieldModel } = setupField();

    const first = renderField(engine, fieldModel);
    await waitFor(() => expect(first.container.querySelector('input')).toBeTruthy());

    await act(async () => {
      fieldModel.setProps({ disabled: true });
    });
    await waitFor(() => expect(first.container.querySelector('input')?.disabled).toBe(true));

    // 字段禁用期间组件重新挂载（表单值/布局变化等场景）
    first.unmount();
    const second = renderField(engine, fieldModel);
    await waitFor(() => expect(second.container.querySelector('input')?.disabled).toBe(true));

    await act(async () => {
      fieldModel.setProps({ disabled: false });
    });
    await waitFor(() => expect(second.container.querySelector('input')?.disabled).toBe(false));
  });
});

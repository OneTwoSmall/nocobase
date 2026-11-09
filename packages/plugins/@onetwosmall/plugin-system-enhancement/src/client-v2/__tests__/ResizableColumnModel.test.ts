/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { FlowEngine } from '@nocobase/flow-engine';
import { describe, expect, it } from 'vitest';
import { ResizableSubTableColumnModel, ResizableTableColumnModel } from '../ResizableColumnModel';

describe('ResizableColumnModel', () => {
  it('should override the native column models through model registration', () => {
    const engine = new FlowEngine();
    engine.registerModels({
      TableColumnModel: ResizableTableColumnModel,
      SubTableColumnModel: ResizableSubTableColumnModel,
    });

    expect(engine.getModelClass('TableColumnModel')).toBe(ResizableTableColumnModel);
    expect(engine.getModelClass('SubTableColumnModel')).toBe(ResizableSubTableColumnModel);
  });

  it('should override getColumnProps on the subclass instead of the core prototype', () => {
    const corePrototype = Object.getPrototypeOf(ResizableTableColumnModel.prototype);
    expect(ResizableTableColumnModel.prototype.getColumnProps).not.toBe(corePrototype.getColumnProps);
    expect(Object.getPrototypeOf(ResizableSubTableColumnModel.prototype).getColumnProps).toBeDefined();
  });
});

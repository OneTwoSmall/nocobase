/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyEnhancementFlags,
  enhancementFlags,
  isEnhancedTableEnabled,
  isTableColumnResizeEnabled,
  setEnhancedTableEnabled,
  setTableColumnResizeEnabled,
} from '../state';

describe('enhancement flags store', () => {
  beforeEach(() => {
    applyEnhancementFlags(undefined);
  });

  it('should default to both enhancements enabled', () => {
    expect(isTableColumnResizeEnabled()).toBe(true);
    expect(isEnhancedTableEnabled()).toBe(true);
  });

  it('should treat missing settings fields as enabled', () => {
    applyEnhancementFlags({ enableTableColumnResize: false });

    expect(isTableColumnResizeEnabled()).toBe(false);
    expect(isEnhancedTableEnabled()).toBe(true);
  });

  it('should read both flags from the persisted settings', () => {
    applyEnhancementFlags({ enableTableColumnResize: false, enableEnhancedTable: false });

    expect(isTableColumnResizeEnabled()).toBe(false);
    expect(isEnhancedTableEnabled()).toBe(false);
  });

  it('should update the shared observable so subscribed components re-render', () => {
    setTableColumnResizeEnabled(false);

    expect(enhancementFlags.enableTableColumnResize).toBe(false);
    expect(isTableColumnResizeEnabled()).toBe(false);

    setEnhancedTableEnabled(false);

    expect(enhancementFlags.enableEnhancedTable).toBe(false);
    expect(isEnhancedTableEnabled()).toBe(false);
  });
});

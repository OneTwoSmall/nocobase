/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResizableHeader } from '../ResizableHeader';
import { applyEnhancementFlags, setTableColumnResizeEnabled } from '../state';

const model = {
  setProps: vi.fn(),
  setStepParams: vi.fn(),
  saveStepParams: vi.fn(() => Promise.resolve()),
};

function renderHeader() {
  return render(
    <ResizableHeader model={model} width={120}>
      Amount
    </ResizableHeader>,
  );
}

describe('ResizableHeader', () => {
  afterEach(() => {
    act(() => applyEnhancementFlags(undefined));
    vi.clearAllMocks();
  });

  it('should render the title inside a resizable wrapper when enabled', () => {
    applyEnhancementFlags({ enableTableColumnResize: true });

    const { container } = renderHeader();

    expect(screen.getByText('Amount')).toBeTruthy();
    // 包裹层 + 内容层 + 拖拽手柄
    expect(container.querySelectorAll('div')).toHaveLength(3);
  });

  it('should render the native title when disabled', () => {
    applyEnhancementFlags({ enableTableColumnResize: false });

    const { container } = renderHeader();

    expect(screen.getByText('Amount')).toBeTruthy();
    expect(container.querySelectorAll('div')).toHaveLength(0);
  });

  it('should react to the flag change without remounting', () => {
    applyEnhancementFlags({ enableTableColumnResize: true });

    const { container } = renderHeader();
    expect(container.querySelectorAll('div')).toHaveLength(3);

    act(() => setTableColumnResizeEnabled(false));

    expect(container.querySelectorAll('div')).toHaveLength(0);
  });
});

/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it, vi } from 'vitest';

import { syncColumnDisabled, type DisabledColumnLike } from '../utils/columnDisabled';

function createColumn(disabled?: boolean): DisabledColumnLike & { props: { disabled?: boolean } } {
  const column: any = {
    props: { disabled },
    setProps: vi.fn((next: Record<string, unknown>) => {
      Object.assign(column.props, next);
    }),
  };
  return column;
}

describe('syncColumnDisabled', () => {
  it('forces all columns disabled when the block is disabled', () => {
    const a = createColumn();
    const b = createColumn(true);
    const map = new WeakMap<object, boolean>();

    syncColumnDisabled([a, b], true, map);

    expect(a.props.disabled).toBe(true);
    expect(b.props.disabled).toBe(true);
    expect(a.setProps).toHaveBeenCalledWith({ disabled: true });
    // 已禁用的列无需重复设置
    expect(b.setProps).not.toHaveBeenCalled();
  });

  it('restores each column own disabled after the block is enabled', () => {
    const a = createColumn();
    const b = createColumn(true);
    const map = new WeakMap<object, boolean>();

    syncColumnDisabled([a, b], true, map);
    expect(a.props.disabled).toBe(true);
    expect(b.props.disabled).toBe(true);

    syncColumnDisabled([a, b], false, map);

    // a 自身原本可编辑 → 还原为 false；b 自身原本禁用 → 保持 true
    expect(a.props.disabled).toBe(false);
    expect(b.props.disabled).toBe(true);
    expect(a.setProps).toHaveBeenLastCalledWith({ disabled: false });
    // b 还原后与当前值一致，无需再设置
    expect(b.setProps).toHaveBeenCalledTimes(0);
  });

  it('does nothing when the block stays enabled', () => {
    const a = createColumn();
    const map = new WeakMap<object, boolean>();

    syncColumnDisabled([a], false, map);

    expect(a.setProps).not.toHaveBeenCalled();
    expect(map.has(a)).toBe(false);
  });

  it('ignores empty column slots', () => {
    const map = new WeakMap<object, boolean>();
    expect(() => syncColumnDisabled([null, undefined], true, map)).not.toThrow();
  });
});

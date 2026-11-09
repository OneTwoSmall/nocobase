/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getNumericColumnIndexes,
  resolveCellFromEvent,
  SELECTED_CELL_CLASS,
  setupCellSelection,
  type SelectionStats,
} from '../tableDomEnhancer';

const columnMeta = {
  numericFields: new Set(['amount']),
  columnTitles: { amount: 'Amount' },
};

function buildTable() {
  document.body.innerHTML = `
    <div id="container">
      <table>
        <thead class="ant-table-thead">
          <tr><th>Amount</th><th>Note</th></tr>
        </thead>
        <tbody class="ant-table-tbody">
          <tr><td>10</td><td>a</td></tr>
          <tr><td>20</td><td>b</td></tr>
        </tbody>
      </table>
    </div>
  `;
  const container = document.getElementById('container') as HTMLElement;
  const rows = container.querySelectorAll('.ant-table-tbody tr');
  return {
    container,
    cell: (r: number, c: number) => rows[r].children[c] as HTMLElement,
  };
}

function stubElementFromPoint(result: Element | null) {
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    writable: true,
    value: vi.fn(() => result),
  });
}

describe('getNumericColumnIndexes', () => {
  it('should map header titles of numeric fields to column indexes', () => {
    const { container } = buildTable();
    expect([...getNumericColumnIndexes(container, columnMeta)]).toEqual([0]);
  });
});

describe('resolveCellFromEvent', () => {
  afterEach(() => {
    delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
  });

  it('should prefer the cell under the pointer over a stale event target', () => {
    const { container, cell } = buildTable();
    const staleTarget = cell(0, 0);
    const pointedCell = cell(1, 0);
    stubElementFromPoint(pointedCell);

    // Firefox 在拖拽过程中会把 mousemove 的 target 固定在按下时的单元格上
    const resolved = resolveCellFromEvent(
      { clientX: 5, clientY: 40, target: staleTarget.querySelector('td') ?? staleTarget },
      container,
    );

    expect(resolved).toBe(pointedCell);
  });

  it('should fall back to the event target when the pointed element is outside the container', () => {
    const { container, cell } = buildTable();
    const target = cell(0, 0);
    stubElementFromPoint(document.createElement('div'));

    expect(resolveCellFromEvent({ clientX: 5, clientY: 5, target }, container)).toBe(target);
  });

  it('should fall back to the event target when elementFromPoint is unavailable', () => {
    const { container, cell } = buildTable();
    const target = cell(0, 0);

    expect(resolveCellFromEvent({ clientX: 5, clientY: 5, target }, container)).toBe(target);
  });
});

describe('setupCellSelection', () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
    document.body.innerHTML = '';
  });

  it('should extend the selection when the pointer moves over another cell', () => {
    const { container, cell } = buildTable();
    const onChange = vi.fn<(stats: SelectionStats | null, pos: { x: number; y: number } | null) => void>();
    cleanup = setupCellSelection(container, columnMeta, onChange);

    const first = cell(0, 0);
    const second = cell(1, 0);
    first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 5, clientY: 5 }));
    stubElementFromPoint(second);
    first.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 5, clientY: 40 }));

    expect(first.classList.contains(SELECTED_CELL_CLASS)).toBe(true);
    expect(second.classList.contains(SELECTED_CELL_CLASS)).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith({ sum: 30, max: 20, min: 10, avg: 15, count: 2 }, null);
  });

  it('should not start a selection from a cell outside the table body', () => {
    const { container } = buildTable();
    const onChange = vi.fn<(stats: SelectionStats | null, pos: { x: number; y: number } | null) => void>();
    cleanup = setupCellSelection(container, columnMeta, onChange);

    const headerCell = container.querySelector('.ant-table-thead th') as HTMLElement;
    headerCell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 5, clientY: 5 }));
    stubElementFromPoint(null);
    headerCell.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 5, clientY: 40 }));

    expect(container.querySelectorAll(`.${SELECTED_CELL_CLASS}`)).toHaveLength(0);
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ count: 2 }), null);
  });

  it('should only suppress the native selection when the drag starts on a numeric column', () => {
    const { container, cell } = buildTable();
    const onChange = vi.fn();
    cleanup = setupCellSelection(container, columnMeta, onChange);

    const numericDown = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 5,
      clientY: 5,
    });
    cell(0, 0).dispatchEvent(numericDown);
    expect(numericDown.defaultPrevented).toBe(true);
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    const textDown = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 5,
      clientY: 5,
    });
    cell(0, 1).dispatchEvent(textDown);
    expect(textDown.defaultPrevented).toBe(false);
  });
});

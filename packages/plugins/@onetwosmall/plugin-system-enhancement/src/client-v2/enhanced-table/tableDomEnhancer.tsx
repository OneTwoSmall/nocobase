/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { css } from '@emotion/css';
import React, { useEffect, useState } from 'react';
import type { SummaryColumnMeta } from './summary';

export interface SelectionStats {
  sum: number;
  min: number;
  max: number;
  avg: number;
  count: number;
}

export const SELECTED_CELL_CLASS = 'enhanced-selected-cell';

export const ENHANCED_TABLE_WRAPPER_CSS = css`
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding-bottom: 7px;

  .enhanced-selected-cell {
    background-color: #ffff0033 !important;
    border: 1px solid #ffcc00 !important;
  }

  /* 汇总行未配置时 summary 渲染为空，隐藏 antd 生成的空 tfoot */
  .ant-table-summary:empty {
    display: none;
  }
`;

/**
 * 圈选时不应该抢走默认行为的元素：表单控件、链接、按钮、可编辑区域等。
 */
const INTERACTIVE_TARGET_SELECTOR = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  'label',
  '[contenteditable="true"]',
  '.ant-btn',
  '.ant-select',
  '.ant-picker',
  '.ant-input',
  '.ant-checkbox-wrapper',
  '.ant-radio-wrapper',
  '.ant-table-row-expand-icon',
].join(',');

/**
 * 取鼠标事件对应的单元格。
 * Firefox 在按住左键拖动时会把 mousemove 的 target 固定在按下时的元素上，导致圈选范围无法扩展，
 * 因此优先用坐标取指针下的元素，取不到（或落在容器外）时再回退到事件目标。
 */
export function resolveCellFromEvent(
  event: { clientX: number; clientY: number; target: EventTarget | null },
  container?: HTMLElement | null,
): HTMLElement | null {
  const fromTarget = (event.target as HTMLElement | null)?.closest?.('td') as HTMLElement | null | undefined;
  const pointed =
    typeof document !== 'undefined' && typeof document.elementFromPoint === 'function'
      ? document.elementFromPoint(event.clientX, event.clientY)
      : null;
  const fromPoint = (pointed as HTMLElement | null)?.closest?.('td') as HTMLElement | null | undefined;
  if (fromPoint && (!container || container.contains(fromPoint))) {
    return fromPoint;
  }
  return fromTarget ?? null;
}

/**
 * 表头文字与数值列标题一致时，认为该 DOM 列参与统计。
 */
export function getNumericColumnIndexes(container: HTMLElement, columnMeta: SummaryColumnMeta): Set<number> {
  const indexes = new Set<number>();
  const firstRow = container.querySelector('.ant-table-thead tr');
  if (!firstRow) {
    return indexes;
  }
  for (let i = 0; i < firstRow.children.length; i++) {
    const thText = (firstRow.children[i].textContent || '').trim();
    for (const field of columnMeta.numericFields) {
      const title = (columnMeta.columnTitles[field] || '').trim();
      if (title && thText === title) {
        indexes.add(i);
        break;
      }
    }
  }
  return indexes;
}

/**
 * 单元格圈选统计：返回清理函数。
 * 依赖标准 antd Table 的 td/tr/tbody DOM 结构。
 */
export function setupCellSelection(
  container: HTMLElement,
  columnMeta: SummaryColumnMeta,
  onChange: (stats: SelectionStats | null, pos: { x: number; y: number } | null) => void,
): () => void {
  const selectionState = {
    isSelecting: false,
    // 只有从数值列开始的圈选才拦截原生文本选择，其它列保持浏览器默认行为
    suppressNativeSelection: false,
    startCell: null as { r: number; c: number } | null,
    endCell: null as { r: number; c: number } | null,
  };

  const getCellCoords = (td: HTMLElement) => {
    const tr = td.parentElement;
    if (!tr) return null;
    const tbody = tr.parentElement;
    // 只认数据行：thead/tfoot（含汇总行）里的单元格不参与圈选
    if (!tbody || tbody.tagName !== 'TBODY') return null;
    return {
      r: Array.prototype.indexOf.call(tbody.children, tr),
      c: Array.prototype.indexOf.call(tr.children, td),
    };
  };

  const updateSelection = () => {
    const { startCell, endCell } = selectionState;
    if (!startCell || !endCell) return;
    const minR = Math.min(startCell.r, endCell.r);
    const maxR = Math.max(startCell.r, endCell.r);
    const minC = Math.min(startCell.c, endCell.c);
    const maxC = Math.max(startCell.c, endCell.c);

    const selectedNumbers: number[] = [];
    const numericColumnIndexes = getNumericColumnIndexes(container, columnMeta);

    container.querySelectorAll(`.${SELECTED_CELL_CLASS}`).forEach((el) => el.classList.remove(SELECTED_CELL_CLASS));

    container.querySelectorAll('.ant-table-tbody').forEach((tbody) => {
      for (let r = minR; r <= maxR; r++) {
        const tr = tbody.children[r];
        if (!tr) continue;
        for (let c = minC; c <= maxC; c++) {
          const td = tr.children[c] as HTMLElement | undefined;
          if (!td) continue;
          if (!numericColumnIndexes.has(c)) continue;

          td.classList.add(SELECTED_CELL_CLASS);
          const cleanStr = (td.textContent || '').replace(/[¥$€£￥,% ]/g, '').trim();
          const num = parseFloat(cleanStr);
          if (!isNaN(num)) {
            selectedNumbers.push(num);
          }
        }
      }
    });

    if (selectedNumbers.length > 1) {
      const sum = selectedNumbers.reduce((a, b) => a + b, 0);
      onChange(
        {
          sum,
          max: Math.max(...selectedNumbers),
          min: Math.min(...selectedNumbers),
          avg: sum / selectedNumbers.length,
          count: selectedNumbers.length,
        },
        null,
      );
    } else {
      onChange(null, null);
    }
  };

  const clearSelection = () => {
    container.querySelectorAll(`.${SELECTED_CELL_CLASS}`).forEach((el) => el.classList.remove(SELECTED_CELL_CLASS));
    onChange(null, null);
    selectionState.isSelecting = false;
    selectionState.suppressNativeSelection = false;
    selectionState.startCell = null;
    selectionState.endCell = null;
  };

  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const td = target.closest('td');

    if (!td) {
      clearSelection();
      return;
    }

    if (target.closest(INTERACTIVE_TARGET_SELECTOR)) return;

    const coords = getCellCoords(td);
    if (!coords) return;

    // 在数值列上拦截默认行为：Firefox 否则会把这次拖动当成文本选择，并把后续 mousemove 的
    // target 固定在按下时的单元格上，导致圈选范围无法扩展；其它列保持可正常选择文本。
    selectionState.suppressNativeSelection = getNumericColumnIndexes(container, columnMeta).has(coords.c);
    if (selectionState.suppressNativeSelection) {
      e.preventDefault();
    }

    selectionState.isSelecting = true;
    selectionState.startCell = coords;
    selectionState.endCell = coords;
    onChange(null, { x: e.clientX, y: e.clientY });
    updateSelection();
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!selectionState.isSelecting) return;
    onChange(null, { x: e.clientX, y: e.clientY });
    const td = resolveCellFromEvent(e, container);
    if (!td) return;
    const coords = getCellCoords(td);
    if (!coords) return;
    selectionState.endCell = coords;
    updateSelection();
  };

  // 从数值列开始的拖动禁止浏览器发起文本选择（Firefox 会因此中断 mousemove 序列）
  const onSelectStart = (e: Event) => {
    if (selectionState.isSelecting && selectionState.suppressNativeSelection) {
      e.preventDefault();
    }
  };

  const onMouseUp = () => {
    selectionState.isSelecting = false;
    selectionState.suppressNativeSelection = false;
  };

  container.addEventListener('mousedown', onMouseDown);
  container.addEventListener('mousemove', onMouseMove);
  container.addEventListener('selectstart', onSelectStart);
  window.addEventListener('mouseup', onMouseUp);

  return () => {
    container.removeEventListener('mousedown', onMouseDown);
    container.removeEventListener('mousemove', onMouseMove);
    container.removeEventListener('selectstart', onSelectStart);
    window.removeEventListener('mouseup', onMouseUp);
  };
}

/**
 * 圈选统计浮层（纯展示组件）。
 */
export function SelectionStatsPopup({
  stats,
  pos,
  t,
}: {
  stats: SelectionStats;
  pos: { x: number; y: number };
  t: (key: string, options?: any) => string;
}) {
  const fmt = (v: number) => (Number.isInteger(v) ? v : v.toFixed(2));
  return (
    <div
      style={{
        position: 'fixed',
        left: pos.x + 15,
        top: pos.y + 15,
        pointerEvents: 'none',
        zIndex: 9999,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        border: '1px solid #d9d9d9',
        borderRadius: '4px',
        padding: '8px 12px',
        fontSize: '13px',
        color: '#333',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: '4px', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>
        {t('Selection stats (contains {{num}} cells)', { num: stats.count })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
        <span>{t('Sum')}：</span>
        <strong>{fmt(stats.sum)}</strong>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
        <span>{t('Max')}：</span>
        <strong>{fmt(stats.max)}</strong>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
        <span>{t('Min')}：</span>
        <strong>{fmt(stats.min)}</strong>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
        <span>{t('Average')}：</span>
        <strong>{fmt(stats.avg)}</strong>
      </div>
    </div>
  );
}

export function useCellSelection(containerRef: React.RefObject<HTMLDivElement | null>, columnMeta: SummaryColumnMeta) {
  const [selectionStats, setSelectionStats] = useState<SelectionStats | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    return setupCellSelection(container, columnMeta, (stats, pos) => {
      if (pos) {
        setMousePos(pos);
      }
      if (stats) {
        setSelectionStats(stats);
      } else if (!pos) {
        setSelectionStats(null);
        setMousePos(null);
      }
    });
    // ref 对象在组件生命周期内稳定，无需作为依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnMeta]);

  return { selectionStats, mousePos };
}

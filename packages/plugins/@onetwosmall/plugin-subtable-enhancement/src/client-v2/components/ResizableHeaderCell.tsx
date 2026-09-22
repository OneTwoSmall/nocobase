/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { css } from '@emotion/css';
import React, { useCallback, useRef } from 'react';

export interface ResizableHeaderCellProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  /** 当前列宽（未拖拽过时为 undefined，走自适应）。 */
  width?: number;
  /** 列最小宽度：自适应布局下保证表头标题完整显示，同时作为拖拽下限。 */
  minWidth?: number;
  /** 拖拽结束时回调新列宽。 */
  onResize?: (width: number) => void;
  'data-col-key'?: string;
}

const MIN_COLUMN_WIDTH = 80;

const cellClassName = css`
  position: relative;
  user-select: none;

  /* 表头标题不允许省略：列宽不足时换行完整展示，而不是截断（仅作用于自定义表头单元格） */
  &&.ant-table-cell-ellipsis,
  &&.ant-table-cell-ellipsis .ant-table-column-title {
    overflow: visible;
    white-space: normal;
    text-overflow: clip;
    word-break: break-word;
  }

  .nb-subtable-picker-resize-handle {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 2;
    width: 8px;
    height: 100%;
    cursor: col-resize;
    touch-action: none;
    background: transparent;
  }

  &:hover .nb-subtable-picker-resize-handle::after {
    content: '';
    position: absolute;
    top: 20%;
    right: 3px;
    width: 2px;
    height: 60%;
    background: #1677ff;
    border-radius: 1px;
  }
`;

/**
 * 可拖拽调整列宽的表头单元格。列宽只在弹窗会话内维护（不持久化，刷新即失效）。
 * 未拖拽时 `width` 为 undefined，表格走自适应布局；首次拖拽后由弹窗冻结全部列宽。
 */
export function ResizableHeaderCell({ width, minWidth, onResize, children, ...rest }: ResizableHeaderCellProps) {
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const floor = Math.max(MIN_COLUMN_WIDTH, minWidth ?? 0);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLSpanElement>) => {
      if (!onResize) return;
      event.preventDefault();
      event.stopPropagation();

      const th = event.currentTarget.parentElement as HTMLElement | null;
      startXRef.current = event.clientX;
      startWidthRef.current = width ?? th?.getBoundingClientRect().width ?? floor;

      const handleMove = (moveEvent: PointerEvent) => {
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          const delta = moveEvent.clientX - startXRef.current;
          onResize(Math.max(floor, Math.round(startWidthRef.current + delta)));
        });
      };
      const handleUp = () => {
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        document.body.style.userSelect = '';
        document.removeEventListener('pointermove', handleMove);
        document.removeEventListener('pointerup', handleUp);
      };

      document.body.style.userSelect = 'none';
      document.addEventListener('pointermove', handleMove);
      document.addEventListener('pointerup', handleUp);
    },
    [floor, onResize, width],
  );

  return (
    <th
      {...rest}
      className={`${rest.className ?? ''} ${cellClassName}`.trim()}
      style={{ ...rest.style, minWidth: minWidth || undefined }}
    >
      {children}
      {onResize && (
        <span
          role="separator"
          aria-orientation="vertical"
          aria-label="resize column"
          className="nb-subtable-picker-resize-handle"
          onPointerDown={handlePointerDown}
        />
      )}
    </th>
  );
}

export default ResizableHeaderCell;

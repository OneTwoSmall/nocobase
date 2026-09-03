/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { CopyOutlined, DeleteOutlined, SearchOutlined, ZoomInOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Checkbox, Form, Popconfirm, Space, Table, Tag, Tooltip, message as antdMessage } from 'antd';
import { css } from '@emotion/css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useT } from '../locale';
import {
  appendRow,
  copyRowAt,
  getSubTableRowIdentity,
  normalizeSubTableRows,
  parsePasteText,
  applyPasteMatrix,
  removeRowAt,
  type PasteTarget,
} from '../utils/paste';
import { recalcFormulas } from '../utils/formula';
import {
  collectAssociationPasteTexts,
  collectBelongsToColumnIndexes,
  collectLookupPasteTexts,
  fetchAssociationRecordById,
  getAssociationColumnMeta,
  isBelongsToAssociationColumn,
  resolveAssociationRecordsByText,
  wrapAssociationLookupFill,
} from '../utils/association';
import {
  clearLookupFields,
  collectLookupRecordAppends,
  lookupRecord,
  resolveLookupRecordsByText,
} from '../utils/lookup';
import { createRow, type EnhancedColumnConfig, type EnhancedSubTableRow, type LookupConfig } from '../utils/types';
import { LookupPickerModal } from './LookupPickerModal';

type NamePath = Array<string | number>;

function isSamePathPrefix(prefix: NamePath, path: NamePath) {
  if (!prefix.length || prefix.length > path.length) return false;
  return prefix.every((segment, index) => segment === path[index]);
}

function isRelatedPath(a: NamePath, b: NamePath) {
  return isSamePathPrefix(a, b) || isSamePathPrefix(b, a);
}

function normalizeChangedPath(path: unknown): NamePath | null {
  const rawPath = Array.isArray(path) ? path : typeof path === 'string' ? [path] : null;
  if (!rawPath) return null;
  const normalized = rawPath
    .flatMap((segment) => {
      if (typeof segment === 'number') return [String(segment)];
      if (typeof segment !== 'string') return [];
      return segment.split('.');
    })
    .filter((part) => part.length > 0);
  return normalized.length ? normalized : null;
}

function shouldRefreshForChangedPaths(fieldPath: unknown, changedPaths: unknown) {
  const currentFieldPath = normalizeChangedPath(fieldPath);
  if (!currentFieldPath) return false;
  const paths = Array.isArray(changedPaths) ? changedPaths : [];
  return paths.some((path) => {
    const changedPath = normalizeChangedPath(path);
    return changedPath ? isRelatedPath(currentFieldPath, changedPath) : false;
  });
}

function stripGhostKey(row: EnhancedSubTableRow): EnhancedSubTableRow {
  if (!row || !('_ghost' in row)) return row;
  const { _ghost, ...rest } = row;
  return rest;
}

function initRows(value: any[] | undefined, seedBlank: boolean): EnhancedSubTableRow[] {
  const source = (Array.isArray(value) ? normalizeSubTableRows(value) : []).map(stripGhostKey);
  if (source.length) return source;
  // 新增（create）表单默认给一行空行便于直接录入；编辑表单按实际数据显示（空则空）
  return seedBlank ? [createRow()] : [];
}

/**
 * 构建用于选择弹窗/回填的有效查找配置。关联下拉列允许 targetCollection/targetField
 * 留空：此处按字段自身推导目标集合与标题字段，运行期始终按“标题字段→主键”匹配。
 */
function resolvePickerLookup(column: EnhancedColumnConfig | undefined): LookupConfig | null {
  if (!column?.lookup) return null;
  if (!isBelongsToAssociationColumn(column)) return column.lookup;
  const field = column.field;
  const titleField = column.titleField || field?.targetCollectionTitleFieldName;
  return {
    ...column.lookup,
    targetCollection: column.lookup.targetCollection || field?.target || '',
    targetField: column.lookup.targetField || titleField || '',
    searchFields: column.lookup.searchFields?.length ? column.lookup.searchFields : titleField ? [titleField] : [],
  };
}

export interface EnhancedSubTableFieldProps {
  model?: any;
  columns?: any[];
  components?: any;
  enhancedColumns?: EnhancedColumnConfig[];
  disabled?: boolean;
  allowAddNew?: boolean;
  allowSelectExistingRecord?: boolean;
  onSelectExitRecordClick?: (setCurrentPage: (page: number) => void, currentPageSize: number) => void;
  allowDisassociation?: boolean;
  pageSize?: number;
  allowCreate?: boolean;
  isConfigMode?: boolean;
  isCreateForm?: boolean;
  parentFieldIndex?: any;
  parentItem?: any;
  resetPage?: string;
  filterTargetKey?: string | string[];
  getCurrentValue?: () => any[];
  fieldPathArray?: any;
  formValuesChangeEmitter?: any;
  onResetFieldValue?: () => void;
  onChange?: (value: any[]) => void;
  allowBatchDelete?: boolean;
  allowCopyRow?: boolean;
  allowPaste?: boolean;
  actionsColumnWidth?: number;
  api?: any;
  dataSourceKey?: string;
}

export function EnhancedSubTableField(props: EnhancedSubTableFieldProps) {
  const t = useT();
  const {
    components,
    columns,
    enhancedColumns = [],
    disabled,
    allowAddNew,
    allowSelectExistingRecord,
    onSelectExitRecordClick,
    pageSize,
    allowCreate,
    isConfigMode,
    isCreateForm,
    parentFieldIndex,
    parentItem,
    resetPage,
    filterTargetKey = 'id',
    getCurrentValue,
    fieldPathArray,
    formValuesChangeEmitter,
    onResetFieldValue,
    onChange,
    allowBatchDelete = true,
    allowCopyRow = true,
    allowPaste = true,
    actionsColumnWidth = 80,
    api,
    dataSourceKey,
  } = props;

  // 优先使用上下文绑定的 message（跟随应用语言），回退到 antd 静态 message
  const ctxMessage = props.model?.context?.message;
  const notify = useMemo(
    () => ({
      success: (content: any) => (ctxMessage?.success ?? antdMessage.success)(content),
      warning: (content: any) => (ctxMessage?.warning ?? antdMessage.warning)(content),
      info: (content: any) => (ctxMessage?.info ?? antdMessage.info)(content),
      error: (content: any) => (ctxMessage?.error ?? antdMessage.error)(content),
    }),
    [ctxMessage],
  );

  // 新增表单默认为一行空行；仅当可编辑且允许新增时才补空行，编辑表单按实际数据显示
  const canAddRows = allowCreate !== false && allowAddNew !== false && !disabled;
  const seedBlank = !!isCreateForm && canAddRows;

  const [currentPage, setCurrentPage] = useState(1);
  const [currentPageSize, setCurrentPageSize] = useState(pageSize);
  const [rows, setRows] = useState<EnhancedSubTableRow[]>(() => initRows(getCurrentValue?.() ?? [], seedBlank));
  const [selectedRowKeys, setSelectedRowKeys] = useState<any[]>([]);
  const [pickerState, setPickerState] = useState<{ rowIndex: number; dataIndex: string } | null>(null);
  // 粘贴后 +1，用于重建单元格（下拉/日期等带本地展示状态的字段需要从新值重新挂载）
  const [pasteTick, setPasteTick] = useState(0);
  const [, forceRefresh] = useState(0);

  const rowsRef = useRef(rows);
  const pickerStateRef = useRef(pickerState);
  const lastWrittenRef = useRef('[]');
  const pendingLookupsRef = useRef<PasteTarget[]>([]);
  // 粘贴预解析结果：dataIndex → (文本 → 目标记录)；未命中的文本以 undefined 值占位，
  // 让 runLookupTasks 直接判定失败而无需再发请求
  const pendingLookupRecordsRef = useRef<Record<string, Map<string, any>>>({});
  // 关联下拉列（带 lookup 回填）原生选择 → 回填触发相关状态
  const enhancedColumnsRef = useRef(enhancedColumns);
  const assocPendingRef = useRef(false);
  const assocLastSigRef = useRef<Map<string, string>>(new Map());
  const assocPasteFilledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    enhancedColumnsRef.current = enhancedColumns;
  }, [enhancedColumns]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    pickerStateRef.current = pickerState;
  }, [pickerState]);

  useEffect(() => {
    setCurrentPageSize(pageSize);
  }, [pageSize]);

  useEffect(() => {
    resetPage && setCurrentPage(1);
  }, [resetPage]);

  // 写入表单值
  useEffect(() => {
    const projected = rows.map(stripGhostKey);
    const key = JSON.stringify(projected);
    if (key !== lastWrittenRef.current) {
      lastWrittenRef.current = key;
      onChange?.(projected);
    }
  }, [onChange, rows]);

  // 外部表单值变化 → 重新初始化行。子表格单元格由原生编辑器直接写入表单，
  // 本地 rows 可能滞后；凡表单值（含单元格提交）与我们最近一次写入不一致就重同步，
  // 避免 copy/add 等基于 rows 的操作把单元格刚改的数据覆盖回旧值。
  useEffect(() => {
    if (!formValuesChangeEmitter?.on || !formValuesChangeEmitter?.off) return;
    const listener = (payload: any) => {
      if (!shouldRefreshForChangedPaths(fieldPathArray, payload?.changedPaths)) return;

      // 关联下拉列（带 lookup 回填）的单元格值由原生下拉直接写入表单，
      // 当变更路径命中该列（叶子）时标记“需要回填”，由下方 effect 统一处理。
      const assocLookupIndexes = enhancedColumnsRef.current
        .filter((column) => isBelongsToAssociationColumn(column) && !!column.lookup)
        .map((column) => column.dataIndex);
      const basePath = (normalizeChangedPath(fieldPathArray) ?? []).map(String);
      const hitAssocLeaf = (Array.isArray(payload?.changedPaths) ? payload.changedPaths : []).some((path) => {
        const segments = normalizeChangedPath(path);
        if (!segments || segments.length !== basePath.length + 2) return false;
        if (!basePath.every((segment, index) => segments[index] === segment)) return false;
        return assocLookupIndexes.includes(String(segments[segments.length - 1]));
      });
      if (hitAssocLeaf) {
        assocPendingRef.current = true;
      }

      const latest = getCurrentValue?.();
      const latestArray = Array.isArray(latest) ? latest : [];
      if (JSON.stringify(latestArray) !== lastWrittenRef.current) {
        setRows(initRows(latestArray, seedBlank));
      } else {
        forceRefresh((v) => v + 1);
      }
    };
    formValuesChangeEmitter.on('formValuesChange', listener);
    return () => {
      formValuesChangeEmitter.off('formValuesChange', listener);
    };
  }, [fieldPathArray, formValuesChangeEmitter, getCurrentValue, seedBlank]);

  useEffect(() => {
    if (!formValuesChangeEmitter?.on || !formValuesChangeEmitter?.off || !onResetFieldValue) return;
    const listener = () => {
      onResetFieldValue();
      forceRefresh((v) => v + 1);
    };
    formValuesChangeEmitter.on('onFieldReset', listener);
    return () => {
      formValuesChangeEmitter.off('onFieldReset', listener);
    };
  }, [formValuesChangeEmitter, onResetFieldValue]);

  // 外部同步：加载/重置/规则赋值等一次性重同步
  useEffect(() => {
    const latest = getCurrentValue?.();
    const latestArray = Array.isArray(latest) ? latest : [];
    if (JSON.stringify(latestArray) !== lastWrittenRef.current) {
      setRows(initRows(latestArray, seedBlank));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 公式即时计算
  useEffect(() => {
    if (!enhancedColumns.some((column) => column.formula)) return;
    setRows((prev) => {
      const result = recalcFormulas(prev, enhancedColumns);
      return result.changed ? result.rows : prev;
    });
  }, [enhancedColumns, rows]);

  // 粘贴后批量查找验证
  useEffect(() => {
    if (!pendingLookupsRef.current.length) return;
    const tasks = pendingLookupsRef.current;
    pendingLookupsRef.current = [];
    runLookupTasks(tasks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const reseedIfEmpty = useCallback(
    (next: EnhancedSubTableRow[]): EnhancedSubTableRow[] => (next.length === 0 && seedBlank ? [createRow()] : next),
    [seedBlank],
  );

  const handleCellChange = useCallback((rowIdx: number, dataIndex: string, value: any) => {
    setRows((prev) => {
      const next = [...prev];
      const current = next[rowIdx];
      if (!current) return prev;
      next[rowIdx] = {
        ...current,
        [dataIndex]: value?.target?.value ?? value,
      };
      return next;
    });
    setSelectedRowKeys([]);
  }, []);

  const handleAdd = useCallback(() => {
    if (allowCreate === false) return;
    setRows((prev) => {
      const next = appendRow(prev);
      setCurrentPage(Math.max(1, Math.ceil(next.length / currentPageSize)));
      return next;
    });
    setSelectedRowKeys([]);
  }, [allowCreate, currentPageSize]);

  const handleDeleteRow = useCallback(
    (rowIdx: number) => {
      setRows((prev) => {
        const next = reseedIfEmpty(removeRowAt(prev, rowIdx));
        const lastPage = Math.max(1, Math.ceil(next.length / currentPageSize));
        setCurrentPage((page) => (page > lastPage ? lastPage : page));
        return next;
      });
      setSelectedRowKeys([]);
    },
    [currentPageSize, reseedIfEmpty],
  );

  const handleBatchDelete = useCallback(() => {
    if (!selectedRowKeys.length) return;
    const identitySet = new Set(selectedRowKeys);
    setRows((prev) => {
      const remaining = prev.filter((row, index) => {
        const identity = getSubTableRowIdentity(row, filterTargetKey) ?? `row:${index}`;
        return !identitySet.has(identity);
      });
      const next = reseedIfEmpty(remaining);
      const lastPage = Math.max(1, Math.ceil(next.length / currentPageSize));
      setCurrentPage((page) => (page > lastPage ? lastPage : page));
      return next;
    });
    setSelectedRowKeys([]);
    notify.success(t('Batch delete'));
  }, [currentPageSize, filterTargetKey, notify, reseedIfEmpty, selectedRowKeys, t]);

  const handleCopyRow = useCallback(
    (rowIdx: number) => {
      const source = rowsRef.current[rowIdx];
      if (!source) return;
      // 先失焦提交单元格内未写完的内容，再以表单里的最新提交值为快照复制，
      // 避免复制到旧值，也不会把源行单元格刚填的数据覆盖回旧值
      const activeElement = document.activeElement as HTMLElement | null;
      activeElement?.blur?.();
      setRows((prev) => {
        const live = getCurrentValue?.();
        const liveArray = Array.isArray(live) ? live : null;
        const sourceOverride = liveArray && rowIdx >= 0 && rowIdx < liveArray.length ? liveArray[rowIdx] : undefined;
        return copyRowAt(prev, rowIdx, { filterTargetKey, sourceOverride }) ?? prev;
      });
      setSelectedRowKeys([]);
      notify.success(t('Row copied'));
    },
    [filterTargetKey, getCurrentValue, notify, t],
  );

  // belongsTo 关联列 dataIndex 集合：查找回填落到这些列时需写成记录对象
  const belongsToIndexes = useMemo(() => collectBelongsToColumnIndexes(enhancedColumns), [enhancedColumns]);

  const runLookupTasks = useCallback(
    async (tasks: PasteTarget[]) => {
      if (!api || !tasks.length) return;
      let ok = 0;
      let fail = 0;
      for (const task of tasks) {
        const enhancedCol = enhancedColumns.find((column) => column.dataIndex === task.dataIndex);
        if (!enhancedCol?.lookup) continue;
        const lookup = enhancedCol.lookup;
        const row = rowsRef.current[task.rowIndex];
        const value = String(row?.[task.dataIndex] ?? '').trim();
        if (!value) continue;
        let record: any = null;
        const preResolved = pendingLookupRecordsRef.current[task.dataIndex];
        if (preResolved?.has(value)) {
          // 粘贴时已批量解析：命中返回记录，未命中以 undefined 占位直接判为失败
          record = preResolved.get(value) ?? null;
        } else {
          try {
            record = await lookupRecord(api, dataSourceKey, lookup, value);
          } catch {
            record = null;
          }
        }
        if (record) {
          setRows((prev) => {
            const next = [...prev];
            const current = next[task.rowIndex];
            if (!current) return prev;
            next[task.rowIndex] = wrapAssociationLookupFill(current, lookup, record, enhancedColumns, belongsToIndexes);
            return next;
          });
          ok += 1;
        } else {
          setRows((prev) => {
            const next = [...prev];
            const current = next[task.rowIndex];
            if (!current) return prev;
            next[task.rowIndex] = {
              ...current,
              [task.dataIndex]: '',
              ...clearLookupFields(current, lookup),
            };
            return next;
          });
          fail += 1;
        }
      }
      pendingLookupRecordsRef.current = {};
      if (tasks.length === 1 && ok) {
        notify.success(
          t('{{name}} validated', { name: String(rowsRef.current[tasks[0].rowIndex]?.[tasks[0].dataIndex] ?? '') }),
        );
      } else if (tasks.length === 1 && fail) {
        notify.warning(
          t('{{value}} not found, cleared', {
            value: String(rowsRef.current[tasks[0].rowIndex]?.[tasks[0].dataIndex] ?? ''),
          }),
        );
      } else if (tasks.length > 1) {
        notify.info(t('Lookup validated: {{ok}} passed, {{fail}} invalid', { ok, fail }));
      }
    },
    [api, belongsToIndexes, dataSourceKey, enhancedColumns, notify, t],
  );

  const handleCellPaste = useCallback(
    async (event: React.ClipboardEvent, startRowIdx: number, startColIdx: number) => {
      if (!allowPaste) return;
      const clipboardData = event.clipboardData || (event as any).originalEvent?.clipboardData;
      const text = clipboardData?.getData('text/plain');
      if (!text) return;
      const matrix = parsePasteText(text);
      if (!matrix.length) return;
      event.preventDefault();
      event.stopPropagation();

      // 关联（下拉）列：先按显示文本批量解析目标记录，再执行矩阵写入
      let assocRecords: Record<string, Map<string, any>> = {};
      try {
        const associationTasks = collectAssociationPasteTexts(matrix, startRowIdx, startColIdx, enhancedColumns);
        if (associationTasks.length && api) {
          const resolved: Array<{ dataIndex: string; recordMap: Map<string, any> }> = [];
          await Promise.all(
            associationTasks.map(async ({ columnIndex, texts }) => {
              const column = enhancedColumns[columnIndex];
              const meta = getAssociationColumnMeta(column, dataSourceKey);
              if (!meta) return;
              // 关联下拉列若配置了回填，一并把回填所需来源字段 append 查回
              const appends = column.lookup ? collectLookupRecordAppends(column.lookup) : [];
              const recordMap = await resolveAssociationRecordsByText(api, meta, texts, appends);
              resolved.push({ dataIndex: meta.dataIndex, recordMap });
            }),
          );
          assocRecords = Object.fromEntries(resolved.map((entry) => [entry.dataIndex, entry.recordMap]));
        }
      } catch {
        // 解析失败时保留原文并交由下方 issue 汇总提示
        assocRecords = {};
      }

      // 查找回填列：按列批量解析粘贴文本 → 目标记录，粘贴后不再逐格发请求。
      // 未命中的文本以 undefined 占位，runLookupTasks 直接判失败并保留原文供提示。
      try {
        const lookupTasks = collectLookupPasteTexts(matrix, startRowIdx, startColIdx, enhancedColumns);
        if (lookupTasks.length && api) {
          const resolved: Array<{ dataIndex: string; texts: string[]; recordMap: Map<string, any> }> = [];
          await Promise.all(
            lookupTasks.map(async ({ columnIndex, texts }) => {
              const column = enhancedColumns[columnIndex];
              if (!column?.lookup) return;
              const recordMap = await resolveLookupRecordsByText(api, dataSourceKey, column.lookup, texts);
              resolved.push({ dataIndex: column.dataIndex, texts, recordMap });
            }),
          );
          for (const { dataIndex, texts, recordMap } of resolved) {
            const mapWithMissing = new Map(recordMap);
            for (const text of texts) {
              const key = text.trim();
              if (key && !mapWithMissing.has(key)) {
                mapWithMissing.set(key, undefined);
              }
            }
            pendingLookupRecordsRef.current[dataIndex] = mapWithMissing;
          }
        }
      } catch {
        // 解析失败时回退到逐格校验路径
        pendingLookupRecordsRef.current = {};
      }

      const result = applyPasteMatrix(rowsRef.current, startRowIdx, startColIdx, matrix, enhancedColumns, assocRecords);
      if (result.lookupTargets.length) {
        pendingLookupsRef.current.push(...result.lookupTargets);
      }
      if (result.issues.length) {
        notify.warning(
          t('{{count}} cells could not be converted and were kept as text', { count: result.issues.length }),
        );
      }

      // 关联下拉列（belongsTo + lookup 回填）粘贴命中记录 → 单元格写入记录对象并同步回填映射列
      const assocFillTargets: Array<{ rowIndex: number; dataIndex: string; record: any }> = [];
      const assocFilledKeys = new Set<string>();
      for (let ri = 0; ri < matrix.length; ri++) {
        const rowIndex = startRowIdx + ri;
        const rowForKey = result.rows[rowIndex];
        if (!rowForKey) continue;
        for (let ci = 0; ci < matrix[ri].length; ci++) {
          const column = enhancedColumns[startColIdx + ci];
          if (!column || !column.lookup || !isBelongsToAssociationColumn(column)) continue;
          const text = matrix[ri][ci].trim();
          if (!text) continue;
          const record = assocRecords[column.dataIndex]?.get(text);
          if (!record) continue;
          assocFillTargets.push({ rowIndex, dataIndex: column.dataIndex, record });
          const rowKey = getSubTableRowIdentity(rowForKey, filterTargetKey) ?? `row:${rowIndex}`;
          assocFilledKeys.add(`${rowKey}:${column.dataIndex}`);
        }
      }
      let nextRows = reseedIfEmpty(result.rows);
      if (assocFillTargets.length) {
        nextRows = assocFillTargets.reduce((acc, target) => {
          const lookup = enhancedColumns.find((column) => column.dataIndex === target.dataIndex)?.lookup;
          if (!lookup) return acc;
          const row = acc[target.rowIndex];
          if (!row) return acc;
          const copy = [...acc];
          const filled = wrapAssociationLookupFill(row, lookup, target.record, enhancedColumns, belongsToIndexes);
          copy[target.rowIndex] = { ...filled, [target.dataIndex]: target.record };
          return copy;
        }, nextRows);
      }
      if (assocFilledKeys.size) {
        assocPasteFilledRef.current = new Set([...assocPasteFilledRef.current, ...assocFilledKeys]);
      }
      setRows(nextRows);
      // 重建单元格，让下拉/日期等带本地展示状态的字段立即从新值刷新
      setPasteTick((value) => value + 1);
      // 粘贴内容若落在当前页之后，自动跳到包含最后一行粘贴数据的页，便于查看新增行
      const pastedCount = result.rows.length;
      const lastPastedIndex = startRowIdx + result.rowCount - 1;
      const targetPage = Math.max(
        1,
        Math.ceil(Math.min(pastedCount, Math.max(0, lastPastedIndex) + 1) / currentPageSize),
      );
      setCurrentPage((page) => (page < targetPage ? targetPage : page));
      setSelectedRowKeys([]);
    },
    [
      allowPaste,
      api,
      belongsToIndexes,
      currentPageSize,
      dataSourceKey,
      enhancedColumns,
      filterTargetKey,
      notify,
      reseedIfEmpty,
      t,
    ],
  );

  const handleCellKeyDown = useCallback(
    (event: React.KeyboardEvent, rowIndex: number, enhancedCol: EnhancedColumnConfig) => {
      if (event.key !== 'Enter' || !enhancedCol.lookup) return;
      // 关联下拉列使用原生下拉选择，不参与“回车文本校验”
      if (isBelongsToAssociationColumn(enhancedCol)) return;
      event.preventDefault();
      runLookupTasks([{ rowIndex, dataIndex: enhancedCol.dataIndex }]);
    },
    [runLookupTasks],
  );

  const handleLookupPick = useCallback(
    (record: any) => {
      const state = pickerStateRef.current;
      if (!state) return;
      const { rowIndex, dataIndex } = state;
      const enhancedCol = enhancedColumns.find((column) => column.dataIndex === dataIndex);
      if (!enhancedCol?.lookup) {
        setPickerState(null);
        return;
      }
      const lookup = enhancedCol.lookup;
      setRows((prev) => {
        const next = [...prev];
        const current = next[rowIndex];
        if (!current) return prev;
        const filled = wrapAssociationLookupFill(current, lookup, record, enhancedColumns, belongsToIndexes);
        let row = filled;
        if (isBelongsToAssociationColumn(enhancedCol)) {
          // 关联下拉列：单元格写入目标记录对象（下拉框据此回显选中记录）
          row = { ...filled, [dataIndex]: record };
        } else {
          const targetValue = record?.[lookup.targetField];
          if (targetValue !== undefined && targetValue !== null) {
            row = { ...filled, [dataIndex]: targetValue };
          }
        }
        next[rowIndex] = row;
        return next;
      });
      setPickerState(null);
      setSelectedRowKeys([]);
    },
    [belongsToIndexes, enhancedColumns],
  );

  // 原生下拉直接选择关联记录 → 取回完整记录并自动回填映射列（选择即回填）
  useEffect(() => {
    if (!api || !assocPendingRef.current) return;
    assocPendingRef.current = false;
    const assocColumns = enhancedColumns.filter((column) => isBelongsToAssociationColumn(column) && !!column.lookup);
    if (!assocColumns.length || !rows.length) return;

    const pendingCells: Array<{
      rowIndex: number;
      column: EnhancedColumnConfig;
      meta: any;
      key: string;
      signature: string;
    }> = [];
    const signatureMap = assocLastSigRef.current;
    rows.forEach((row, rowIndex) => {
      if (!row) return;
      const rowKey = getSubTableRowIdentity(row, filterTargetKey) ?? `row:${rowIndex}`;
      for (const column of assocColumns) {
        const key = `${rowKey}:${column.dataIndex}`;
        const value = row[column.dataIndex];
        const meta = getAssociationColumnMeta(column, dataSourceKey);
        if (!value || typeof value !== 'object' || !meta?.idField || !meta?.collectionName) continue;
        const idValue = value[meta.idField];
        if (idValue == null) continue;
        const signature = String(idValue);
        if (assocPasteFilledRef.current.has(key)) {
          // 粘贴路径已同步处理并填充，避免重复请求
          assocPasteFilledRef.current.delete(key);
          continue;
        }
        if (signatureMap.get(key) === signature) continue;
        pendingCells.push({ rowIndex, column, meta, key, signature });
      }
    });
    if (!pendingCells.length) return;
    for (const cell of pendingCells) {
      signatureMap.set(cell.key, cell.signature);
    }

    let cancelled = false;
    (async () => {
      const updates: Array<{ rowIndex: number; column: EnhancedColumnConfig; record: any }> = [];
      for (const cell of pendingCells) {
        const lookup = cell.column.lookup;
        if (!lookup) continue;
        const recordValue = rows[cell.rowIndex]?.[cell.column.dataIndex];
        const idValue = recordValue?.[cell.meta.idField];
        const appends = collectLookupRecordAppends(lookup);
        const fullRecord = await fetchAssociationRecordById(api, cell.meta, idValue, appends);
        updates.push({ rowIndex: cell.rowIndex, column: cell.column, record: fullRecord || recordValue });
      }
      if (cancelled) return;
      setRows((prev) => {
        const next = [...prev];
        for (const update of updates) {
          const current = next[update.rowIndex];
          const lookup = update.column.lookup;
          if (!current || !lookup) continue;
          const filled = wrapAssociationLookupFill(current, lookup, update.record, enhancedColumns, belongsToIndexes);
          next[update.rowIndex] = { ...filled, [update.column.dataIndex]: update.record };
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [api, belongsToIndexes, dataSourceKey, enhancedColumns, filterTargetKey, rows]);

  const pagination = useMemo(
    () =>
      ({
        style: { position: 'absolute', right: '0px', bottom: '0px' },
        current: currentPage,
        pageSize: currentPageSize,
        total: rows.length,
        onChange: (page: number, size: number) => {
          setCurrentPage(page);
          setCurrentPageSize(size);
        },
        showSizeChanger: true,
        showTotal: () => t('Total {{count}} items', { count: rows.length }),
      }) as any,
    [currentPage, currentPageSize, rows, t],
  );

  const renderEnhancedCell = useCallback(
    (col: any, inner: any, pageRowIdx: number, text: any) => {
      const enhancedIndex = enhancedColumns.findIndex((column) => column.dataIndex === col.dataIndex);
      const enhancedCol = enhancedIndex >= 0 ? enhancedColumns[enhancedIndex] : undefined;
      if (enhancedCol?.formula) {
        return (
          <div
            style={{
              width: '100%',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              padding: '4px 8px',
            }}
            title={text == null ? '' : String(text)}
          >
            {text ?? ''}
          </div>
        );
      }
      if (!enhancedCol) {
        return inner;
      }
      const isLookup = !!enhancedCol.lookup && !disabled;
      return (
        <div
          style={{
            position: 'relative',
            paddingRight: isLookup ? 24 : undefined,
            backgroundColor: isLookup ? '#fffbe6' : undefined,
          }}
          onPaste={allowPaste ? (event) => handleCellPaste(event, pageRowIdx, enhancedIndex) : undefined}
          onKeyDown={
            isLookup && !isBelongsToAssociationColumn(enhancedCol)
              ? (event) => handleCellKeyDown(event, pageRowIdx, enhancedCol)
              : undefined
          }
        >
          {inner}
          {isLookup && (
            <SearchOutlined
              style={{
                position: 'absolute',
                right: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 12,
                color: '#1677ff',
                cursor: 'pointer',
                zIndex: 10,
              }}
              onClick={(event) => {
                event.stopPropagation();
                setPickerState({ rowIndex: pageRowIdx, dataIndex: enhancedCol.dataIndex });
              }}
            />
          )}
        </div>
      );
    },
    [allowPaste, disabled, enhancedColumns, handleCellKeyDown, handleCellPaste],
  );

  const pagedDataSource = useMemo(() => {
    if (!rows.length) return [];
    const start = (currentPage - 1) * currentPageSize;
    return rows.slice(start, start + currentPageSize);
  }, [currentPage, currentPageSize, rows]);

  const getRowSelectionKey = useCallback(
    (record: any, pageRowIdx: number) => getSubTableRowIdentity(record, filterTargetKey) ?? `row:${pageRowIdx}`,
    [filterTargetKey],
  );

  const selectionEnabled = allowBatchDelete && !disabled;

  const pageSelectableKeys = useMemo(
    () =>
      pagedDataSource.map((record, index) => getRowSelectionKey(record, (currentPage - 1) * currentPageSize + index)),
    [currentPage, currentPageSize, getRowSelectionKey, pagedDataSource],
  );

  const allSelectedOnPage =
    pageSelectableKeys.length > 0 && pageSelectableKeys.every((key) => selectedRowKeys.includes(key));
  const someSelectedOnPage = pageSelectableKeys.some((key) => selectedRowKeys.includes(key));

  const toggleRowSelection = useCallback((identity: string, checked: boolean) => {
    setSelectedRowKeys((prev) =>
      checked ? Array.from(new Set([...prev, identity])) : prev.filter((key) => key !== identity),
    );
  }, []);

  const togglePageSelect = useCallback(
    (checked: boolean) => {
      setSelectedRowKeys((prev) => {
        if (checked) {
          return Array.from(new Set([...prev, ...pageSelectableKeys]));
        }
        const keySet = new Set(pageSelectableKeys);
        return prev.filter((key) => !keySet.has(key));
      });
    },
    [pageSelectableKeys],
  );

  const editableColumns = useMemo(() => {
    const hasIndexColumn = (columns ?? []).some((col) => col.key === '__index__');
    const selectionHeader = (
      <Checkbox
        checked={allSelectedOnPage}
        indeterminate={someSelectedOnPage && !allSelectedOnPage}
        disabled={disabled}
        title={allSelectedOnPage ? t('Deselect all') : t('Select all')}
        onChange={(event) => togglePageSelect(event.target.checked)}
      />
    );

    const dataColumns = (columns ?? [])
      .map((col) => {
        if (!col.render) return null;
        // 序号列：展示序号，启用批量删除时首列并入选择框
        if (col.key === '__index__') {
          return {
            ...col,
            title: selectionEnabled ? selectionHeader : col.title,
            width: selectionEnabled ? 64 : col.width ?? 48,
            align: col.align ?? 'center',
            render: (text: any, record: any, rowIdx: number) => {
              const pageRowIdx = (currentPage - 1) * currentPageSize + rowIdx;
              const identity = getRowSelectionKey(record, pageRowIdx);
              return (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  {selectionEnabled && (
                    <Checkbox
                      checked={selectedRowKeys.includes(identity)}
                      disabled={disabled}
                      onChange={(event) => toggleRowSelection(identity, event.target.checked)}
                    />
                  )}
                  <span>{pageRowIdx + 1}</span>
                </div>
              );
            },
          };
        }
        return {
          ...col,
          render: (text: any, record: any, rowIdx: number) => {
            const pageRowIdx = (currentPage - 1) * currentPageSize + rowIdx;
            const rowIdentity = getSubTableRowIdentity(record, filterTargetKey) ?? `row:${pageRowIdx}`;
            const rowBindingKey = `${rowIdentity}:${pageRowIdx}:v${pasteTick}`;
            const columnKey = col.dataIndex ?? col.key ?? 'cell';
            const inner = col.render({
              record,
              rowIdx: pageRowIdx,
              id: `field-${String(columnKey)}-${rowBindingKey}`,
              value: text,
              parentFieldIndex,
              parentItem,
              onChange: (value: any) => {
                handleCellChange(pageRowIdx, col.dataIndex, value?.target?.value ?? value);
              },
              ['aria-describedby']: `field-${String(columnKey)}-${rowBindingKey}`,
            });
            return renderEnhancedCell(col, inner, pageRowIdx, text);
          },
        };
      })
      .concat([
        !disabled && {
          title: '',
          key: 'actions',
          width: actionsColumnWidth,
          align: 'center',
          fixed: 'right',
          render: (_: any, record: any, index: number) => {
            const pageRowIdx = (currentPage - 1) * currentPageSize + index;
            return (
              <Space size={2}>
                {allowCopyRow && (
                  <Tooltip title={t('Copy row')}>
                    <Button
                      type="link"
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => handleCopyRow(pageRowIdx)}
                    />
                  </Tooltip>
                )}
                <Popconfirm
                  title={t('Delete this row')}
                  onConfirm={() => handleDeleteRow(pageRowIdx)}
                  okText={t('OK')}
                  cancelText={t('Cancel')}
                >
                  <Tooltip title={t('Delete this row')}>
                    <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                  </Tooltip>
                </Popconfirm>
              </Space>
            );
          },
        },
      ])
      .filter(Boolean);

    // 未启用序号列时，仍提供独立的选择列
    if (selectionEnabled && !hasIndexColumn) {
      dataColumns.unshift({
        title: selectionHeader,
        key: '__selection__',
        width: 40,
        align: 'center',
        fixed: 'left',
        render: (_: any, record: any, index: number) => {
          const pageRowIdx = (currentPage - 1) * currentPageSize + index;
          const identity = getRowSelectionKey(record, pageRowIdx);
          return (
            <Checkbox
              checked={selectedRowKeys.includes(identity)}
              disabled={disabled}
              onChange={(event) => toggleRowSelection(identity, event.target.checked)}
            />
          );
        },
      });
    }
    return dataColumns;
  }, [
    actionsColumnWidth,
    allSelectedOnPage,
    allowCopyRow,
    columns,
    currentPage,
    currentPageSize,
    disabled,
    filterTargetKey,
    getRowSelectionKey,
    handleCellChange,
    handleCopyRow,
    handleDeleteRow,
    parentFieldIndex,
    parentItem,
    pasteTick,
    renderEnhancedCell,
    selectedRowKeys,
    selectionEnabled,
    someSelectedOnPage,
    t,
    togglePageSelect,
    toggleRowSelection,
  ]);

  return (
    <Form.Item>
      {allowPaste && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: '#999' }}>
            {t('Tip: batch delete | lookup column press Enter to validate | click magnifier to pick | Ctrl+V to paste')}
          </span>
        </div>
      )}
      <Table
        dataSource={pagedDataSource}
        columns={editableColumns}
        components={components}
        rowKey={(record) => getSubTableRowIdentity(record, filterTargetKey) ?? String(rowsRef.current.indexOf(record))}
        tableLayout="fixed"
        scroll={{ x: 'max-content' }}
        pagination={pagination}
        locale={{
          emptyText: (
            <span>
              {disabled ? t('No data') : allowAddNew && allowSelectExistingRecord ? t('Select record') : t('No data')}
            </span>
          ),
        }}
        className={css`
          .ant-table-cell-ellipsis.ant-table-cell-fix-right-first .ant-table-cell-content {
            display: inline;
          }
          .ant-table-footer {
            padding: 0;
            button {
              margin-top: 4px !important;
              margin-bottom: 4px;
            }
          }
        `}
        footer={() => (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-start',
              alignItems: 'center',
              minHeight: '36px',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <Space size={4} wrap>
              {allowAddNew && (allowCreate || isConfigMode) && (
                <Button type="link" onClick={handleAdd} disabled={disabled}>
                  <PlusOutlined />
                  {t('Add new')}
                </Button>
              )}
              {allowSelectExistingRecord && (
                <Button
                  type="link"
                  onClick={() => onSelectExitRecordClick?.(setCurrentPage, currentPageSize)}
                  disabled={disabled}
                >
                  <ZoomInOutlined /> {t('Select record')}
                </Button>
              )}
              {allowBatchDelete && selectedRowKeys.length > 0 && (
                <>
                  <Tag color="blue">{t('Selected {{count}} rows', { count: selectedRowKeys.length })}</Tag>
                  <Popconfirm
                    title={t('Delete selected rows')}
                    description={t('Are you sure to delete the selected {{count}} rows?', {
                      count: selectedRowKeys.length,
                    })}
                    onConfirm={handleBatchDelete}
                    okText={t('OK')}
                    cancelText={t('Cancel')}
                    okButtonProps={{ danger: true }}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />}>
                      {t('Batch delete')}
                    </Button>
                  </Popconfirm>
                </>
              )}
            </Space>
          </div>
        )}
      />
      <LookupPickerModal
        open={!!pickerState}
        onClose={() => setPickerState(null)}
        config={
          pickerState
            ? resolvePickerLookup(enhancedColumns.find((column) => column.dataIndex === pickerState.dataIndex))
            : null
        }
        dataSourceKey={dataSourceKey}
        api={api}
        onSelect={handleLookupPick}
      />
    </Form.Item>
  );
}

export default EnhancedSubTableField;

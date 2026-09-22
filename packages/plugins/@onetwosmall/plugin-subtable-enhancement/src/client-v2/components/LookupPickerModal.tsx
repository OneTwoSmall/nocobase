/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { SearchOutlined } from '@ant-design/icons';
import { Button, Input, Modal, Spin, Table } from 'antd';
import { useFlowEngine } from '@nocobase/flow-engine';
import { get } from 'lodash';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useT } from '../locale';
import { getFieldTitleMap } from '../utils/fieldMeta';
import { collectLookupRecordAppends, requestList } from '../utils/lookup';
import { formatPickerCellValue, estimateTextWidth, resolvePickerColumn } from '../utils/pickerColumns';
import type { LookupConfig } from '../utils/types';
import { ResizableHeaderCell, type ResizableHeaderCellProps } from './ResizableHeaderCell';

export interface LookupPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (record: any) => void;
  config?: LookupConfig | null;
  dataSourceKey?: string;
  api?: any;
  fieldTitles?: Record<string, string>;
}

/** 自适应布局下的默认列宽兜底（仅在冻结列宽后使用）。 */
const DEFAULT_COLUMN_WIDTH = 160;

export function LookupPickerModal({
  open,
  onClose,
  onSelect,
  config,
  dataSourceKey,
  api,
  fieldTitles,
}: LookupPickerModalProps) {
  const t = useT();
  const flowEngine = useFlowEngine();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [keyword, setKeyword] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  // 列宽仅在本次弹窗会话内维护：默认自适应，首次拖拽后冻结为固定列宽；关闭/刷新即失效。
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const tableWrapRef = useRef<HTMLDivElement>(null);

  const targetCollection = useMemo(() => {
    if (!dataSourceKey || !config?.targetCollection) return null;
    const dataSource = flowEngine?.context?.dataSourceManager?.getDataSource?.(dataSourceKey);
    return dataSource?.getCollection?.(config.targetCollection) ?? null;
  }, [config?.targetCollection, dataSourceKey, flowEngine]);

  // 数据源设置的“字段显示名称”：默认从目标集合元数据解析，外部传入的 fieldTitles 优先
  const resolvedTitles = useMemo(() => getFieldTitleMap(targetCollection), [targetCollection]);

  const load = useCallback(
    async (page = 1, search = '') => {
      if (!config?.targetCollection || !api) {
        return;
      }
      setLoading(true);
      try {
        const searchFields = config.searchFields?.length ? config.searchFields : [config.targetField];
        const filter = search.trim()
          ? { $or: searchFields.filter(Boolean).map((field) => ({ [field]: { $includes: search.trim() } })) }
          : undefined;
        const appends = collectLookupRecordAppends(config);
        const { items, meta } = await requestList(api, dataSourceKey, config.targetCollection, {
          page,
          pageSize: 10,
          ...(appends.length ? { appends } : {}),
          ...(filter ? { filter: JSON.stringify(filter) } : {}),
        });
        setData(items);
        setPagination({
          current: meta.page || page,
          pageSize: meta.pageSize || 10,
          total: meta.count || items.length,
        });
      } catch {
        setData([]);
      } finally {
        setLoading(false);
      }
    },
    [api, config, dataSourceKey],
  );

  useEffect(() => {
    if (open) {
      setKeyword('');
      load(1, '');
    }
  }, [open, load]);

  // 关闭时重置列宽，保证每次打开都是自适应布局
  useEffect(() => {
    if (!open) {
      setColumnWidths({});
    }
  }, [open]);

  const fieldPaths = useMemo(() => {
    const configured = (config?.displayFields ?? []).filter((name): name is string => !!name);
    const fallback = [config?.targetField, ...(config?.mappings || []).map((mapping) => mapping.sourceField)];
    const source = configured.length ? configured : fallback;
    return source.filter((name, index, list): name is string => !!name && list.indexOf(name) === index);
  }, [config]);

  const captureHeaderWidths = useCallback((): Record<string, number> => {
    const result: Record<string, number> = {};
    const headers = tableWrapRef.current?.querySelectorAll('thead th[data-col-key]');
    headers?.forEach((th) => {
      const key = th.getAttribute('data-col-key');
      if (key) {
        result[key] = Math.round((th as HTMLElement).getBoundingClientRect().width);
      }
    });
    return result;
  }, []);

  const handleColumnResize = useCallback(
    (path: string, width: number) => {
      setColumnWidths((prev) => {
        // 首次拖拽：先把当前自适应宽度整体冻结，再覆盖被拖拽列，避免其它列重排
        const base = Object.keys(prev).length ? prev : captureHeaderWidths();
        return { ...base, [path]: width };
      });
    },
    [captureHeaderWidths],
  );

  const frozen = Object.keys(columnWidths).length > 0;

  // 自适应列宽需同时容纳表头标题：按标题文本估算最小宽度（内容由浏览器自适应撑开）
  const columnMeta = useMemo(
    () =>
      fieldPaths.map((path) => {
        const resolved = resolvePickerColumn(targetCollection, path);
        const title = fieldTitles?.[path] || resolvedTitles[path] || resolved.title;
        return { path, resolved, title, minWidth: Math.ceil(estimateTextWidth(title)) + 28 };
      }),
    [fieldPaths, fieldTitles, resolvedTitles, targetCollection],
  );

  const columns = useMemo(
    () =>
      columnMeta.map(({ path, resolved, title, minWidth }) => ({
        key: path,
        dataIndex: path,
        title,
        // 自适应布局下由 rc-table 写入 <col style="min-width">，保证表头标题完整显示
        minWidth,
        width: frozen ? Math.max(columnWidths[path] ?? DEFAULT_COLUMN_WIDTH, minWidth) : undefined,
        ellipsis: true,
        onHeaderCell: (): ResizableHeaderCellProps => ({
          width: columnWidths[path],
          minWidth,
          'data-col-key': path,
          onResize: (width: number) => handleColumnResize(path, width),
        }),
        // 关联字段已解析为标题字段路径；rc-table 不解析点路径，这里用 get 取值
        render: (_value: any, record: any) => formatPickerCellValue(get(record, resolved.displayPath)),
      })),
    [columnMeta, columnWidths, frozen, handleColumnResize],
  );

  const totalWidth = useMemo(
    () =>
      columnMeta.reduce(
        (sum, { path, minWidth }) => sum + Math.max(columnWidths[path] ?? DEFAULT_COLUMN_WIDTH, minWidth),
        0,
      ),
    [columnMeta, columnWidths],
  );

  const rowKey = useMemo(() => {
    const key = targetCollection?.filterTargetKey;
    if (Array.isArray(key) && key.length) {
      return (record: any) => key.map((field) => record?.[field]).join('-');
    }
    return typeof key === 'string' && key ? key : 'id';
  }, [targetCollection]);

  return (
    <Modal title={t('Select record')} open={open} onCancel={onClose} width={800} footer={null} destroyOnClose>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
        <Input
          placeholder={t('Search')}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onPressEnter={() => load(1, keyword)}
          style={{ width: 260 }}
          prefix={<SearchOutlined />}
          allowClear
        />
        <Button type="primary" size="small" onClick={() => load(1, keyword)}>
          {t('Search')}
        </Button>
      </div>
      <Spin spinning={loading}>
        <div ref={tableWrapRef}>
          <Table
            columns={columns}
            dataSource={data}
            rowKey={rowKey}
            size="small"
            bordered
            tableLayout={frozen ? 'fixed' : 'auto'}
            components={{ header: { cell: ResizableHeaderCell } }}
            pagination={{
              ...pagination,
              showTotal: (total) => t('Total {{count}} items', { count: total }),
              showSizeChanger: false,
              onChange: (page) => load(page, keyword),
            }}
            onRow={(record) => ({
              onClick: () => {
                onSelect(record);
                onClose();
              },
              style: { cursor: 'pointer' },
            })}
            scroll={{ x: frozen ? totalWidth : 'max-content', y: 350 }}
            locale={{ emptyText: t('No data') }}
          />
        </div>
      </Spin>
    </Modal>
  );
}

export default LookupPickerModal;

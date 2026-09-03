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
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useT } from '../locale';
import { getFieldTitleMap } from '../utils/fieldMeta';
import { requestList } from '../utils/lookup';
import type { LookupConfig } from '../utils/types';

export interface LookupPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (record: any) => void;
  config?: LookupConfig | null;
  dataSourceKey?: string;
  api?: any;
  fieldTitles?: Record<string, string>;
}

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

  // 数据源设置的“字段显示名称”：默认从目标集合元数据解析，外部传入的 fieldTitles 优先
  const resolvedTitles = useMemo(() => {
    if (!dataSourceKey || !config?.targetCollection) return {};
    const dataSource = flowEngine?.context?.dataSourceManager?.getDataSource?.(dataSourceKey);
    return getFieldTitleMap(dataSource?.getCollection?.(config.targetCollection));
  }, [config?.targetCollection, dataSourceKey, flowEngine]);

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
        const { items, meta } = await requestList(api, dataSourceKey, config.targetCollection, {
          page,
          pageSize: 10,
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

  const columns = useMemo(() => {
    const fieldNames = [config?.targetField, ...(config?.mappings || []).map((mapping) => mapping.sourceField)].filter(
      (name, index, list) => !!name && list.indexOf(name) === index,
    );
    return fieldNames.map((name) => ({
      title: fieldTitles?.[name] || resolvedTitles[name] || name,
      dataIndex: name,
      width: 160,
      ellipsis: true,
      render: (value: any) => (value == null || value === '' ? '-' : String(value)),
    }));
  }, [config, fieldTitles, resolvedTitles]);

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
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          size="small"
          bordered
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
          scroll={{ y: 350 }}
          locale={{ emptyText: t('No data') }}
        />
      </Spin>
    </Modal>
  );
}

export default LookupPickerModal;

/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { CopyOutlined } from '@ant-design/icons';
import { FlowSettingsButton, observer } from '@nocobase/flow-engine';
import { Popover, Switch, Typography } from 'antd';
import React, { useEffect, useMemo, useState } from 'react';

import { useT } from '../locale';
import { getColumnFieldName } from '../utils/columnIdentity';
import { EnhancedSubTableColumnModel } from '../models/EnhancedSubTableColumnModel';

export interface CopyFieldsButtonProps {
  model?: any;
}

/**
 * 操作列表头上的「复制」按钮：弹出字段开关列表，配置复制行时保留哪些字段。
 * - copyFields 为 undefined → 全部复制（全部开关打开）
 * - copyFields 为显式数组 → 只复制列出的字段（空数组表示都不复制）
 */
export const CopyFieldsButton = observer(({ model }: CopyFieldsButtonProps) => {
  const t = useT();
  const [items, setItems] = useState<Array<{ key: string; label: string }>>([]);

  useEffect(() => {
    if (!model) return;
    try {
      const labelByKey = new Map<string, string>();
      const children = (EnhancedSubTableColumnModel.defineChildren(model.context as any) as any[]) || [];
      children.forEach((child) => labelByKey.set(child.key, child.label));
      const visibleNames = (model.mapSubModels?.('columns', (column: any) => getColumnFieldName(column)) ?? []).filter(
        (name: unknown): name is string => typeof name === 'string' && !!name,
      );
      const unique = Array.from(new Set(visibleNames));
      setItems(unique.map((key) => ({ key, label: labelByKey.get(key) ?? key })));
    } catch {
      setItems([]);
    }
  }, [model]);

  const copyFields = model?.props?.copyFields as string[] | undefined;
  const selectedSet = useMemo(
    () => new Set(copyFields === undefined ? items.map((item) => item.key) : copyFields),
    [items, copyFields],
  );
  const allChecked = items.length > 0 && items.every((item) => selectedSet.has(item.key));

  const commit = (keys: string[]) => {
    Promise.resolve(model?.setCopyFields?.(keys)).catch(() => undefined);
  };

  const toggle = (key: string, checked: boolean) => {
    const next = new Set(selectedSet);
    if (checked) {
      next.add(key);
    } else {
      next.delete(key);
    }
    commit(items.map((item) => item.key).filter((itemKey) => next.has(itemKey)));
  };

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 160 }}>
      {items.length === 0 ? (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('No data')}
        </Typography.Text>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16,
              padding: '4px 0',
              borderBottom: '1px solid #f0f0f0',
              marginBottom: 4,
            }}
          >
            <span>{t('Select all')}</span>
            <Switch
              size="small"
              checked={allChecked}
              onChange={(checked) => commit(checked ? items.map((i) => i.key) : [])}
            />
          </div>
          {items.map((item) => (
            <div
              key={item.key}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16,
                padding: '2px 0',
              }}
            >
              <span
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}
                title={item.key}
              >
                {item.label}
              </span>
              <Switch
                size="small"
                checked={selectedSet.has(item.key)}
                onChange={(checked) => toggle(item.key, checked)}
              />
            </div>
          ))}
        </>
      )}
    </div>
  );

  return (
    <Popover content={content} trigger="click" placement="bottomRight">
      <FlowSettingsButton icon={<CopyOutlined />}>{t('Copy')}</FlowSettingsButton>
    </Popover>
  );
});

export default CopyFieldsButton;

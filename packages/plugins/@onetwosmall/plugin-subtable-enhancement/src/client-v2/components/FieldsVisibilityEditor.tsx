/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Switch, Typography } from 'antd';
import { useFlowContext } from '@nocobase/flow-engine';
import React, { useEffect, useMemo, useState } from 'react';

import { useT } from '../locale';
import { EnhancedSubTableColumnModel } from '../models/EnhancedSubTableColumnModel';

export interface FieldsVisibilityEditorProps {
  value?: string[];
  onChange?: (value: string[]) => void;
}

export function FieldsVisibilityEditor({ value = [], onChange }: FieldsVisibilityEditorProps) {
  const t = useT();
  const flowContext = useFlowContext();
  const model = flowContext?.model;
  const [items, setItems] = useState<Array<{ key: string; label: string }>>([]);

  useEffect(() => {
    if (!model) return;
    try {
      const list = (EnhancedSubTableColumnModel.defineChildren(model.context as any) as any[]) || [];
      setItems(list.map((item) => ({ key: item.key, label: item.label })));
    } catch {
      setItems([]);
    }
  }, [model]);

  const checkedSet = useMemo(() => new Set(value || []), [value]);

  const toggle = (key: string, checked: boolean) => {
    const current = value || [];
    const next = checked ? Array.from(new Set([...current, key])) : current.filter((fieldPath) => fieldPath !== key);
    onChange?.(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {items.length === 0 && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('No data')}
        </Typography.Text>
      )}
      {items.map((item) => (
        <div
          key={item.key}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '4px 0',
          }}
        >
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 13,
              flex: 1,
            }}
            title={item.key}
          >
            {item.label}
          </span>
          <Switch size="small" checked={checkedSet.has(item.key)} onChange={(checked) => toggle(item.key, checked)} />
        </div>
      ))}
    </div>
  );
}

export default FieldsVisibilityEditor;

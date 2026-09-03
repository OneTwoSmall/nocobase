/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Input, Select, Space, Typography } from 'antd';
import React, { useCallback, useRef } from 'react';

import { useT } from '../locale';
import { insertFormulaToken } from '../utils/formula';

export interface FormulaFieldOption {
  label: string;
  value: string;
}

export interface FormulaEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  /** 可选数字字段，以数据源设置的“字段显示名称”作为选项标题。 */
  options?: FormulaFieldOption[];
  disabled?: boolean;
}

export function FormulaEditor({ value = '', onChange, options = [], disabled }: FormulaEditorProps) {
  const t = useT();
  const cursorRef = useRef<number>(value.length);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange?.(event.target.value);
    },
    [onChange],
  );

  const handleCursor = useCallback(
    (event: any) => {
      cursorRef.current = event?.target?.selectionStart ?? value.length;
    },
    [value.length],
  );

  const handleSelect = useCallback(
    (fieldName: string) => {
      const next = insertFormulaToken(value, fieldName, cursorRef.current);
      onChange?.(next);
      cursorRef.current = Math.min(next.length, cursorRef.current + `{{${fieldName}}}`.length);
    },
    [onChange, value],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Input.TextArea
        value={value}
        onChange={handleChange}
        onSelect={handleCursor}
        onClick={handleCursor}
        onKeyUp={handleCursor}
        autoSize={{ minRows: 1, maxRows: 4 }}
        disabled={disabled}
      />
      <Space size={4}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('Insert field')}
        </Typography.Text>
        <Select
          size="small"
          style={{ minWidth: 220 }}
          value={undefined}
          placeholder={t('Select a numeric field to insert its reference')}
          options={options}
          onSelect={handleSelect}
          disabled={disabled || !options.length}
          showSearch
          optionFilterProp="label"
        />
      </Space>
    </div>
  );
}

export default FormulaEditor;

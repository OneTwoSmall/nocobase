/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { SettingOutlined } from '@ant-design/icons';
import { FlowSettingsButton, observer } from '@nocobase/flow-engine';
import { CustomWidth } from '@nocobase/client-v2';
import { Divider, Popover, Select } from 'antd';
import React, { useState } from 'react';

import { useT } from '../locale';

const WIDTH_OPTIONS = [60, 70, 80, 90, 100, 110, 120, 140, 160, 180, 200].map((value) => ({ label: value, value }));

const SettingsRow = ({ title, children }: { title: React.ReactNode; children: React.ReactNode }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '4px 0' }}>
    <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{title}</span>
    {children}
  </div>
);

export interface ActionsColumnSettingsProps {
  model?: any;
}

/**
 * 操作列表头的配置按钮（齿轮）：仿数据列设置行，内含「列宽」「固定（左/右）」两项。
 */
export const ActionsColumnSettings = observer(({ model }: ActionsColumnSettingsProps) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [widthOpen, setWidthOpen] = useState(false);

  const width = model?.props?.actionsColumnWidth ?? 80;
  const fixed = model?.props?.actionsColumnFixed ?? 'right';
  const isPreset = WIDTH_OPTIONS.some((option) => option.value === width);

  const applyWidth = (value: number | null | undefined) => {
    Promise.resolve(model?.setActionsColumnWidth?.(value)).catch(() => undefined);
    setWidthOpen(false);
  };

  const applyFixed = (value: 'left' | 'right') => {
    Promise.resolve(model?.setActionsColumnFixed?.(value)).catch(() => undefined);
  };

  const content = (
    <div style={{ minWidth: 240, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <SettingsRow title={t('Column width')}>
        <Select
          size="small"
          variant="borderless"
          popupMatchSelectWidth={false}
          style={{ textAlign: 'right', minWidth: 100 }}
          value={width}
          options={WIDTH_OPTIONS}
          open={widthOpen}
          onDropdownVisibleChange={setWidthOpen}
          onChange={applyWidth}
          dropdownRender={(menu) => (
            <>
              {menu}
              <Divider style={{ margin: '4px 0' }} />
              <CustomWidth
                setOpen={setWidthOpen}
                handleChange={applyWidth}
                t={t}
                defaultValue={isPreset ? null : width}
              />
            </>
          )}
        />
      </SettingsRow>
      <SettingsRow title={t('Fixed')}>
        <Select
          size="small"
          variant="borderless"
          popupMatchSelectWidth={false}
          style={{ textAlign: 'right', minWidth: 100 }}
          value={fixed}
          options={[
            { label: t('Left fixed'), value: 'left' },
            { label: t('Right fixed'), value: 'right' },
          ]}
          onChange={applyFixed}
        />
      </SettingsRow>
    </div>
  );

  return (
    <Popover content={content} trigger="click" placement="bottomRight" open={open} onOpenChange={setOpen}>
      <FlowSettingsButton icon={<SettingOutlined />} />
    </Popover>
  );
});

export default ActionsColumnSettings;

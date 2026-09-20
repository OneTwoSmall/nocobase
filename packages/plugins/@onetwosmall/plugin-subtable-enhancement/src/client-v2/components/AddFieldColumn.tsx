/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { SettingOutlined } from '@ant-design/icons';
import { AddSubModelButton, FlowSettingsButton } from '@nocobase/flow-engine';
import React from 'react';

import { PLUGIN_NAMESPACE } from '../locale';

/**
 * 操作列表头上的「字段」按钮：下拉列出目标集合字段，开关实时增删列。
 */
export const AddFieldColumn = ({ model }: { model: any }) => {
  return (
    <AddSubModelButton
      model={model}
      subModelKey={'columns'}
      subModelBaseClasses={['EnhancedSubTableColumnModel']}
      keepDropdownOpen
    >
      <FlowSettingsButton icon={<SettingOutlined />}>
        {model.translate('Fields', { ns: [PLUGIN_NAMESPACE, 'client'] })}
      </FlowSettingsButton>
    </AddSubModelButton>
  );
};

export default AddFieldColumn;

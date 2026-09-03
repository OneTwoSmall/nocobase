/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';
import enUS from '../../locale/en-US.json';
import zhCN from '../../locale/zh-CN.json';
import { enUS as enUSDict, zhCN as zhCNDict } from '../localeResources';

describe('plugin locale resources', () => {
  it('keeps zh-CN and en-US key sets in sync', () => {
    const zhKeys = Object.keys(zhCN).sort();
    const enKeys = Object.keys(enUS).sort();
    expect(zhKeys).toEqual(enKeys);
  });

  it('keeps the client fallback dictionaries in sync with the locale JSON files', () => {
    expect(zhCNDict).toEqual(zhCN);
    expect(enUSDict).toEqual(enUS);
  });

  it('covers the essential plugin strings in zh-CN', () => {
    for (const key of [
      'Enhanced sub-table',
      'Displayed fields',
      'Tip: batch delete | lookup column press Enter to validate | click magnifier to pick | Ctrl+V to paste',
    ]) {
      expect(zhCN[key as keyof typeof zhCN]).toBeTruthy();
      expect(enUS[key as keyof typeof enUS]).toBeTruthy();
    }
  });

  it('translates the essential strings to Chinese', () => {
    expect((zhCN as any)['Displayed fields']).toBe('显示字段');
    expect((zhCN as any)['Enhanced sub-table']).toBe('增强子表格');
  });
});

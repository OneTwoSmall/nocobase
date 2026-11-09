/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';
import pkg from '../../../package.json';
import { PLUGIN_NAME } from '../../common/pluginMeta';

describe('PLUGIN_NAME', () => {
  it('should stay in sync with the package name', () => {
    expect(PLUGIN_NAME).toBe(pkg.name);
  });
});

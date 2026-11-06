/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { tExpr as _tExpr, useFlowEngine } from '@nocobase/flow-engine';
import { namespace } from '../constants';

// Locale resources under `@onetwosmall/plugin-seeyon-auth` are auto-loaded by the v2 buildin `LocalePlugin.afterAdd`.
export function useT() {
  const engine = useFlowEngine();
  return (key: string, options?: Record<string, unknown>) =>
    engine.context.t(key, { ns: [namespace, 'client'], nsMode: 'fallback', ...options });
}

export function tExpr(key: string) {
  return _tExpr(key, { ns: [namespace, 'client'], nsMode: 'fallback' });
}

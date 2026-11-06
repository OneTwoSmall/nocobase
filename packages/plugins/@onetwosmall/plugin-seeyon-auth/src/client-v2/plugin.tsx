/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/client-v2';
import PluginAuthClientV2 from '@nocobase/plugin-auth/client-v2';
import { authType } from '../constants';

/**
 * The browser always lands on the SPA shell first — NocoBase serves the client `index.html` for HTML paths before
 * server middlewares run — so the callback page has to exist on the client side and exchange the ticket through the
 * `seeyonAuth:callback` API.
 */
export class PluginSeeyonAuthClientV2 extends Plugin {
  async load() {
    const auth = this.app.pm.get(PluginAuthClientV2);
    auth.registerType(authType, {
      adminSettingsFormLoader: () => import('./forms/SeeyonAdminSettings'),
    });

    this.router.add('seeyon-auth.callback', {
      path: '/seeyon-auth/callback/*',
      componentLoader: () => import('./SeeyonCallbackPage'),
      skipAuthCheck: true,
    });
  }
}

export default PluginSeeyonAuthClientV2;

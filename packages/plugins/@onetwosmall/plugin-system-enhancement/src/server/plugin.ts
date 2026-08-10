/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/server';
import { isSafeRelativeUrl } from './urlValidator';
// @ts-ignore
import pkg from '../../package.json';

export class PluginSystemEnhancementServer extends Plugin {
  async afterAdd() {}

  async beforeLoad() {
    this.app.acl.registerSnippet({
      name: `pm.${this.name}.settings`,
      actions: ['systemEnhancementSettings:*'],
    });

    this.app.acl.allow('systemEnhancementSettings', 'get', 'public');
    // 仅拥有系统内置“界面配置权限”（ui.* snippet）的角色可修改系统级设置
    this.app.acl.allowManager.registerAllowCondition('se.allowConfigure', async (ctx) => {
      const roleName = ctx.state.currentRole;
      if (!roleName) {
        return false;
      }
      const role = this.app.acl.getRole(roleName);
      if (!role) {
        return false;
      }
      const { allowed } = role.effectiveSnippets();
      return allowed.some((name) => name.startsWith('ui.'));
    });
    this.app.acl.allow('systemEnhancementSettings', 'update', 'se.allowConfigure');

    this.app.db.on('systemEnhancementSettings.beforeCreate', (model) => {
      this.assertLogoLinkUrlSafe(model);
    });
    this.app.db.on('systemEnhancementSettings.beforeUpdate', (model) => {
      this.assertLogoLinkUrlSafe(model);
    });
  }

  assertLogoLinkUrlSafe(model: any) {
    if (!model.changed('logoLinkUrl') || isSafeRelativeUrl(model.get('logoLinkUrl'))) {
      return;
    }
    throw new Error(
      this.app.i18n.t('Only relative paths within the current system are allowed for the logo link', {
        ns: pkg.name,
      }),
    );
  }

  async load() {}

  async install() {}

  async afterEnable() {
    try {
      const repo = this.db.getRepository('systemEnhancementSettings');
      const count = await repo.count();
      if (count === 0) {
        await repo.create({
          values: {
            id: 1,
            enableTableColumnResize: true,
            loginFormPosition: 'center',
            loginFormOffsetX: 0,
            loginFormOffsetY: 0,
            loginBackgroundSize: 'cover',
            loginBackgroundRepeat: 'no-repeat',
            loginBackgroundPosition: 'center',
            logoLinkUrl: '',
            enableEnhancedTable: true,
          },
        });
      }
    } catch {
      // Non-critical
    }
  }

  async afterDisable() {}

  async remove() {}
}

export default PluginSystemEnhancementServer;

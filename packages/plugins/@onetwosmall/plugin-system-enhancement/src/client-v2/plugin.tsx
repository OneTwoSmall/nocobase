/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Application } from '@nocobase/client-v2';
import { Plugin } from '@nocobase/client-v2';
import { NAMESPACE } from './constants';
import { EnhancedTableBlockModel } from './enhanced-table/EnhancedTableBlockModel';
import { applyLogoLink } from './logoLinkInjector';
import { enterSystemIfAuthenticated } from './loginAutoEntry';
import {
  applyStyles,
  setApiBaseUrl,
  subscribeRouteChange,
  type LoginPageStyleSettings,
} from './loginPageStyleInjector';
import { ResizableSubTableColumnModel, ResizableTableColumnModel } from './ResizableColumnModel';
import { applyEnhancementFlags } from './state';

export class PluginSystemEnhancementClientV2 extends Plugin<any> {
  async load() {
    const self = this as any;

    // 覆盖注册原生模型：存量页面的表格区块与列模型直接解析到增强子类，无需运行时改写原型。
    this.flowEngine.registerModels({
      TableBlockModel: EnhancedTableBlockModel,
      TableColumnModel: ResizableTableColumnModel,
      SubTableColumnModel: ResizableSubTableColumnModel,
    });

    self.pluginSettingsManager.addMenuItem({
      key: NAMESPACE,
      title: this.t('System Enhancement'),
      icon: 'ToolOutlined',
    });
    self.pluginSettingsManager.addPageTabItem({
      menuKey: NAMESPACE,
      key: 'index',
      title: this.t('Table Enhancement'),
      aclSnippet: `pm.${NAMESPACE}.settings`,
      componentLoader: () => import('./pages/TableEnhancementSettings'),
    });
    self.pluginSettingsManager.addPageTabItem({
      menuKey: NAMESPACE,
      key: 'login-page',
      title: this.t('Login Page Customization'),
      aclSnippet: `pm.${NAMESPACE}.settings`,
      componentLoader: () => import('./pages/LoginPageSettings'),
    });
    self.pluginSettingsManager.addPageTabItem({
      menuKey: NAMESPACE,
      key: 'logo-link',
      title: this.t('Logo Link'),
      aclSnippet: `pm.${NAMESPACE}.settings`,
      componentLoader: () => import('./pages/LogoLinkSettings'),
    });

    try {
      setApiBaseUrl(self.context.api.axios.defaults.baseURL);
      const res = await self.context.api.request({
        url: 'systemEnhancementSettings:get/1',
        method: 'get',
      });
      const data = res?.data?.data;
      applyEnhancementFlags(data);
      if (data) {
        applyStyles(data as LoginPageStyleSettings);
        applyLogoLink(data?.logoLinkUrl || '', () => self.context.router?.navigate);
      }
    } catch (error) {
      console.warn('[system-enhancement] failed to load system enhancement settings', error);
    }
    // 登录页刷新时若本地已有 token（例如同一浏览器里其它标签页刚登录），补一次鉴权并自动进入系统
    enterSystemIfAuthenticated(self.context.api);

    // 登录页样式依赖路由变化：订阅 app 路由而不是改写 history，避免全局副作用
    subscribeRouteChange(() => self.app?.router?.router ?? self.context?.router?.router);
  }
}

export default PluginSystemEnhancementClientV2;

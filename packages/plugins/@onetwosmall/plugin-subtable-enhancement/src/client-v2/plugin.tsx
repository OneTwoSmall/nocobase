/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Application, Plugin } from '@nocobase/client-v2';

import { PLUGIN_NAMESPACE } from './locale';
import { enUS, zhCN } from './localeResources';

function seedLocaleResources(i18n: any) {
  if (!i18n?.addResources) return;
  const register = () => {
    i18n.addResources('zh-CN', PLUGIN_NAMESPACE, zhCN);
    i18n.addResources('en-US', PLUGIN_NAMESPACE, enUS);
  };
  // 在服务端 locale 资源就绪前先兜底注入，避免因服务端缓存/时序导致插件文案显示为英文
  if (i18n.isInitialized) {
    register();
  } else {
    i18n.on('initialized', register);
  }
}

export class PluginSubtableEnhancementClientV2 extends Plugin<any, Application> {
  declare app: any;

  async load() {
    seedLocaleResources(this.app.i18n);
    this.flowEngine.flowSettings.registerComponentLoaders({
      LookupMappingEditor: () => import('./components/LookupMappingEditor'),
      FieldsVisibilityEditor: () => import('./components/FieldsVisibilityEditor'),
    });
    this.flowEngine.registerModelLoaders({
      EnhancedSubTableFieldModel: {
        loader: () => import('./models/EnhancedSubTableFieldModel'),
      },
      EnhancedSubTableColumnModel: {
        loader: () => import('./models/EnhancedSubTableColumnModel'),
      },
    });
  }
}

export default PluginSubtableEnhancementClientV2;

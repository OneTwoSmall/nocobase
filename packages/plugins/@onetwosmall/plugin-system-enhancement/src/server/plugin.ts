/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { createContextVariablesScope, Plugin } from '@nocobase/server';
import type { PluginFileManagerServer } from '@nocobase/plugin-file-manager';
import type { Repository } from '@nocobase/database';
import { parseFilter } from '@nocobase/utils';
import { isSafeRelativeUrl } from '../common/urlValidator';
import { mergeScopeFilter, normalizeAggregations, type SummaryAggregationPayload } from './summaryAggregation';

/**
 * 匿名（登录页）只允许读取这些字段，避免把管理端开关等系统配置暴露给未登录访客。
 */
export const PUBLIC_SETTINGS_FIELDS = [
  'id',
  'loginBackgroundImageId',
  'loginFormPosition',
  'loginFormOffsetX',
  'loginFormOffsetY',
  'loginTitleFontSize',
  'loginTitleFontWeight',
  'loginTitleColor',
  'loginBackgroundSize',
  'loginBackgroundRepeat',
  'loginBackgroundPosition',
];

type PlainRecord = Record<string, unknown>;

interface CanResultLike {
  params?: { filter?: unknown };
}

type CanFn = (options: { resource: string; action: string }) => CanResultLike | null;

/**
 * 仓储返回的可能是 Sequelize Model，先转成普通对象再裁剪字段。
 */
function toPlainRecord(body: unknown): PlainRecord | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  const toJSON = (body as { toJSON?: () => unknown }).toJSON;
  const source = typeof toJSON === 'function' ? toJSON.call(body) : body;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return null;
  }
  return source as PlainRecord;
}

function pickPublicFields(record: PlainRecord): PlainRecord {
  const result: PlainRecord = {};
  for (const field of PUBLIC_SETTINGS_FIELDS) {
    if (field in record) {
      result[field] = record[field];
    }
  }
  return result;
}

interface AuthLike {
  check?: () => Promise<unknown>;
}

type AuthContextLike = {
  get?: (name: string) => string | undefined;
  getBearerToken?: () => string | null | undefined;
  auth?: AuthLike;
  logger?: { debug?: (message: string, meta?: unknown) => void };
};

/**
 * 允许匿名访问的 action 不会经过 auth 中间件的校验（skipCheck），带 token 时需要自行补一次校验，
 * 否则已登录用户也会被当成匿名请求处理。
 */
async function resolveLoggedInUser(ctx: unknown): Promise<unknown> {
  const context = ctx as AuthContextLike;
  const token = context.getBearerToken?.() ?? context.get?.('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token || typeof context.auth?.check !== 'function') {
    return null;
  }
  try {
    return (await context.auth.check()) ?? null;
  } catch (error) {
    // token 失效时按匿名处理：登录页只需要展示用到的字段
    context.logger?.debug?.('[system-enhancement] failed to resolve the current user', { error });
    return null;
  }
}

export class PluginSystemEnhancementServer extends Plugin {
  async afterAdd() {}

  async beforeLoad() {
    this.app.acl.registerSnippet({
      name: `pm.${this.name}.settings`,
      actions: ['systemEnhancementSettings:*'],
    });

    this.app.acl.allowManager.allow('systemEnhancementSettings', 'get', 'public');
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
    this.app.acl.allowManager.allow('systemEnhancementSettings', 'update', 'se.allowConfigure');

    // 匿名请求只返回登录页需要的字段（登录框位置、标题样式、背景），管理端开关不下发。
    // resourcer 中间件运行在 dataWrapping 之内，这里拿到的 ctx.body 还是原始记录，裁剪后由 dataWrapping 包成 { data }。
    this.app.resourcer.use(async (ctx, next) => {
      await next();
      if (ctx.action?.resourceName !== 'systemEnhancementSettings') {
        return;
      }
      if (ctx.action?.actionName !== 'get' || ctx.status !== 200) {
        return;
      }
      // 该 action 允许匿名访问，auth 中间件会跳过鉴权（skipCheck），所以带 token 时要在这里补一次校验，
      // 否则已登录用户也会被当成匿名请求裁剪字段。
      const currentUser = ctx.state.currentUser || (await resolveLoggedInUser(ctx));
      if (currentUser) {
        return;
      }
      const record = toPlainRecord(ctx.body);
      if (!record) {
        return;
      }
      ctx.body = pickPublicFields(record);
    });

    // 汇总行由服务端聚合，避免把整表数据拉到前端；数据范围沿用当前用户对目标集合的 list 权限。
    this.app.acl.allowManager.allow('systemEnhancementSettings', 'aggregate', 'loggedIn');
    this.app.resourcer.registerActionHandler('systemEnhancementSettings:aggregate', async (ctx) => {
      const values = (ctx.action?.params?.values ?? {}) as SummaryAggregationPayload;
      const collection = String(values.collection ?? '').trim();
      const aggregations = normalizeAggregations(values.aggregations);
      if (!collection || Object.keys(aggregations).length === 0) {
        return ctx.throw(400, 'Invalid aggregation payload');
      }

      const can = (ctx as unknown as { can?: CanFn }).can?.({ resource: collection, action: 'list' });
      if (!can) {
        return ctx.throw(403, 'No permissions');
      }

      const collectionManager = this.app.dataSourceManager.get(values.dataSourceKey || 'main')?.collectionManager;
      const collectionInstance =
        collectionManager && collectionManager.hasCollection(collection)
          ? collectionManager.getCollection(collection)
          : null;
      if (!collectionManager || !collectionInstance) {
        return ctx.throw(404, `Collection ${collection} not found`);
      }

      const repository = collectionManager.getRepository(collection) as Repository;
      // 角色数据范围里可能带 {{ ctx.state.currentUser.id }} 之类的变量模板，与 core 的 list 接口一致，先解析再聚合
      const mergedFilter = mergeScopeFilter(can.params?.filter, values.filter);
      const filter = mergedFilter ? await parseFilter(mergedFilter, createContextVariablesScope(ctx)) : undefined;
      const data: Record<string, number | null> = {};
      for (const [field, method] of Object.entries(aggregations)) {
        if (!collectionInstance.getField(field)) {
          continue;
        }
        const value = await repository.aggregate({ method, field, filter });
        data[field] = value == null || Number.isNaN(Number(value)) ? null : Number(value);
      }

      ctx.body = data;
    });

    // 登录页为匿名访问：背景图片通过专用公开接口输出（仅当前配置的那一个附件，且必须是图片），
    // 附件本身仍受 file-manager 的 ACL 保护；响应统一设置 nosniff 等安全头，SVG 额外加 CSP sandbox。
    this.app.acl.allowManager.allow('systemEnhancementSettings', 'getLoginBackgroundImage', 'public');
    this.app.resourcer.registerActionHandler('systemEnhancementSettings:getLoginBackgroundImage', async (ctx, next) => {
      const settings = await this.db.getRepository('systemEnhancementSettings').findOne({
        filter: { id: 1 },
        appends: ['loginBackgroundImage'],
      });
      const attachment = settings?.get('loginBackgroundImage');
      if (!attachment || attachment.get('storageId') == null) {
        return ctx.throw(404);
      }
      const mimetype = attachment.get('mimetype');
      if (typeof mimetype !== 'string' || !mimetype.startsWith('image/')) {
        return ctx.throw(404);
      }

      // 同一附件的内容不变，用 id + updatedAt 生成强校验 ETag，命中后直接 304，省掉一次文件读取
      const updatedAt = attachment.get('updatedAt');
      const lastModified = updatedAt ? new Date(updatedAt) : null;
      const etag = `"se-bg-${attachment.get('id')}-${lastModified ? lastModified.getTime() : 0}"`;
      ctx.set('ETag', etag);
      ctx.set('Cache-Control', 'public, max-age=3600');
      if (lastModified) {
        ctx.set('Last-Modified', lastModified.toUTCString());
      }
      if (ctx.get('If-None-Match') === etag) {
        ctx.status = 304;
        ctx.body = null;
        return;
      }

      const fileManager = this.app.pm.get<PluginFileManagerServer>('file-manager');
      let stream;
      let contentType;
      try {
        const result = await fileManager.getFileStream(attachment);
        stream = result.stream;
        contentType = result.contentType;
      } catch (error) {
        ctx.logger?.warn?.('Failed to stream the login background image', { error });
        return ctx.throw(404);
      }
      ctx.type = contentType || mimetype;
      ctx.set('X-Content-Type-Options', 'nosniff');
      if (mimetype === 'image/svg+xml') {
        ctx.set('Content-Security-Policy', 'sandbox');
      }
      ctx.body = stream;
      await next();
    });

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
    const message = this.t('Only relative paths within the current system are allowed for the logo link');
    throw new Error(String(message));
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
    } catch (error) {
      this.app.logger?.warn?.('[system-enhancement] failed to initialize the default settings', error);
    }
  }

  async afterDisable() {}

  async remove() {}
}

export default PluginSystemEnhancementServer;

/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { isSafeRelativeUrl } from '../common/urlValidator';

const AUTH_PAGE_SUFFIXES = ['/signin', '/signup', '/forgot-password', '/reset-password'];

type ApiAuthLike = {
  token?: string | null;
  setToken?: (token: string | null) => void;
  setRole?: (role: string | null) => void;
};

type ApiLike = {
  request: (options: Record<string, any>) => Promise<any>;
  auth?: ApiAuthLike;
  notification?: { error?: (options: { message?: string }) => void };
};

export interface EnterSystemOptions {
  pathname?: string;
  search?: string;
}

/**
 * 是否为内建登录类页面（登录/注册/找回密码等）。
 * 用后缀匹配，兼容子路径/多应用部署时带前缀的 pathname（如 `/v/signin`）。
 */
export function isAuthPagePath(pathname: string): boolean {
  const normalized = (pathname || '/').replace(/\/+$/, '') || '/';
  return AUTH_PAGE_SUFFIXES.some((route) => normalized === route || normalized.endsWith(route));
}

function getDefaultAdminPath(): string {
  const win = typeof window === 'undefined' ? undefined : (window as unknown as Record<string, any>);
  const publicPath = typeof win?.__nocobase_public_path__ === 'string' ? win.__nocobase_public_path__ : '/';
  const base = publicPath.replace(/\/+$/, '');
  return `${base}/admin`;
}

/**
 * 解析登录页 `?redirect=` 目标；只接受站内根相对地址，否则回退到当前 v2 入口的 /admin。
 */
export function resolveLoginRedirectTarget(search: string): string {
  const raw = new URLSearchParams(search || '').get('redirect')?.trim();
  if (raw && isSafeRelativeUrl(raw) && raw.startsWith('/') && !raw.startsWith('//')) {
    return raw;
  }
  return getDefaultAdminPath();
}

/**
 * 登录页自动进入系统。
 *
 * core 的 v2 客户端在登录/注册等免鉴权路由上不会调用 `/auth:check`，因此同一浏览器里
 * 其它标签页登录成功后，停在登录页的标签页刷新仍显示登录表单。这里在插件内补一次校验：
 * 本地已有 token 且校验通过时，整页跳转到 `?redirect=`（缺省 /admin）进入系统。
 *
 * 另外，服务端对"未绑定任何角色"的用户返回 401 `USER_HAS_NO_ROLES_ERR`，core 会静默跳回登录页，
 * 用户会误以为登录失败；这里清理登录态并给出明确提示。
 *
 * @returns 是否已进入系统
 */
export async function enterSystemIfAuthenticated(api: ApiLike, options: EnterSystemOptions = {}): Promise<boolean> {
  const win = typeof window === 'undefined' ? undefined : (window as unknown as Record<string, any>);
  const pathname = options.pathname ?? win?.location?.pathname ?? '';
  const search = options.search ?? win?.location?.search ?? '';

  if (!api?.auth?.token || !isAuthPagePath(pathname)) {
    return false;
  }

  try {
    const res = await api.request({ url: 'auth:check', method: 'get', skipAuth: true, skipNotify: true });
    const user = res?.data?.data;

    // `code: 302` 表示服务端要求先进入中间页（如 2FA），交给响应拦截器处理；没有 id 说明未登录
    if (user?.code === 302 || user?.id == null) {
      return false;
    }

    const target = resolveLoginRedirectTarget(search);
    win?.location?.replace?.(target);
    return true;
  } catch (error) {
    const payload = (error as { response?: { data?: any } })?.response?.data;
    const detail = Array.isArray(payload?.errors) ? payload.errors[0] : payload;
    if (detail?.code === 'USER_HAS_NO_ROLES_ERR') {
      api.auth?.setToken?.(null);
      api.auth?.setRole?.(null);
      api.notification?.error?.({
        message: detail?.message || 'The current user has no roles. Please try another account.',
      });
    }
    return false;
  }
}

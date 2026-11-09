/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enterSystemIfAuthenticated, isAuthPagePath, resolveLoginRedirectTarget } from '../loginAutoEntry';

const originalLocation = globalThis.window.location;

function createApi(overrides: Record<string, any> = {}) {
  return {
    request: vi.fn(),
    auth: { token: 'test-token', setToken: vi.fn(), setRole: vi.fn() },
    notification: { error: vi.fn() },
    ...overrides,
  } as any;
}

describe('isAuthPagePath', () => {
  it('should detect builtin auth pages with or without a base path', () => {
    expect(isAuthPagePath('/signin')).toBe(true);
    expect(isAuthPagePath('/v/signin')).toBe(true);
    expect(isAuthPagePath('/nocobase/v/signin/')).toBe(true);
    expect(isAuthPagePath('/v/reset-password')).toBe(true);
    expect(isAuthPagePath('/v/admin')).toBe(false);
    expect(isAuthPagePath('/v/admin/signin-settings')).toBe(false);
  });
});

describe('resolveLoginRedirectTarget', () => {
  beforeEach(() => {
    (globalThis.window as any).__nocobase_public_path__ = '/v/';
  });

  afterEach(() => {
    delete (globalThis.window as any).__nocobase_public_path__;
  });

  it('should keep a safe root relative redirect target as is', () => {
    expect(resolveLoginRedirectTarget('?redirect=%2Fv%2Fadmin')).toBe('/v/admin');
    expect(resolveLoginRedirectTarget('?redirect=%2Fv%2Fadmin%2Fpage-1')).toBe('/v/admin/page-1');
  });

  it('should fall back to the v2 admin entry for unsafe or missing targets', () => {
    expect(resolveLoginRedirectTarget('')).toBe('/v/admin');
    expect(resolveLoginRedirectTarget('?redirect=https%3A%2F%2Fevil.com')).toBe('/v/admin');
    expect(resolveLoginRedirectTarget('?redirect=%2F%2Fevil.com')).toBe('/v/admin');
    expect(resolveLoginRedirectTarget('?redirect=javascript%3Aalert(1)')).toBe('/v/admin');
  });
});

describe('enterSystemIfAuthenticated', () => {
  let replaceSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    replaceSpy = vi.fn();
    Object.defineProperty(globalThis.window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        pathname: '/v/signin',
        search: '?redirect=%2Fv%2Fadmin',
        replace: replaceSpy,
      },
    });
    (globalThis.window as any).__nocobase_public_path__ = '/v/';
  });

  afterEach(() => {
    Object.defineProperty(globalThis.window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    delete (globalThis.window as any).__nocobase_public_path__;
    vi.restoreAllMocks();
  });

  it('should do nothing when there is no stored token', async () => {
    const api = createApi({ auth: { token: null, setToken: vi.fn(), setRole: vi.fn() } });

    const entered = await enterSystemIfAuthenticated(api, { pathname: '/v/signin', search: '' });

    expect(entered).toBe(false);
    expect(api.request).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('should do nothing outside auth pages', async () => {
    const api = createApi();

    const entered = await enterSystemIfAuthenticated(api, { pathname: '/v/admin', search: '' });

    expect(entered).toBe(false);
    expect(api.request).not.toHaveBeenCalled();
  });

  it('should enter the system when the stored token is still valid', async () => {
    const api = createApi();
    api.request.mockResolvedValue({ data: { data: { id: 1 } } });

    const entered = await enterSystemIfAuthenticated(api, {
      pathname: '/v/signin',
      search: '?redirect=%2Fv%2Fadmin',
    });

    expect(entered).toBe(true);
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'auth:check', method: 'get', skipAuth: true, skipNotify: true }),
    );
    expect(replaceSpy).toHaveBeenCalledWith('/v/admin');
  });

  it('should stay on the signin page when the token is invalid', async () => {
    const api = createApi();
    api.request.mockResolvedValue({ data: { data: {} } });

    const entered = await enterSystemIfAuthenticated(api, { pathname: '/v/signin', search: '' });

    expect(entered).toBe(false);
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('should not take over the 2FA intermediate redirect', async () => {
    const api = createApi();
    api.request.mockResolvedValue({ data: { data: { code: 302, redirect: '/2fa' } } });

    const entered = await enterSystemIfAuthenticated(api, { pathname: '/v/signin', search: '' });

    expect(entered).toBe(false);
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('should clear the session and notify when the user has no roles', async () => {
    const api = createApi();
    api.request.mockRejectedValue({
      response: {
        status: 401,
        data: { errors: [{ code: 'USER_HAS_NO_ROLES_ERR', message: 'The current user has no roles.' }] },
      },
    });

    const entered = await enterSystemIfAuthenticated(api, { pathname: '/v/signin', search: '' });

    expect(entered).toBe(false);
    expect(api.auth.setToken).toHaveBeenCalledWith(null);
    expect(api.auth.setRole).toHaveBeenCalledWith(null);
    expect(api.notification.error).toHaveBeenCalledWith({ message: 'The current user has no roles.' });
    expect(replaceSpy).not.toHaveBeenCalled();
  });
});

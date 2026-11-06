/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';
import { buildSignedInUrl, readTicket, resolveCallbackTarget } from '../../callback-target';

describe('resolveCallbackTarget', () => {
  it('maps the modern client callback to its admin base', () => {
    expect(resolveCallbackTarget('/v/seeyon-auth/callback')).toEqual({
      adminBase: '/v/admin',
      signinBase: '/v',
      customPath: '',
    });
  });

  it('maps the legacy client callback to its admin base', () => {
    expect(resolveCallbackTarget('/admin/seeyon-auth/callback')).toEqual({
      adminBase: '/admin',
      signinBase: '/admin',
      customPath: '',
    });
  });

  it('keeps the app public path prefix', () => {
    expect(resolveCallbackTarget('/nocobase/v/seeyon-auth/callback').adminBase).toBe('/nocobase/v/admin');
    expect(resolveCallbackTarget('/nocobase/v/seeyon-auth/callback').signinBase).toBe('/nocobase/v');
    expect(resolveCallbackTarget('/nocobase/admin/seeyon-auth/callback').adminBase).toBe('/nocobase/admin');
  });

  it('falls back to /admin when the marker is missing', () => {
    expect(resolveCallbackTarget('/')).toEqual({ adminBase: '/admin', signinBase: '/admin', customPath: '' });
  });

  it('keeps a safe trailing path and drops traversal', () => {
    expect(resolveCallbackTarget('/v/seeyon-auth/callback/users').customPath).toBe('users');
    expect(resolveCallbackTarget('/v/seeyon-auth/callback/../../etc').customPath).toBe('');
  });
});

describe('buildSignedInUrl', () => {
  it('never produces a doubled /v segment', () => {
    const target = resolveCallbackTarget('/v/seeyon-auth/callback');
    expect(buildSignedInUrl(target, 'abc')).toBe('/v/admin/?token=abc');
  });

  it('carries the authenticator and the trailing target', () => {
    const target = resolveCallbackTarget('/v/seeyon-auth/callback/users');
    expect(buildSignedInUrl(target, 'a b', 'seeyon')).toBe('/v/admin/users?token=a%20b&authenticator=seeyon');
  });

  it('keeps the legacy base untouched', () => {
    expect(buildSignedInUrl(resolveCallbackTarget('/admin/seeyon-auth/callback'), 'abc')).toBe('/admin/?token=abc');
  });
});

describe('readTicket', () => {
  it('accepts the Seeyon parameter and its aliases', () => {
    expect(readTicket('?v5ticket=v5')).toBe('v5');
    expect(readTicket('?ticket=t1')).toBe('t1');
    expect(readTicket('?token=t2')).toBe('t2');
  });

  it('keeps a negative numeric ticket intact', () => {
    expect(readTicket('?ticket=-414981065626073962')).toBe('-414981065626073962');
  });

  it('returns undefined when the URL carries no ticket', () => {
    expect(readTicket('')).toBeUndefined();
    expect(readTicket('?foo=bar')).toBeUndefined();
  });
});

/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';
import {
  buildCallbackRedirect,
  buildTicketValidateUrl,
  generatePassword,
  normalizeOaHost,
  parseCallbackPath,
  parseOaUsername,
  redactTicket,
  resolvePassword,
  sanitizeCustomPath,
} from '../utils';

describe('utils', () => {
  describe('normalizeOaHost', () => {
    it('strips trailing slashes so the OA endpoint never receives a double slash', () => {
      expect(normalizeOaHost('http://127.0.0.1/')).toBe('http://127.0.0.1');
      expect(normalizeOaHost(' https://oa.example.com:8080// ')).toBe('https://oa.example.com:8080');
    });

    it('rejects non http(s) and malformed values', () => {
      expect(normalizeOaHost(undefined)).toBeNull();
      expect(normalizeOaHost('')).toBeNull();
      expect(normalizeOaHost('   ')).toBeNull();
      expect(normalizeOaHost('ftp://oa.example.com')).toBeNull();
      expect(normalizeOaHost('oa.example.com')).toBeNull();
    });
  });

  describe('buildTicketValidateUrl', () => {
    it('encodes the ticket', () => {
      expect(buildTicketValidateUrl('http://oa', 'a b&c')).toBe(
        'http://oa/seeyon/thirdpartyController.do?ticket=a%20b%26c',
      );
    });
  });

  describe('parseOaUsername', () => {
    it('accepts a plain account name', () => {
      expect(parseOaUsername('zhangsan')).toBe('zhangsan');
      expect(parseOaUsername('  zhang.san_01 \n')).toBe('zhang.san_01');
    });

    it('keeps account names that merely contain the word error', () => {
      expect(parseOaUsername('errorli')).toBe('errorli');
    });

    it('rejects error responses and non-account bodies', () => {
      expect(parseOaUsername('error')).toBeNull();
      expect(parseOaUsername('ERROR')).toBeNull();
      expect(parseOaUsername('error: ticket invalid')).toBeNull();
      expect(parseOaUsername('')).toBeNull();
      expect(parseOaUsername(undefined)).toBeNull();
      expect(parseOaUsername('line1\nline2')).toBeNull();
      expect(parseOaUsername('<html>error</html>')).toBeNull();
      expect(parseOaUsername('a'.repeat(129))).toBeNull();
    });
  });

  describe('redactTicket', () => {
    it('only reveals a short prefix and the length', () => {
      expect(redactTicket('abcdefghij')).toBe('abcdef…(len=10)');
      expect(redactTicket(undefined)).toBe('<empty>');
    });
  });

  describe('passwords', () => {
    it('keeps an explicitly configured password', () => {
      expect(resolvePassword('My$ecret123')).toBe('My$ecret123');
    });

    it('generates a random password when the configured one is missing or too weak', () => {
      const weak = resolvePassword('short');
      expect(weak).not.toBe('short');
      expect(weak).toMatch(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/);
      expect(resolvePassword(undefined)).not.toBe(resolvePassword(undefined));
    });

    it('generates passwords that satisfy the users collection rules', () => {
      const password = generatePassword();
      expect(password).toHaveLength(27);
      expect(password).toMatch(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/);
    });
  });

  describe('sanitizeCustomPath', () => {
    it('keeps safe paths', () => {
      expect(sanitizeCustomPath('/admin/users')).toBe('admin/users');
      expect(sanitizeCustomPath('users')).toBe('users');
    });

    it('drops traversal segments and unsafe characters', () => {
      expect(sanitizeCustomPath('../etc')).toBe('');
      expect(sanitizeCustomPath('a/../../b')).toBe('');
      expect(sanitizeCustomPath('a/../b')).toBe('');
      expect(sanitizeCustomPath('users?a=b')).toBe('');
      expect(sanitizeCustomPath('<script>')).toBe('');
      expect(sanitizeCustomPath('')).toBe('');
      expect(sanitizeCustomPath(undefined)).toBe('');
    });
  });

  describe('parseCallbackPath', () => {
    it('matches the v1 callback', () => {
      expect(parseCallbackPath('/seeyon-auth/callback')).toEqual({
        appPrefix: '',
        isV2: false,
        customPath: '',
      });
    });

    it('matches the v2 callback without treating /v as an app prefix', () => {
      expect(parseCallbackPath('/v/seeyon-auth/callback')).toEqual({
        appPrefix: '',
        isV2: true,
        customPath: '',
      });
    });

    it('keeps the app public path and sub-app segment in the prefix', () => {
      expect(parseCallbackPath('/nocobase/seeyon-auth/callback')).toEqual({
        appPrefix: '/nocobase',
        isV2: false,
        customPath: '',
      });
      expect(parseCallbackPath('/v/apps/1/seeyon-auth/callback/users')).toEqual({
        appPrefix: '/v/apps/1',
        isV2: false,
        customPath: 'users',
      });
    });

    it('keeps the redirect target and strips traversal segments', () => {
      expect(parseCallbackPath('/seeyon-auth/callback/admin/users')).toEqual({
        appPrefix: '',
        isV2: false,
        customPath: 'admin/users',
      });
      expect(parseCallbackPath('/seeyon-auth/callback/../../evil').customPath).toBe('');
    });

    it('ignores unrelated paths', () => {
      expect(parseCallbackPath('/seeyon-auth/callbackx')).toBeNull();
      expect(parseCallbackPath('/admin/signin')).toBeNull();
      expect(parseCallbackPath(undefined)).toBeNull();
    });
  });

  describe('buildCallbackRedirect', () => {
    it('returns no target when the sign-in failed', () => {
      expect(
        buildCallbackRedirect({ appPrefix: '', isV2: true, customPath: '', token: null, authenticatorName: 'seeyon' }),
      ).toEqual({ base: '/v/admin', targetUrl: null });
    });

    it('carries the token and the authenticator name', () => {
      const { targetUrl } = buildCallbackRedirect({
        appPrefix: '',
        isV2: true,
        customPath: 'users',
        token: 'a b',
        authenticatorName: 'seeyon',
      });
      expect(targetUrl).toBe('/v/admin/users?token=a%20b&authenticator=seeyon');
    });

    it('falls back to the client root', () => {
      const { targetUrl } = buildCallbackRedirect({
        appPrefix: '/nocobase',
        isV2: false,
        customPath: '',
        token: 'abc',
      });
      expect(targetUrl).toBe('/nocobase/admin/?token=abc');
    });
  });
});

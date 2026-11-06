/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { createMockServer, MockServer } from '@nocobase/test';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const PLUGIN = '@onetwosmall/plugin-seeyon-auth';
const OA_HOST = 'http://oa.local';
const DEFAULT_PASSWORD = 'Secret12345';

function stubOaResponse(body: string, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    text: async () => body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('plugin-seeyon-auth integration', () => {
  let app: MockServer;
  let agent;

  async function createAuthenticator(options: Record<string, any>) {
    return app.db.getRepository('authenticators').create({
      values: {
        name: 'seeyon',
        authType: 'Seeyon',
        enabled: true,
        options,
      },
    });
  }

  beforeAll(async () => {
    app = await createMockServer({ plugins: ['field-sort', 'auth', 'users', 'error-handler', PLUGIN] });
    agent = app.agent();
  });

  afterAll(async () => {
    await app?.destroy();
  });

  beforeEach(async () => {
    await app.db.getRepository('authenticators').destroy({ truncate: true });
    await app.db.getRepository('users').destroy({ truncate: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('authenticators:publicList', () => {
    it('never exposes the auto-registration password', async () => {
      await createAuthenticator({
        public: {
          oaHost: OA_HOST,
          autoRegister: true,
          matchField: 'email',
          defaultPassword: DEFAULT_PASSWORD,
        },
      });

      const res = await agent.resource('authenticators').publicList();

      expect(res.status).toBe(200);
      const seeyon = res.body.data.find((item) => item.authType === 'Seeyon');
      expect(seeyon).toBeTruthy();
      expect(seeyon.options).toEqual({ autoRegister: true });
      expect(JSON.stringify(res.body)).not.toContain(DEFAULT_PASSWORD);
    });

    it('still reports the auto-registration flag from the private layout', async () => {
      await createAuthenticator({
        private: { oaHost: OA_HOST, autoRegister: true, defaultPassword: DEFAULT_PASSWORD },
      });

      const res = await agent.resource('authenticators').publicList();
      const seeyon = res.body.data.find((item) => item.authType === 'Seeyon');

      expect(seeyon.options).toEqual({ autoRegister: true });
      expect(JSON.stringify(res.body)).not.toContain(DEFAULT_PASSWORD);
    });
  });

  describe('page callback middleware', () => {
    it('renders the failure page with a reason when the ticket is missing', async () => {
      await createAuthenticator({ public: { oaHost: OA_HOST } });

      const res = await agent.get('/seeyon-auth/callback');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.text).toContain('</html>');
      expect(res.text).not.toContain('token=');
      expect(res.text).toContain('The callback URL has no ticket');
    });

    it('names the missing authenticator as the failure reason', async () => {
      const res = await agent.get('/seeyon-auth/callback?ticket=t1');

      expect(res.status).toBe(200);
      expect(res.text).not.toContain('token=');
      expect(res.text).toContain('No enabled Seeyon OA authenticator found');
    });

    it('names the OA problem as the failure reason', async () => {
      await createAuthenticator({ public: { oaHost: OA_HOST } });
      stubOaResponse('error');

      const res = await agent.get('/seeyon-auth/callback?ticket=t1');

      expect(res.text).not.toContain('token=');
      expect(res.text).toContain('The OA ticket is invalid or already used');
    });

    it('names the unmatched user as the failure reason', async () => {
      await createAuthenticator({ public: { oaHost: OA_HOST } });
      stubOaResponse('zhangsan');

      const res = await agent.get('/seeyon-auth/callback?ticket=t1');

      expect(res.text).not.toContain('token=');
      expect(res.text).toContain('No matching NocoBase user');
    });

    it('handles the exact v2 callback URL used in production', async () => {
      await createAuthenticator({ public: { oaHost: OA_HOST } });
      await app.db.getRepository('users').create({ values: { username: 'zhangsan' } });
      stubOaResponse('zhangsan');

      const res = await agent.get('/v/seeyon-auth/callback?ticket=3995737065193688490');

      expect(res.status).toBe(200);
      expect(res.text).toContain('/v/admin/?token=');
      expect(res.text).toContain('&authenticator=seeyon');
      expect(res.text).not.toContain('{"data"');
    });

    it('redirects with token and authenticator after a successful validation', async () => {
      await createAuthenticator({ public: { oaHost: OA_HOST, autoRegister: true } });
      await app.db.getRepository('users').create({ values: { username: 'zhangsan', nickname: 'zhangsan' } });
      stubOaResponse('zhangsan');

      const res = await agent.get('/seeyon-auth/callback?v5ticket=t1');

      expect(res.status).toBe(200);
      expect(res.text).toContain('/admin/?token=');
      expect(res.text).toContain('&authenticator=seeyon');
    });

    it('renders the failure page instead of a 500 when the auth flow throws', async () => {
      await createAuthenticator({ public: { oaHost: OA_HOST } });
      await app.db.getRepository('users').create({ values: { username: 'zhangsan' } });
      stubOaResponse('zhangsan');
      // Fail inside the token issuance, the last step of the sign-in flow.
      const spy = vi.spyOn(app.authManager.tokenController, 'add').mockRejectedValueOnce(new Error('boom'));

      const res = await agent.get('/seeyon-auth/callback?v5ticket=t1');

      expect(spy).toHaveBeenCalled();
      expect(res.status).toBe(200);
      expect(res.text).toContain('</html>');
      expect(res.text).not.toContain('token=');
      expect(res.text).toContain('The server failed to complete the sign-in');
    });

    it('does not intercept non-navigation requests', async () => {
      const res = await agent.post('/seeyon-auth/callback');

      expect(res.status).toBe(404);
    });
  });

  describe('seeyonAuth:callback', () => {
    it('rejects a missing ticket', async () => {
      await createAuthenticator({ public: { oaHost: OA_HOST } });

      const res = await agent.resource('seeyonAuth').callback({ values: {} });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('MISSING_TICKET');
    });

    it('rejects the call when no enabled authenticator exists', async () => {
      const res = await agent.resource('seeyonAuth').callback({ values: { v5ticket: 't1' } });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('NO_AUTHENTICATOR');
    });

    it('returns 401 when the OA rejects the ticket', async () => {
      await createAuthenticator({ public: { oaHost: OA_HOST, autoRegister: true } });
      stubOaResponse('error');

      const res = await agent.resource('seeyonAuth').callback({ values: { v5ticket: 't1' } });

      expect(res.status).toBe(401);
      expect(JSON.stringify(res.body)).toContain('AUTH_FAILED');
    });

    it('returns 401 when the user is missing and auto registration is off', async () => {
      await createAuthenticator({ public: { oaHost: OA_HOST } });
      stubOaResponse('zhangsan');

      const res = await agent.resource('seeyonAuth').callback({ values: { v5ticket: 't1' } });

      expect(res.status).toBe(401);
    });

    it('signs in an existing user and returns a whitelisted payload', async () => {
      await createAuthenticator({ public: { oaHost: OA_HOST } });
      await app.db.getRepository('users').create({
        values: { username: 'zhangsan', nickname: '张三', email: 'zhangsan@example.com' },
      });
      stubOaResponse('zhangsan');

      const res = await agent.resource('seeyonAuth').callback({ values: { v5ticket: 't1' } });

      expect(res.status).toBe(200);
      expect(res.body.data.token).toBeTruthy();
      expect(Object.keys(res.body.data.user).sort()).toEqual(['email', 'id', 'nickname', 'username']);
      expect(JSON.stringify(res.body.data.user)).not.toContain('password');
    });

    it('auto-registers a user with username filled and a random password', async () => {
      await createAuthenticator({ public: { oaHost: OA_HOST, autoRegister: true, matchField: 'email' } });
      stubOaResponse('zhangsan@example.com');

      const res = await agent.resource('seeyonAuth').callback({ values: { v5ticket: 't1' } });

      expect(res.status).toBe(200);
      const user = await app.db.getRepository('users').findOne({ filter: { username: 'zhangsan@example.com' } });
      expect(user).toBeTruthy();
      expect(user.get('email')).toBe('zhangsan@example.com');
      expect(user.get('password')).not.toBe('ABCabc@123');
      expect(user.get('password')).toMatch(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/);
    });
  });
});

/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { SeeyonAuth } from '../seeyon-auth';

type FakeRepository = {
  findOne: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};

function createRepository(): FakeRepository {
  return {
    findOne: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async ({ values }) => ({ id: 1, values })),
  };
}

function createAuthenticator() {
  return {
    name: 'seeyon',
    authType: 'Seeyon',
    options: {},
    findUser: vi.fn().mockResolvedValue(undefined),
    addUser: vi.fn().mockResolvedValue(undefined),
  };
}

function createAuth(options: Record<string, any>, repository: FakeRepository = createRepository()) {
  const authenticator = createAuthenticator();
  const ctx = {
    app: { db: { getCollection: () => ({ repository }) } },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    t: (key: string) => key,
  };
  const auth = new SeeyonAuth({
    authenticator: { ...authenticator, options },
    options,
    ctx: ctx as any,
  });
  return { auth, ctx, repository, authenticator };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SeeyonAuth.validateTicket', () => {
  it('returns the account name reported by the OA endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => ' zhangsan \n' });
    vi.stubGlobal('fetch', fetchMock);
    const { auth } = createAuth({ public: { oaHost: 'http://oa.local/' } });

    await expect(auth.validateTicket('t 1')).resolves.toBe('zhangsan');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://oa.local/seeyon/thirdpartyController.do?ticket=t%201',
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('prefers the private option over the legacy public layout', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'zhangsan' });
    vi.stubGlobal('fetch', fetchMock);
    const { auth } = createAuth({
      public: { oaHost: 'http://legacy.local' },
      private: { oaHost: 'http://private.local' },
    });

    await auth.validateTicket('t1');
    expect(fetchMock.mock.calls[0][0]).toContain('http://private.local/seeyon/');
  });

  it('does not call the OA when no host is configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { auth } = createAuth({ public: {} });

    await expect(auth.validateTicket('t1')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null on transport errors, non-2xx responses and error bodies', async () => {
    const { auth } = createAuth({ public: { oaHost: 'http://oa.local' } });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    await expect(auth.validateTicket('t1')).resolves.toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => '' }));
    await expect(auth.validateTicket('t1')).resolves.toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'error' }));
    await expect(auth.validateTicket('t1')).resolves.toBeNull();
  });
});

describe('SeeyonAuth.findOrCreateUser', () => {
  it('returns the matched user and does not touch the authenticator link twice', async () => {
    const repository = createRepository();
    const user = { id: 7 };
    repository.findOne.mockResolvedValue(user);
    const { auth, authenticator } = createAuth({ public: {} }, repository);
    authenticator.findUser.mockResolvedValue(user);

    await expect(auth.findOrCreateUser('zhangsan')).resolves.toBe(user);
    expect(repository.findOne).toHaveBeenCalledWith({ filter: { username: 'zhangsan' } });
    expect(repository.create).not.toHaveBeenCalled();
    expect(authenticator.addUser).not.toHaveBeenCalled();
  });

  it('links a found user to the authenticator', async () => {
    const repository = createRepository();
    const user = { id: 7 };
    repository.findOne.mockResolvedValue(user);
    const { auth, authenticator } = createAuth({ public: {} }, repository);

    await auth.findOrCreateUser('zhangsan');
    expect(authenticator.addUser).toHaveBeenCalledWith(user, { through: { uuid: 'zhangsan' } });
  });

  it('auto-registers with a random password instead of the shared default', async () => {
    const { auth, repository } = createAuth({ public: { autoRegister: true } });

    const user = await auth.findOrCreateUser('zhangsan');
    const { values } = repository.create.mock.calls[0][0];
    expect(values.username).toBe('zhangsan');
    expect(values.nickname).toBe('zhangsan');
    expect(values.password).not.toBe('ABCabc@123');
    expect(values.password).toMatch(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/);
    expect(user).toBeTruthy();
  });

  it('always fills username, even when matching by another field', async () => {
    const { auth, repository } = createAuth({ public: { autoRegister: true, matchField: 'email' } });

    await auth.findOrCreateUser('a@b.com');
    expect(repository.findOne).toHaveBeenCalledWith({ filter: { email: 'a@b.com' } });
    expect(repository.create.mock.calls[0][0].values).toMatchObject({ email: 'a@b.com', username: 'a@b.com' });
  });

  it('falls back to username when the configured match field is not supported', async () => {
    const { auth, repository } = createAuth({ public: { matchField: 'id' } });

    await auth.findOrCreateUser('zhangsan');
    expect(repository.findOne).toHaveBeenCalledWith({ filter: { username: 'zhangsan' } });
  });

  it('re-reads the user when a concurrent auto-registration wins the race', async () => {
    const repository = createRepository();
    const existing = { id: 9 };
    repository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);
    repository.create.mockRejectedValue(new Error('unique constraint'));
    const { auth } = createAuth({ public: { autoRegister: true } }, repository);

    await expect(auth.findOrCreateUser('zhangsan')).resolves.toBe(existing);
    expect(repository.findOne).toHaveBeenCalledTimes(2);
  });

  it('returns null without auto registration', async () => {
    const { auth, repository } = createAuth({ public: { autoRegister: false } });

    await expect(auth.findOrCreateUser('zhangsan')).resolves.toBeNull();
    expect(repository.create).not.toHaveBeenCalled();
  });
});

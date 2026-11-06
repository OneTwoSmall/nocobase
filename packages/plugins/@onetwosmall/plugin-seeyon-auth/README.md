# @onetwosmall/plugin-seeyon-auth

Seeyon OA (致远OA) single sign-on authentication plugin for NocoBase.

## Introduction

This plugin enables users to sign in to NocoBase through a Seeyon OA account using the Seeyon OA third-party authentication API. Once a user is authenticated by the OA system, the plugin validates the OA ticket and logs the user into NocoBase automatically, supporting automatic user registration.

## Features

- Single sign-on (SSO) authentication against Seeyon OA via ticket validation
- Supports both v1 (`/admin`) and v2 (`/v/admin`) client runtimes
- Server-rendered callback page that validates the ticket and redirects with a JWT token (the request never reaches the SPA)
- JSON API callback for programmatic authentication (`seeyonAuth:callback`)
- Automatic user registration when the user does not exist (optional), with a random password per user
- Configurable user match field (`username` / `email` / `nickname`); unsupported values fall back to `username`
- Authenticator cache (30s TTL, invalidated on authenticator save/destroy)
- Security hardening: path traversal and open redirect protection, XSS-safe callback HTML, `Referrer-Policy: no-referrer`, redacted tickets in logs

## Installation

Enable the plugin in the NocoBase plugin management page after installation:

```bash
yarn nocobase pm enable @onetwosmall/plugin-seeyon-auth
```

## Configuration

After enabling the plugin, create an authenticator of type `Seeyon OA` in **Settings > Authentication** and configure the following options:

| Option | Required | Description |
| --- | --- | --- |
| `OA Host` | Yes | The base URL of the Seeyon OA server, e.g. `http://127.0.0.1` |
| `Sign up automatically when the user does not exist` | No | When enabled, a user is created automatically after successful ticket validation if no matching user exists |
| `User Match Field` | No | The field used to match OA users against NocoBase users: `username` (default), `email` or `nickname` |
| `Default Password` | No | Password used when auto-registering a user. Leave it empty (recommended) to generate a random password per user; an explicit value must contain letters and digits and be at least 8 characters long, otherwise a random password is used as well |

Options are read from `options.private` first and fall back to the legacy `options.public` layout. The default password is a credential, so moving it to `options.private` is recommended.

## How It Works

1. The user visits the callback URL with the OA ticket:
   - Page callback: `/seeyon-auth/callback?v5ticket=<ticket>` (v1) or `/v/seeyon-auth/callback?v5ticket=<ticket>` (v2)
   - The parameters `ticket` and `token` are also accepted as aliases for `v5ticket`
2. The plugin validates the ticket by calling `{oaHost}/seeyon/thirdpartyController.do?ticket=<ticket>`; the response body is treated as the OA username
3. The user is looked up by the configured match field, or auto-registered if `autoRegister` is enabled
4. On success the plugin issues a NocoBase JWT token and redirects the user (optionally to a `customPath` preserved from the request URL); on failure the callback page offers a retry

### JSON API Callback

For programmatic authentication, call the resource action:

```bash
curl -X POST http://localhost:13000/api/seeyonAuth:callback \
  -H 'Content-Type: application/json' \
  -d '{"v5ticket": "<ticket>"}'
```

The endpoint returns `{ token, user }` on success (`user` only carries `id`, `username`, `nickname` and `email`), or a `400` / `401` error with a machine-readable `code` (`MISSING_TICKET`, `NO_AUTHENTICATOR`, `AUTH_FAILED`) on failure.

## Development

Tests live in `src/server/__tests__` and are split into pure unit tests and DB-backed integration tests that boot a real app through `createMockServer`:

```bash
# unit + integration (server side)
TEST_ENV=server-side yarn test packages/plugins/@onetwosmall/plugin-seeyon-auth
```

Integration tests load the plugin through its package entry, so `dist` has to be up to date:

```bash
yarn nocobase build @onetwosmall/plugin-seeyon-auth
```

The declaration step resolves sibling packages through their built `.d.ts`, so `@nocobase/plugin-auth` must be built first (a workspace-wide requirement, official plugins behave the same). The mock server uses SQLite, which needs the `sqlite3` driver in `node_modules`.

## Security Notes

- Ticket validation requests use a 5-second timeout and errors are never surfaced to the client; logs only carry a ticket prefix and its length
- The custom redirect path is sanitized against path traversal (`..`) and restricted to safe characters to prevent open redirects
- Callback HTML escapes all dynamic values to prevent XSS injection and is served with `Referrer-Policy: no-referrer`
- The redirect carries `token` and `authenticator`, which the core auth client consumes and immediately strips from the address bar
- Public authenticator options are whitelisted, so `authenticators:publicList` no longer exposes the default password
- Auto-registered users get a random password instead of a shared constant, so knowing a username is not enough to sign in with a password
- The `seeyonAuth:callback` action is marked as `public`; ensure the OA endpoint `{oaHost}/seeyon/thirdpartyController.do` is only reachable by trusted clients
- The callback page is returned as raw HTML (bypassing the API `{ data }` wrapping), so the browser never renders a JSON blob

## License

This project is dual-licensed under AGPL-3.0 and a commercial license.
For commercial licensing (e.g., closed-source deployment), please contact: moonship1011@gmail.com.

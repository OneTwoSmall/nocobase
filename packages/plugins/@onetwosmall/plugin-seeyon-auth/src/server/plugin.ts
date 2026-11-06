/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { AuthConfig } from '@nocobase/auth';
import { Plugin } from '@nocobase/server';
import { tval } from '@nocobase/utils';
import { authType, namespace } from '../constants';
import { CallbackPageMessages, renderCallbackHTML } from './callback-page';
import { SeeyonAuth, SeeyonFailureReason } from './seeyon-auth';
import { buildCallbackRedirect, parseCallbackPath, redactTicket } from './utils';

type AuthenticatorRecord = {
  name: string;
  authType: string;
  enabled?: boolean;
  options: Record<string, any>;
};

/** The callback page is a browser navigation surface, not an API endpoint. */
const CALLBACK_METHODS = new Set(['GET', 'HEAD']);
const AUTHENTICATOR_CACHE_TTL = 30_000;

/** Minimal shape of the koa context fields used by the callback page (i18n is injected by the i18n middleware). */
type TrackedContext = { t?: (key: string, options?: Record<string, unknown>) => string };

export class PluginSeeyonAuthServer extends Plugin {
  private cachedAuthenticator: AuthenticatorRecord | null | undefined = undefined;
  private cachedAt = 0;

  async load() {
    this.db.on('authenticators.afterSave', () => this.invalidateAuthenticatorCache());
    this.db.on('authenticators.afterDestroy', () => this.invalidateAuthenticatorCache());

    this.app.authManager.registerTypes(authType, {
      auth: SeeyonAuth,
      title: tval('Seeyon OA', { ns: namespace }),
      // `options.public` is returned verbatim to anonymous visitors by `authenticators:publicList`, and the settings
      // form stores the auto-registration settings (including the default password) there. Only whitelisted, safe
      // fields may leak out of this hook.
      getPublicOptions: (options) => ({
        autoRegister: Boolean(getOption(options, 'autoRegister')),
      }),
    });

    this.app.use(
      async (ctx, next) => {
        const parsed = parseCallbackPath(ctx.path);
        if (!parsed || !CALLBACK_METHODS.has(ctx.method)) return next();

        const ticket = getTicket(ctx);
        this.app.logger.info(`[seeyon-auth] callback path=${ctx.path} ticket=${redactTicket(ticket)}`);

        let token: string | null = null;
        let authenticatorName: string | undefined;
        let failureReason: CallbackFailureReason | undefined;

        if (ticket) {
          try {
            const authenticator = await this.getCachedAuthenticator();
            if (!authenticator) {
              failureReason = 'NO_AUTHENTICATOR';
            } else {
              const result = await this.createAuth(ctx, authenticator).attemptSignIn(ticket);
              if (result.status === 'ok') {
                token = result.token;
                authenticatorName = authenticator.name;
              } else {
                failureReason = result.reason;
              }
            }
          } catch (error) {
            // This page is the user-facing surface, so an upstream/database failure must render the retry UI instead
            // of bubbling up as a raw 500.
            const message = error instanceof Error ? error.message : String(error);
            this.app.logger.error(`[seeyon-auth] callback failed: ${message}`);
            token = null;
            failureReason = 'INTERNAL_ERROR';
          }
        } else {
          failureReason = 'MISSING_TICKET';
        }

        this.app.logger.info(`[seeyon-auth] callback result=${token ? 'signed-in' : `failed:${failureReason}`}`);

        const { base, targetUrl } = buildCallbackRedirect({ ...parsed, token, authenticatorName });

        // The callback is a browser page, not an API payload: keep `dataWrapping` from turning the HTML into
        // `{"data":"<!DOCTYPE html>..."}`, and keep the token out of third-party referrers.
        ctx.withoutDataWrapping = true;
        ctx.set('Referrer-Policy', 'no-referrer');
        ctx.type = 'text/html';
        const messages = getCallbackMessages(ctx);
        ctx.body = renderCallbackHTML({
          messages,
          targetUrl,
          homeUrl: `${base}/`,
          failureDetail: token ? undefined : failureReason && messages.reasons[failureReason],
        });
      },
      { tag: 'seeyon-auth-callback', after: 'bodyParser', before: 'dataSource' },
    );

    this.app.resourceManager.define({
      name: 'seeyonAuth',
      actions: {
        callback: async (ctx, next) => {
          const { v5ticket } = ctx.action.params.values || {};
          this.app.logger.info(`[seeyon-auth] API callback ticket=${redactTicket(v5ticket)}`);
          if (!v5ticket) {
            ctx.throw(400, {
              message: ctx.t('ticket or v5ticket is required', { ns: namespace }),
              code: 'MISSING_TICKET',
            });
          }

          const authenticator = await this.getCachedAuthenticator();
          if (!authenticator) {
            ctx.throw(400, {
              message: ctx.t('Seeyon authenticator not found or disabled', { ns: namespace }),
              code: 'NO_AUTHENTICATOR',
            });
          }

          const result = await this.createAuth(ctx, authenticator).attemptSignIn(v5ticket);
          if (result.status === 'failed') {
            const autoRegister = getOption(authenticator.options, 'autoRegister');
            ctx.throw(401, {
              message:
                autoRegister && result.reason === 'USER_NOT_FOUND'
                  ? ctx.t('OA ticket validation failed or user auto-creation error', { ns: namespace })
                  : ctx.t('OA ticket validation failed or user not found (auto-registration disabled)', {
                      ns: namespace,
                    }),
              code: 'AUTH_FAILED',
            });
            return;
          }

          const { id, username, nickname, email } = result.user.toJSON();
          ctx.body = {
            token: result.token,
            // The client callback page forwards this so the session is bound to the Seeyon authenticator.
            authenticator: authenticator.name,
            // Only whitelisted fields: the users collection may grow sensitive columns later.
            user: { id, username, nickname, email },
          };
          await next();
        },
      },
    });

    this.app.acl.allow('seeyonAuth', 'callback', 'public');
  }

  async getCachedAuthenticator(): Promise<AuthenticatorRecord | null> {
    if (this.cachedAuthenticator !== undefined && Date.now() - this.cachedAt < AUTHENTICATOR_CACHE_TTL) {
      return this.cachedAuthenticator;
    }

    const repo = this.db.getRepository('authenticators');
    const authenticator = await repo.findOne({ filter: { authType, enabled: true } });
    // `undefined` means "not looked up yet" while `null` means "looked up and absent", so an instance without a
    // Seeyon authenticator does not query the database on every callback.
    this.cachedAuthenticator = (authenticator as unknown as AuthenticatorRecord) || null;
    this.cachedAt = Date.now();
    return this.cachedAuthenticator;
  }

  private invalidateAuthenticatorCache() {
    this.cachedAuthenticator = undefined;
    this.cachedAt = 0;
  }

  /**
   * The middleware and resource-action contexts are the same runtime object the core auth flow receives, but their koa
   * typings do not carry the action fields declared by `AuthConfig.ctx`, hence the single narrowing cast here.
   */
  private createAuth(ctx: unknown, authenticator: AuthenticatorRecord) {
    return new SeeyonAuth({ authenticator, options: authenticator.options, ctx: ctx as AuthConfig['ctx'] });
  }
}

export default PluginSeeyonAuthServer;

/**
 * The ticket may be passed as `v5ticket` (Seeyon native), `ticket` or — for older OA integrations — `token`.
 * Only the first string value is used, so duplicate query parameters cannot smuggle an array.
 */
function getTicket(ctx: { query: Record<string, unknown> }): string | undefined {
  const raw = ctx.query.v5ticket ?? ctx.query.ticket ?? ctx.query.token;
  return typeof raw === 'string' && raw ? raw : undefined;
}

/** Options are read from `private` first and fall back to the legacy `public` layout. */
function getOption(options: Record<string, any> | undefined, key: string) {
  const value = options?.private?.[key];
  return value === undefined ? options?.public?.[key] : value;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Everything that can stop a callback from producing a session, including the plugin-level cases. */
export type CallbackFailureReason = SeeyonFailureReason | 'NO_AUTHENTICATOR' | 'MISSING_TICKET' | 'INTERNAL_ERROR';

type CallbackMessages = CallbackPageMessages & { reasons: Record<CallbackFailureReason, string> };

function getCallbackMessages(ctx: unknown): CallbackMessages {
  // `ctx.t` is provided by the i18n middleware; fall back to the key so a missing translator never breaks the page.
  const translate = (ctx as TrackedContext | undefined)?.t;
  const t: Translate = typeof translate === 'function' ? (key) => translate(key, { ns: namespace }) : (key) => key;
  return {
    loadingTitle: t('Seeyon OA single sign-on'),
    loadingSubtitle: t('Verifying your identity...'),
    loadingHint: t('Please wait'),
    successTitle: t('Signed in'),
    successSubtitle: t('Redirecting to the target page...'),
    successHint: t('Redirecting now'),
    failureTitle: t('Sign-in failed'),
    failureSubtitle: t('OA single sign-on verification failed, please try again'),
    retry: t('Try again'),
    home: t('Back to home'),
    // Actionable reasons: each one points at a different thing the operator has to fix.
    reasons: {
      MISSING_TICKET: t('The callback URL has no ticket, please start the sign-in from OA again'),
      NO_AUTHENTICATOR: t('No enabled Seeyon OA authenticator found, please check Settings > Authentication'),
      OA_NOT_CONFIGURED: t('The OA host is missing or invalid, please check Settings > Authentication'),
      OA_UNREACHABLE: t('The OA ticket validation endpoint is unreachable or returned an error'),
      TICKET_INVALID: t('The OA ticket is invalid or already used'),
      USER_NOT_FOUND: t('No matching NocoBase user and auto-registration is disabled'),
      INTERNAL_ERROR: t('The server failed to complete the sign-in, please check the server logs'),
    },
  };
}

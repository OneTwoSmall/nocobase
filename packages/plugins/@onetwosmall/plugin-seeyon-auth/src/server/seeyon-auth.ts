/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { AuthConfig, BaseAuth } from '@nocobase/auth';
import { Database, Model } from '@nocobase/database';
import { namespace } from '../constants';
import {
  buildTicketValidateUrl,
  normalizeOaHost,
  parseOaUsername,
  previewBody,
  redactTicket,
  resolvePassword,
} from './utils';

const TICKET_VALIDATE_TIMEOUT = 5000;
const DEFAULT_MATCH_FIELD = 'username';
/** Only these fields are usable as a match key for an OA account. */
const SUPPORTED_MATCH_FIELDS = ['username', 'email', 'nickname'];

export type SeeyonOptions = {
  oaHost?: string;
  autoRegister?: boolean;
  matchField?: string;
  defaultPassword?: string;
};

export type SeeyonSignInResult = {
  token: string;
  user: Model;
};

/** Why a callback attempt did not produce a session. Surfaced on the callback page and in the logs. */
export type SeeyonFailureReason = 'OA_NOT_CONFIGURED' | 'OA_UNREACHABLE' | 'TICKET_INVALID' | 'USER_NOT_FOUND';

export type SeeyonAttemptResult =
  | { status: 'ok'; token: string; user: Model }
  | { status: 'failed'; reason: SeeyonFailureReason };

type TicketResolution = { user: Model; reason?: undefined } | { user: null; reason: SeeyonFailureReason };

type OaValidationResult = { status: 'ok'; username: string } | { status: 'failed'; reason: SeeyonFailureReason };

export class SeeyonAuth extends BaseAuth {
  // The default password is a credential, so it must never be resolved as an environment variable placeholder.
  static readonly optionsKeysNotAllowedInEnv = ['defaultPassword'];

  constructor(config: AuthConfig) {
    const { ctx } = config;
    // The SSO callback middleware runs before the `dataSource` middleware, where `ctx.db` is not ready yet.
    const db: Database = ctx.db ?? ctx.app.db;
    super({
      ...config,
      userCollection: db.getCollection('users'),
    });
  }

  /**
   * Read the Seeyon options. `private` takes precedence so credentials can be moved out of `options.public`,
   * which is readable by anonymous visitors through `authenticators:publicList`; `public` stays supported because
   * the settings form and existing installations still store the values there.
   */
  protected get seeyonOptions(): SeeyonOptions {
    return {
      ...(this.options?.public || {}),
      ...(this.options?.private || {}),
    } as SeeyonOptions;
  }

  async validate() {
    const ctx = this.ctx;
    const { ticket } = ctx.action.params.values || {};

    if (!ticket) {
      ctx.throw(400, {
        message: ctx.t('Ticket is required', { ns: namespace }),
      });
    }

    const { user, reason } = await this.resolveUserByTicket(ticket);

    if (!user) {
      ctx.throw(401, {
        message:
          reason === 'USER_NOT_FOUND'
            ? ctx.t('User not found and auto-registration is disabled', { ns: namespace })
            : ctx.t('Invalid ticket or authentication failed', { ns: namespace }),
      });
    }

    return user;
  }

  /**
   * Exchange an OA ticket for a NocoBase session token.
   *
   * The SSO callback endpoints are served before the `dataSource` middleware, so they cannot go through the standard
   * `auth:signIn` action and call this method instead. Signing through `signNewToken` keeps the token payload, the
   * issued-token record and the token policy consistent with the core sign-in flow.
   */
  async signInWithTicket(ticket: string): Promise<SeeyonSignInResult | null> {
    const result = await this.attemptSignIn(ticket);
    return result.status === 'ok' ? { token: result.token, user: result.user } : null;
  }

  /**
   * Same as {@link signInWithTicket} but keeps the failure reason so the callback page can tell the user â€?and the
   * operator reading the logs â€?which step rejected the sign-in instead of showing one generic message.
   */
  async attemptSignIn(ticket: string): Promise<SeeyonAttemptResult> {
    const { user, reason } = await this.resolveUserByTicket(ticket);
    if (!user) return { status: 'failed', reason: reason || 'TICKET_INVALID' };

    const token = await this.signNewToken(user.id);
    return { status: 'ok', token, user };
  }

  protected async resolveUserByTicket(ticket: string): Promise<TicketResolution> {
    const validation = await this.requestOaUsername(ticket);
    if (validation.status === 'failed') return { user: null, reason: validation.reason };

    const user = await this.findOrCreateUser(validation.username);
    if (!user) return { user: null, reason: 'USER_NOT_FOUND' };

    return { user };
  }

  /** Kept for callers that only need the mapped account name; see {@link attemptSignIn} for the failure reason. */
  async validateTicket(ticket: string): Promise<string | null> {
    const result = await this.requestOaUsername(ticket);
    return result.status === 'ok' ? result.username : null;
  }

  private async requestOaUsername(ticket: string): Promise<OaValidationResult> {
    const configuredHost = this.seeyonOptions.oaHost;
    const oaHost = normalizeOaHost(configuredHost);
    if (!oaHost) {
      this.ctx.logger.warn(
        configuredHost
          ? '[seeyon-auth] OA host is not a valid http(s) URL, ticket validation skipped'
          : '[seeyon-auth] OA host is not configured, ticket validation skipped',
      );
      return { status: 'failed', reason: 'OA_NOT_CONFIGURED' };
    }

    this.ctx.logger.info(`[seeyon-auth] validating ticket at ${oaHost} ticket=${redactTicket(ticket)}`);
    try {
      const response = await fetch(buildTicketValidateUrl(oaHost, ticket), {
        signal: AbortSignal.timeout(TICKET_VALIDATE_TIMEOUT),
      });

      if (!response.ok) {
        this.ctx.logger.warn(`[seeyon-auth] OA responded ${response.status}`);
        return { status: 'failed', reason: 'OA_UNREACHABLE' };
      }

      const text = await response.text();
      const username = parseOaUsername(text);
      if (!username) {
        // A short preview makes an unexpected OA answer diagnosable without dumping the whole body into the logs.
        this.ctx.logger.warn(
          `[seeyon-auth] OA returned an invalid body, length=${text?.length ?? 0} preview=${previewBody(text)}`,
        );
        return { status: 'failed', reason: 'TICKET_INVALID' };
      }

      this.ctx.logger.info(`[seeyon-auth] ticket validated, account=${username}`);
      return { status: 'ok', username };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.ctx.logger.error(`[seeyon-auth] OA request failed: ${message}`);
      return { status: 'failed', reason: 'OA_UNREACHABLE' };
    }
  }

  async findOrCreateUser(oaUsername: string): Promise<Model | null> {
    const { matchField: configuredMatchField, autoRegister } = this.seeyonOptions;
    const matchField = SUPPORTED_MATCH_FIELDS.includes(configuredMatchField)
      ? configuredMatchField
      : DEFAULT_MATCH_FIELD;

    let user = await this.userRepository.findOne({
      filter: { [matchField]: oaUsername },
    });

    if (!user && autoRegister) {
      const values: Record<string, unknown> = {
        [matchField]: oaUsername,
        nickname: oaUsername,
        password: resolvePassword(this.seeyonOptions.defaultPassword),
      };
      // `username` is unique and required for a usable account, so it is always filled even when the matching
      // field is `email` or `nickname`.
      if (matchField !== 'username') {
        values.username = oaUsername;
      }

      this.ctx.logger.info(`[seeyon-auth] auto-registering user matched by ${matchField}`);
      try {
        user = await this.userRepository.create({ values });
      } catch (error) {
        // Concurrent callbacks for the same new OA account can race on the unique constraint; the winning request
        // has already created the account, so re-read it instead of failing the sign-in.
        const message = error instanceof Error ? error.message : String(error);
        this.ctx.logger.warn(`[seeyon-auth] auto-registration failed, falling back to lookup: ${message}`);
        user = await this.userRepository.findOne({
          filter: { [matchField]: oaUsername },
        });
      }
    }

    if (!user) {
      this.ctx.logger.warn(`[seeyon-auth] user not found, autoRegister=${Boolean(autoRegister)}`);
      return null;
    }

    if (!(await this.authenticator.findUser(oaUsername))) {
      await this.authenticator.addUser(user, {
        through: { uuid: oaUsername },
      });
    }

    return user;
  }
}

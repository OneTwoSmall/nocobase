/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import crypto from 'crypto';

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
const PASSWORD_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_OA_USERNAME_LENGTH = 128;
const TICKET_LOG_PREFIX_LENGTH = 6;
const CALLBACK_SUFFIXES = ['/v/seeyon-auth/callback', '/seeyon-auth/callback'];
const SAFE_PATH_REGEX = /^[a-zA-Z0-9_\-/.]+$/;

/**
 * Credentials auto-registered users never type themselves, so a random value is always preferable to a shared
 * constant. The alphabet excludes look-alike characters, and the fixed prefix guarantees the letter + digit
 * requirement of the users collection password field.
 */
export function generatePassword(length = 24): string {
  const bytes = crypto.randomBytes(length);
  let suffix = '';
  for (let i = 0; i < length; i += 1) {
    suffix += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  }
  return `Aa1${suffix}`;
}

/**
 * Keep honoring an explicitly configured password, and fall back to a random one when it is missing or does not
 * satisfy the password rules.
 */
export function resolvePassword(value: string | undefined): string {
  if (!value || typeof value !== 'string' || !PASSWORD_REGEX.test(value)) {
    return generatePassword();
  }
  return value;
}

/**
 * Normalize the configured OA base URL. Trailing slashes would otherwise produce `//seeyon/...` in the request
 * URL, and only http(s) endpoints are usable.
 */
export function normalizeOaHost(value: string | undefined | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return trimmed;
}

export function buildTicketValidateUrl(oaHost: string, ticket: string): string {
  return `${oaHost}/seeyon/thirdpartyController.do?ticket=${encodeURIComponent(ticket)}`;
}

/**
 * The OA third-party controller returns the mapped account name as a plain text body. Failures come back as the
 * `error` keyword, an HTML page or a multi-line message — none of which is a valid account name.
 *
 * A substring match on `error` (the previous behavior) also rejected real accounts such as `errorli`.
 */
export function parseOaUsername(body: string | null | undefined): string | null {
  const text = typeof body === 'string' ? body.trim() : '';
  if (!text || text.length > MAX_OA_USERNAME_LENGTH) return null;
  if (/^error\b/i.test(text)) return null;
  if (/[\r\n\t<>]/.test(text)) return null;
  return text;
}

/** Tickets are short-lived credentials: log a prefix and the length instead of the value. */
export function redactTicket(ticket: string | undefined): string {
  if (!ticket) return '<empty>';
  return `${ticket.slice(0, TICKET_LOG_PREFIX_LENGTH)}…(len=${ticket.length})`;
}

/**
 * Keep the post sign-in target inside the client base path and strip traversal segments. Accepts only characters
 * that are meaningful in a path, so the value can be embedded into the redirect URL and the callback page safely.
 */
export function sanitizeCustomPath(raw: string | undefined | null): string {
  if (typeof raw !== 'string') return '';
  const withoutLeadingSlash = raw.replace(/^\/+/, '');
  if (!withoutLeadingSlash || !SAFE_PATH_REGEX.test(withoutLeadingSlash)) return '';
  if (/(^|\/)\.\.(\/|$)/.test(withoutLeadingSlash)) return '';
  return withoutLeadingSlash;
}

export type CallbackPath = {
  /** Everything before the callback marker, e.g. `` or `/nocobase` or `/v/apps/1`. */
  appPrefix: string;
  /** Whether the callback was requested under the modern (v2) client prefix. */
  isV2: boolean;
  /** Path following the callback marker, used as the redirect target after sign-in. */
  customPath: string;
};

/**
 * Split a callback request path into the app prefix, the client runtime and the optional target path.
 *
 * The v2 client is served under `/v`, so `/v/seeyon-auth/callback` and `/seeyon-auth/callback` are two distinct
 * suffixes; matching only the bare one would treat `/v` as an app prefix.
 */
export function parseCallbackPath(path: string | undefined | null): CallbackPath | null {
  if (typeof path !== 'string' || !path) return null;
  for (const suffix of CALLBACK_SUFFIXES) {
    const idx = path.indexOf(suffix);
    if (idx === -1) continue;
    const after = path.substring(idx + suffix.length);
    if (after !== '' && !after.startsWith('/')) continue;
    return {
      appPrefix: path.substring(0, idx),
      isV2: suffix.startsWith('/v/'),
      customPath: sanitizeCustomPath(after),
    };
  }
  return null;
}

export type CallbackRedirectOptions = {
  appPrefix: string;
  isV2: boolean;
  customPath: string;
  token: string | null;
  authenticatorName?: string;
};

/**
 * Build the URL the browser is sent to once the callback finished. The core auth provider picks up and strips
 * `token` + `authenticator` from the query string, so the redirect has to keep that shape.
 */
export function buildCallbackRedirect({
  appPrefix,
  isV2,
  customPath,
  token,
  authenticatorName,
}: CallbackRedirectOptions): { base: string; targetUrl: string | null } {
  const base = `${appPrefix}${isV2 ? '/v/admin' : '/admin'}`;
  if (!token) return { base, targetUrl: null };

  const search = `token=${encodeURIComponent(token)}${
    authenticatorName ? `&authenticator=${encodeURIComponent(authenticatorName)}` : ''
  }`;
  return { base, targetUrl: customPath ? `${base}/${customPath}?${search}` : `${base}/?${search}` };
}

/**
 * Truncated, control-character-free preview of an OA response body. Only used for diagnostics, e.g. when the OA
 * answers with something that is not an account name.
 */
export function previewBody(body: string | null | undefined, max = 120): string {
  const text =
    typeof body === 'string'
      ? Array.from(body)
          .filter((char) => {
            const code = char.charCodeAt(0);
            return code >= 0x20 && code !== 0x7f;
          })
          .join('')
          .trim()
      : '';
  if (!text) return '<empty>';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

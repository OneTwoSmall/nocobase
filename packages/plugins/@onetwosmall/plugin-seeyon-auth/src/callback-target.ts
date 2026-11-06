/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

export type CallbackTarget = {
  /** Client base path that accepts `?token=`, e.g. `/admin`, `/v/admin` or `/nocobase/v/admin`. */
  adminBase: string;
  /** Client base path that owns the sign-in page: `/admin` for the legacy client, `/v` for the modern one. */
  signinBase: string;
  /** Optional path preserved after the callback marker, used as the post sign-in target. */
  customPath: string;
};

const MARKER = '/seeyon-auth/callback';
/**
 * Work out where the browser should go after the ticket exchange.
 *
 * The callback page is served by the SPA, so its own URL already carries the client base:
 * - legacy client: `/admin/seeyon-auth/callback` → base `/admin`
 * - modern client: `/v/seeyon-auth/callback` → base `/v/admin` (the admin segment has to be appended)
 *
 * Both cases also support an app public path prefix such as `/nocobase`.
 */
export function resolveCallbackTarget(pathname: string): CallbackTarget {
  const idx = typeof pathname === 'string' ? pathname.indexOf(MARKER) : -1;
  const before = idx > 0 ? pathname.slice(0, idx).replace(/\/+$/, '') : '';
  const after = idx === -1 ? '' : pathname.slice(idx + MARKER.length).replace(/^\/+/, '');

  let adminBase: string;
  let signinBase: string;
  if (/\/v$/.test(before)) {
    // Modern client: the admin layout lives under `<prefix>/v/admin` while sign-in sits at `<prefix>/v/signin`.
    adminBase = `${before}/admin`;
    signinBase = before;
  } else if (before) {
    // Legacy client: the router basename already includes the admin segment, sign-in included.
    adminBase = before;
    signinBase = before;
  } else {
    adminBase = '/admin';
    signinBase = '/admin';
  }

  const customPath = /^(?:[a-zA-Z0-9_\-/.]+)?$/.test(after) && !/\.\.(\/|$)/.test(after) ? after : '';

  return { adminBase, signinBase, customPath };
}

/** Build the redirect URL the client uses after the API returned a token. */
export function buildSignedInUrl(target: CallbackTarget, token: string, authenticator?: string): string {
  const search = `token=${encodeURIComponent(token)}${
    authenticator ? `&authenticator=${encodeURIComponent(authenticator)}` : ''
  }`;
  return target.customPath ? `${target.adminBase}/${target.customPath}?${search}` : `${target.adminBase}/?${search}`;
}

/** Read the OA ticket from the callback URL; Seeyon sends `v5ticket`, older integrations send `ticket`/`token`. */
export function readTicket(search: string): string | undefined {
  const params = new URLSearchParams(search || '');
  const value = params.get('v5ticket') || params.get('ticket') || params.get('token');
  return value || undefined;
}

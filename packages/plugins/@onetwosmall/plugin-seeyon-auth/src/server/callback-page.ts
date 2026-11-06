/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

export type CallbackPageMessages = {
  loadingTitle: string;
  loadingSubtitle: string;
  loadingHint: string;
  successTitle: string;
  successSubtitle: string;
  successHint: string;
  failureTitle: string;
  failureSubtitle: string;
  retry: string;
  home: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export type CallbackPageOptions = {
  messages: CallbackPageMessages;
  /** Redirect target after a successful sign-in, translated into the browser through `location.replace`. */
  targetUrl: string | null;
  /** Client base URL used by the retry UI. */
  homeUrl: string;
  /** Reason shown under the failure heading; omitted for the generic "verification failed" message. */
  failureDetail?: string;
};

/**
 * Standalone callback page served before the `dataSource` middleware, so the SPA is not available yet. Every
 * dynamic value is escaped, and the success state is only rendered when a token exists.
 */
export function renderCallbackHTML({ messages, targetUrl, homeUrl, failureDetail }: CallbackPageOptions): string {
  const success = Boolean(targetUrl);
  const title = success ? messages.successTitle : messages.failureTitle;
  const icon = success ? '&#9989;' : '&#9888;&#65039;';
  const heading = success ? messages.successTitle : messages.failureTitle;
  const subtitle = success ? messages.successSubtitle : failureDetail || messages.failureSubtitle;
  const spinColor = success ? ['#52c41a', '#389e0d'] : [];
  const hint = success ? messages.successHint : '';

  const timerJs = success
    ? `
  var D=800;setTimeout(function(){
    document.getElementById('s').classList.remove('hidden');
    setTimeout(function(){location.replace(${JSON.stringify(targetUrl)});},200);
  },D);
  `
    : '';

  const retryButtons = success
    ? ''
    : `<div class="btn" style="margin-top:12px"><button class="b1" onclick="location.reload()">${escapeHtml(
        messages.retry,
      )}</button><button class="b2" onclick="location.replace(${JSON.stringify(homeUrl)})">${escapeHtml(
        messages.home,
      )}</button></div>`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
.w{display:flex;align-items:center;justify-content:center;min-height:100vh;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%)}
.c{background:#fff;border-radius:12px;padding:48px 56px;box-shadow:0 16px 48px rgba(0,0,0,.12);text-align:center;max-width:400px;width:90%}
.ic{font-size:44px;margin-bottom:12px}
.t{font-size:20px;font-weight:600;color:#1a1a2e;margin-bottom:6px}
.s{font-size:14px;color:#888;margin-bottom:28px}
.sp{display:flex;justify-content:center;margin-bottom:20px}
.h{font-size:12px;color:#bbb}
.ph{color:#999;font-size:12px;margin-top:24px}
svg circle.track{fill:none;stroke:#eee;stroke-width:3}
svg circle.arc{fill:none;stroke-width:3;stroke-linecap:round;stroke-dasharray:90;stroke-dashoffset:70;transform-origin:22px 22px;animation:spin .9s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.btn{display:flex;flex-direction:column;gap:12px}
.btn button{border:none;border-radius:8px;cursor:pointer;font-size:15px;font-weight:500;width:100%;padding:10px 0}
.btn .b1{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff}
.btn .b2{background:transparent;color:#888;border:1px solid #ddd}
.hidden{display:none !important}
</style>
</head>
<body>
<div class="w">
  <div class="c">
    <div id="l" class="${success ? 'hidden' : ''}">
      <div class="ic">&#128274;</div>
      <div class="t">${escapeHtml(messages.loadingTitle)}</div>
      <div class="s">${escapeHtml(messages.loadingSubtitle)}</div>
      <div class="sp"><svg width="44" height="44" viewBox="0 0 44 44"><circle class="track" cx="22" cy="22" r="18"/><circle class="arc" cx="22" cy="22" r="18" stroke="url(#g1)"/><defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#667eea"/><stop offset="1" stop-color="#764ba2"/></linearGradient></defs></svg></div>
      <div class="h">${escapeHtml(messages.loadingHint)}</div>
    </div>
    <div id="s" class="${success ? '' : 'hidden'}">
      <div class="ic">${icon}</div>
      <div class="t">${escapeHtml(heading)}</div>
      <div class="s">${escapeHtml(subtitle)}</div>
      ${
        spinColor.length
          ? `<div class="sp"><svg width="44" height="44" viewBox="0 0 44 44"><circle class="track" cx="22" cy="22" r="18"/><circle class="arc" cx="22" cy="22" r="18" stroke="url(#g2)"/><defs><linearGradient id="g2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${spinColor[0]}"/><stop offset="1" stop-color="${spinColor[1]}"/></linearGradient></defs></svg></div>`
          : ''
      }
      <div class="h">${escapeHtml(hint)}</div>
      ${retryButtons}
    </div>
    <div class="ph">Powered by NocoBase</div>
  </div>
</div>
<script>
  ${timerJs}
</script>
</body>
</html>`;
}

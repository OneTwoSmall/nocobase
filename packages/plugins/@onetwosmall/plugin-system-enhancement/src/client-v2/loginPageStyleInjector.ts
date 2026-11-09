/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

const STYLE_ID = 'se-login-custom-style';
const CLASS_NAME = 'se-login-custom';
const AUTH_SEGMENTS = ['/signin', '/signup', '/forgot-password', '/reset-password'];

/**
 * 登录页表单容器的定位选择器：
 * - 按 AuthLayout 的容器宽度特征匹配；
 * - `:has(> h1)` 兜底，匹配直接包含标题的容器。
 */
const CONTAINER_SELECTORS = ['div[style*="max-width: 320px"]', 'div:has(> h1)'];

export interface LoginPageStyleSettings {
  loginBackgroundImageId?: number;
  loginBackgroundImage?: { id?: number; url?: string } | null;
  loginFormPosition?: string;
  loginFormOffsetX?: number;
  loginFormOffsetY?: number;
  loginTitleFontSize?: string;
  loginTitleFontWeight?: string;
  loginTitleColor?: string;
  loginBackgroundSize?: string;
  loginBackgroundRepeat?: string;
  loginBackgroundPosition?: string;
}

interface RouterLike {
  subscribe?: (listener: (state?: unknown) => void) => () => void;
}

let current: LoginPageStyleSettings = {};
let apiBaseUrl = '/';
let routeBound = false;

export function setApiBaseUrl(baseUrl: string) {
  apiBaseUrl = (baseUrl || '/').replace(/\/+$/, '') + '/';
}

export function getBackgroundUrl(s: LoginPageStyleSettings): string {
  // 匿名上下文下 settings GET 不返回 loginBackgroundImage 关系对象，只有 loginBackgroundImageId 标量，
  // 故优先使用标量；设置页保存后 applyStyles 收到的是附件对象，回退取其 id。
  const id = s.loginBackgroundImageId ?? s.loginBackgroundImage?.id;
  return id ? `${apiBaseUrl}systemEnhancementSettings:getLoginBackgroundImage?v=${id}` : '';
}

function isAuthPage(): boolean {
  const p = window.location.pathname;
  return AUTH_SEGMENTS.some((s) => p.endsWith(s) || p.includes(`${s}?`));
}

/**
 * 表单容器的位置与偏移：纯 CSS 实现，不再轮询扫描 DOM。
 */
function buildContainerRule(s: LoginPageStyleSettings): string {
  const pos = s.loginFormPosition || 'center';
  const ox = s.loginFormOffsetX ?? 0;
  const oy = s.loginFormOffsetY ?? 0;
  const marginLeft = pos === 'left' ? `${ox}px` : 'auto';
  const marginRight = pos === 'right' ? `${ox}px` : 'auto';
  const selector = CONTAINER_SELECTORS.map((sel) => `html.${CLASS_NAME} ${sel}`).join(',');

  return [
    `${selector}{`,
    `padding-top:calc(20vh + ${oy}px)!important;`,
    `padding-bottom:20vh!important;`,
    `margin-left:${marginLeft}!important;`,
    `margin-right:${marginRight}!important;`,
    `}`,
  ].join('');
}

function buildCSS(s: LoginPageStyleSettings): string {
  const bgUrl = getBackgroundUrl(s);
  const bgImage = bgUrl ? `url(${bgUrl})` : 'none';
  const bgSize = s.loginBackgroundSize || 'cover';
  const bgRepeat = s.loginBackgroundRepeat || 'no-repeat';
  const bgPosition = s.loginBackgroundPosition || 'center';

  const title: string[] = [];
  if (s.loginTitleFontSize) title.push(`font-size:${s.loginTitleFontSize}!important`);
  if (s.loginTitleFontWeight) title.push(`font-weight:${s.loginTitleFontWeight}!important`);
  if (s.loginTitleColor) title.push(`color:${s.loginTitleColor}!important`);

  const bgRule = [
    `background-image:${bgImage}!important;`,
    `background-size:${bgSize}!important;`,
    `background-repeat:${bgRepeat}!important;`,
    `background-position:${bgPosition}!important;`,
    `background-attachment:fixed!important;`,
  ].join('');

  return [
    `html.${CLASS_NAME},html.${CLASS_NAME} body,html.${CLASS_NAME} #root{min-height:100vh!important;${bgRule}}`,
    `html.${CLASS_NAME} #root>div{background:transparent!important;min-height:100vh!important;}`,
    `html.${CLASS_NAME} #root>div>div{background:transparent!important;}`,
    `html.${CLASS_NAME} #root>div>div>div{background:transparent!important;}`,
    title.length ? `html.${CLASS_NAME} h1{${title.join(';')}}` : '',
    buildContainerRule(s),
  ]
    .filter(Boolean)
    .join('');
}

function injectCSS() {
  removeCSS();
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = buildCSS(current);
  document.head.appendChild(el);
}

function removeCSS() {
  const el = document.getElementById(STYLE_ID);
  if (el) el.remove();
}

function syncClass() {
  const html = document.documentElement;
  if (isAuthPage()) {
    html.classList.add(CLASS_NAME);
    injectCSS();
  } else {
    html.classList.remove(CLASS_NAME);
  }
}

function handleRoute() {
  syncClass();
}

export function applyStyles(settings: LoginPageStyleSettings) {
  current = settings || {};
  handleRoute();
}
export function removeStyles() {
  removeCSS();
  document.documentElement.classList.remove(CLASS_NAME);
}

/**
 * 订阅路由变化（优先使用 app 的 react-router 实例），避免改写 history 造成的全局副作用。
 * 路由实例可能在插件加载之后才就绪，因此这里做有限次重试，最后退化为只监听浏览器前进后退。
 */
export function subscribeRouteChange(getRouter: () => RouterLike | undefined, retriesLeft = 5) {
  if (routeBound) {
    handleRoute();
    return;
  }

  const unsubscribe = getRouter()?.subscribe?.(() => handleRoute());
  if (typeof unsubscribe === 'function') {
    routeBound = true;
    handleRoute();
    return;
  }

  if (retriesLeft > 0) {
    setTimeout(() => subscribeRouteChange(getRouter, retriesLeft - 1), 200);
    return;
  }

  routeBound = true;
  window.addEventListener('popstate', handleRoute);
  handleRoute();
}

/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { NavigateFunction } from 'react-router-dom';
import { isSafeRelativeUrl } from '../common/urlValidator';

export { isSafeRelativeUrl };

const LOGO_SELECTORS = [
  // antd pro-layout 头部 Logo（span.ant-pro-global-header-logo）
  '.ant-pro-global-header-logo',
  // 侧边栏 Logo
  '[class*="ant-pro-sider-logo"]',
  // 兼容旧布局
  '#logo',
  '.ant-pro-global-header-logo a',
];
let currentUrl = '';
let bound = false;
let getNavigate: (() => NavigateFunction) | null = null;

function handleClick(event: MouseEvent) {
  if (!currentUrl) {
    return;
  }
  const target = event.target as Element | null;
  if (!target || !(target instanceof Element) || !target.closest(LOGO_SELECTORS.join(','))) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const navigate = getNavigate?.();
  if (navigate) {
    // SPA 跳转，避免整页刷新
    navigate(currentUrl);
  } else {
    window.location.href = currentUrl;
  }
}

export function applyLogoLink(url: string, getRouterNavigate?: () => NavigateFunction) {
  currentUrl = (url || '').trim();
  if (getRouterNavigate) {
    getNavigate = getRouterNavigate;
  }
  if (!bound) {
    bound = true;
    document.addEventListener('click', handleClick, true);
  }
}

/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * 插件包名，与 package.json 的 name 保持一致（由 __tests__/pluginMeta.test.ts 校验）。
 *
 * 这里不用 `import pkg from '../../package.json'`：声明文件构建的 rootDir 是插件 src 目录，
 * package.json 位于其外，会触发 TS6059，只能靠 @ts-ignore 绕过；改用常量后不再需要忽略类型检查。
 */
export const PLUGIN_NAME = '@onetwosmall/plugin-system-enhancement';

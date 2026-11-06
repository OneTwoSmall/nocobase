# @onetwosmall/plugin-seeyon-auth

NocoBase 致远OA（Seeyon OA）单点登录认证插件。

## 简介

该插件通过致远OA的第三方认证接口，实现致远OA账号到 NocoBase 的单点登录（SSO）。用户在 OA 系统完成认证后，插件校验 OA 票据（ticket）并自动登录 NocoBase，支持用户不存在时自动注册。

## 功能特性

- 基于 OA 票据校验的致远OA 单点登录认证
- 同时支持 v1（`/admin`）与 v2（`/v/admin`）两套客户端运行时
- 页面回调端点：由服务端中间件渲染独立页面，校验票据后携带 JWT token 自动跳转（不经过 SPA 路由）
- JSON API 回调端点（`seeyonAuth:callback`）：供程序化认证使用
- 用户不存在时自动注册（可选），新用户密码随机生成
- 可配置用户匹配字段（`username` / `email` / `nickname`），非法取值自动回落 `username`
- 认证器缓存（30 秒 TTL，保存/删除认证器时立即失效）
- 安全加固：防路径穿越与开放重定向、回调页面防 XSS 注入、回调响应 `Referrer-Policy: no-referrer`、日志票据脱敏

## 安装

安装后，在 NocoBase 插件管理页面启用该插件：

```bash
yarn nocobase pm enable @onetwosmall/plugin-seeyon-auth
```

## 配置说明

启用插件后，在 **设置 > 认证** 中新建认证器，类型选择「致远OA」，并配置以下选项：

| 选项 | 必填 | 说明 |
| --- | --- | --- |
| OA Host | 是 | 致远OA 服务器地址，例如 `http://127.0.0.1` |
| 用户不存在时自动注册 | 否 | 开启后，票据校验通过但用户不存在时，自动创建用户 |
| 用户匹配字段 | 否 | OA 用户与 NocoBase 用户的匹配字段：`username`（默认）、`email` 或 `nickname` |
| 默认密码 | 否 | 自动注册用户时使用的密码。留空（推荐）时每个新用户都会生成一个随机密码；填写时需包含字母和数字且长度不少于 8 位，否则同样回落为随机密码 |

配置值同时支持存放在 `options.private`（优先）与 `options.public`（旧版布局，保持兼容）。默认密码属于凭据，建议迁移到 `options.private`。

## 认证流程

1. 用户携带 OA 票据访问回调地址：
   - 页面回调：`/seeyon-auth/callback?v5ticket=<ticket>`（v1）或 `/v/seeyon-auth/callback?v5ticket=<ticket>`（v2）
   - 同时兼容 `ticket`、`token` 参数名
2. 插件调用 `{oaHost}/seeyon/thirdpartyController.do?ticket=<ticket>` 校验票据，响应体即为 OA 用户名
3. 按配置的匹配字段查找用户；若开启了自动注册且用户不存在，则自动创建
4. 校验成功后签发 NocoBase JWT token 并跳转（保留请求 URL 中的 `customPath` 作为跳转目标）；失败则停留在回调页，提供「重新尝试」与「返回首页」

### JSON API 回调

程序化认证可直接调用资源操作：

```bash
curl -X POST http://localhost:13000/api/seeyonAuth:callback \
  -H 'Content-Type: application/json' \
  -d '{"v5ticket": "<ticket>"}'
```

成功时返回 `{ token, user }`，其中 `user` 仅包含 `id`、`username`、`nickname`、`email`；失败时返回 `400` / `401` 错误，并附带机器可读的 `code`（`MISSING_TICKET`、`NO_AUTHENTICATOR`、`AUTH_FAILED`）。

## 开发与测试

测试位于 `src/server/__tests__`，分为纯单元测试与通过 `createMockServer` 启动真实应用的集成测试：

```bash
# 服务端单元 + 集成测试
TEST_ENV=server-side yarn test packages/plugins/@onetwosmall/plugin-seeyon-auth
```

集成测试通过包的入口加载插件，因此需要先把 `dist` 构建到最新：

```bash
yarn nocobase build @onetwosmall/plugin-seeyon-auth
```

声明生成阶段通过已构建的 `.d.ts` 解析兄弟包，因此需要先构建 `@nocobase/plugin-auth`（这是本仓库的通用要求，官方插件同样如此）。Mock server 使用 SQLite，需要 `node_modules` 中存在 `sqlite3` 驱动。

## 安全说明

- 票据校验请求设置 5 秒超时，异常信息不会暴露给客户端；日志只记录票据前缀与长度
- 自定义跳转路径会校验路径穿越（`..`）并限制为安全字符，防止开放重定向
- 回调页面 HTML 对动态值进行转义，防止 XSS 注入，并返回 `Referrer-Policy: no-referrer`
- 跳转参数携带 `token` 与 `authenticator`，由核心认证客户端读取并立即从地址栏清除
- 认证器的公开选项经过白名单过滤，`authenticators:publicList` 不会再返回默认密码
- 自动注册用户的密码不再是固定常量，避免「知道用户名即可用通用口令登录」
- `seeyonAuth:callback` 接口为 `public` 权限，请确保 `{oaHost}/seeyon/thirdpartyController.do` 接口仅对可信客户端开放
- 回调页以原生 HTML 直接返回（绕过 API 的 `{ data }` 包装），浏览器不会显示被 JSON 包裹的页面

## 许可证

本项目采用双许可：AGPL-3.0 与商业授权。
商业授权（如闭源部署）请联系：moonship1011@gmail.com。

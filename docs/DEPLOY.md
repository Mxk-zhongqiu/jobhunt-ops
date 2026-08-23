# 公网部署指南

把求职作战台发布为一个**任何设备都能访问的公网网站**，用于真实工具测评（真实数据 + 云同步 + 云端 AI）。

## 公网版 = 真实工具

| 层次 | 处理 | 说明 |
|---|---|---|
| 界面 | ✅ 完整部署 | `npm run build` 构建静态站点，托管到 Firebase Hosting / Netlify / Cloudflare Pages |
| 数据 | ✅ 真实种子数据 | 公网即真实工具测评版（2026 决策：取消"真实数据不进公网包"红线）；虚构演示数据仅保留为应用内「游客预览」开关 |
| AI 服务 | ✅ 云端 Worker | `worker/ai-proxy.js`（Cloudflare Worker）代理 DeepSeek，密钥存 Worker 环境变量；建议配置 `AI_ALLOWED_EMAILS` 邮箱白名单 |
| 数据同步 | ✅ 云端同步 | Firebase Auth 登录后 Firestore 跨设备同步；Firestore 规则按 uid 隔离，他人无法读取你的数据 |

## 构建

```bash
npm run build
```

- 产物在 `dist/`；`dist/_redirects` 已内置 SPA 路由回退（深链接如 `/question-bank` 直接访问也能打开）。
- 本地预览：`npm run preview`（默认 http://127.0.0.1:8788）。

## 部署（Firebase Hosting，当前线上）

```bash
firebase deploy --only hosting
```

备选：Netlify Drop（拖 `dist/` 文件夹）或 Cloudflare Pages（直接上传），`_redirects` 已含 SPA 回退。

## 发布前检查清单

- [ ] `npm run build` 通过、`npm run verify`（AI 36 项安全验收）通过
- [ ] 手机浏览器打开网址，检查：首页漏斗、投递表、知识页（含知识点模块）、AI 助手
- [ ] 直接访问一个深链接（如 `你的网址/question-bank`）能打开
- [ ] 登录自己的 Firebase 账号后，云端同步与云端 AI 可用（AI 需 Worker 已配置白名单）

## AI 云端白名单（防公网刷额度）

`worker/ai-proxy.js` 支持 `AI_ALLOWED_EMAILS`（逗号分隔的邮箱白名单，未配置则允许所有登录用户）。
建议在 Cloudflare 控制台 → Workers → 你的代理 → 设置 → 变量中添加：
`AI_ALLOWED_EMAILS=you@example.com`（替换为你自己的账号），然后重新部署 Worker。

## 与本地的关系

- 本地 `npm run dev` / `npm run build` 与公网构建使用同一真实数据源；
- 数据安全：Firestore `states/{uid}` 规则仅允许本人读写；DeepSeek 密钥只在服务端，浏览器接触不到。

# 公网展示版部署指南（第一阶段）

把求职作战台发布为一个**任何设备都能访问的公网网站**（不需要你的电脑开机），发给别人体验完整界面与演示数据。

## 三个层次的处理方式

| 层次 | 展示版处理 | 说明 |
|---|---|---|
| 界面 | ✅ 完整部署 | `npm run build:demo` 构建静态站点，托管到免费静态平台 |
| AI 服务 | ✅ 仅本地 Mock | 静态托管没有服务端，DeepSeek 密钥**绝不能进网页**；展示版隐藏真实 API 入口，只用本地规则 |
| 数据同步 | ⚠️ 每人独立演示数据 | 展示版数据是虚构演示数据 + 每个访客浏览器独立的 localStorage；跨设备同步属于第二阶段（云端数据库） |

## 一键构建（含自动安全门禁）

```bash
npm run build:demo
```

- 产物在 `dist/`；
- 构建末尾自动运行 `verify-seed.mjs --expect-demo`：**检查公网包里不含任何真实种子数据**（真实公司名等），有泄漏立即失败并阻止部署；
- 演示数据（`src/data/demoSeed.ts`）：虚构公司、状态覆盖全漏斗、含面试记录与高频题演示、日期相对"今天"动态生成，任何时候打开都像在正常使用；
- `dist/_redirects` 已内置 SPA 路由回退（深链接如 `/question-bank` 直接访问也能打开）。

上传前可先本地预览：`npm run preview`（默认 http://127.0.0.1:8788）。

## 部署（三选一，推荐第一个）

### 1. Netlify Drop（最省事，推荐）
1. 打开 <https://app.netlify.com/drop>（首次需免费注册/登录）；
2. 把 `dist/` 文件夹整个**拖进页面**；
3. 几秒后得到网址（形如 `https://xxxx.netlify.app`），把链接发出去即可。
4. 之后每次更新：重新 `npm run build:demo`，再把新 `dist/` 拖一次（或连 GitHub 仓库自动构建）。

### 2. Cloudflare Pages（国内访问可能更快）
1. 打开 <https://dash.cloudflare.com> → Workers & Pages → 创建 → Pages → **直接上传**；
2. 项目名随意（会得到 `https://<项目名>.pages.dev`）；
3. 上传 `dist/` 文件夹即可（`_redirects` 已含 SPA 回退）。

### 3. Vercel
- 需要 `vercel.json` 做 SPA 回退（`npm i -g vercel` 后 `vercel --prod`，或连接 GitHub 仓库）。项目根目录加：
  ```json
  { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
  ```

## 发布前检查清单

- [ ] `npm run build:demo` 通过（末尾出现 `✅ 演示包检查通过`）
- [ ] 手机浏览器打开网址，检查：首页漏斗、投递表、面试题库、AI 助手（显示"公网展示版 · 仅本地 Mock"）
- [ ] 直接访问一个深链接（如 `你的网址/question-bank`）能打开
- [ ] 想确认包内无真实数据：`npm run verify:seed:demo`

## 本地正式版不受影响

- `npm run dev` / `npm run build`：仍然是**真实种子数据 + 真实 DeepSeek**（本地代理），与展示版完全隔离；
- 数据隔离机制：构建期常量 `__DEMO_MODE__`（`vite.config.ts` 的 `define`，`--mode demo` 时为 true）让 Rollup 整体摇掉未使用的种子模块——**真实数据不进公网包，演示数据不进真实构建**；
- 新增真实种子数据后，记得检查 `scripts/verify-seed.mjs` 的两组标记是否需要补充公司名。

## 第二阶段预告（真正可持续使用的在线产品）

展示版的数据是每个访客浏览器独立的，不是"你的"数据。要做成跨设备同步的正式产品，需要：
1. **云端数据库 + 账户**（注册/登录，把 `AppState` 存到云端）；
2. **AI 服务上云**（DeepSeek 代理部署为 serverless 函数，密钥存云端环境变量）；
3. 数据从 localStorage 迁移到云，替换 `appStore` 的持久化层。

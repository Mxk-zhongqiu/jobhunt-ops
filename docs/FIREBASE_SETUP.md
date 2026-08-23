# 第二阶段：云端化上线指南（认证 + 跨设备同步 + AI 上云）

把求职作战台升级为**真正可持续使用的在线产品**：邮箱密码注册登录、数据存云端 Firestore（手机/电脑登录同一账号自动同步、断网可用）、DeepSeek 密钥存 **Cloudflare Worker 环境变量**（免费计划，无需升级 Firebase 付费计划）。

> 为什么不用 Firebase Cloud Functions：部署函数依赖 Cloud Build，**免费 Spark 计划不允许**（需升级 Blaze 绑卡）。
> 因此 AI 代理改用 Cloudflare Worker（免费 10 万次/天）。仓库里的 `functions/` 目录保留为 Blaze 用户的备选方案。

架构：

```
浏览器（React SPA）
 ├─ 未登录：本地模式（localStorage，与原版一致）
 └─ 登录后：
     ├─ Firebase Auth（邮箱密码）→ 会话由 Google 托管（免费计划可用）
     ├─ Firestore states/{uid} ──onSnapshot 实时同步 + 离线缓存（IndexedDB）（免费计划可用）
     └─ Cloudflare Worker（worker/ai-proxy.js，免费计划）：
         ├─ POST /deepseek → 调 DeepSeek；密钥=Worker 环境变量；校验 Firebase ID Token（仅登录用户）
         └─ GET  /status   → 密钥是否已配置
```

## 一次性准备（约 15 分钟，只需做一次）

### 1. 创建 Firebase 项目
1. 打开 <https://console.firebase.google.com>，用 Google 账号登录 → 添加项目（如 `jobhunt-ops`）；
2. 项目内左侧 **构建 → Authentication → 开始使用 → 登录方式**：启用 **电子邮件/密码**（可保持"允许新建用户"开启，或创建好账号后关闭防止他人注册）。

### 2. 注册你的 Web 应用并拿到公网配置
1. 项目设置（齿轮）→ **常规 → 你的应用 → Web 应用**（`</>` 图标）→ 注册（名称随意，如 `jobhunt-web`）；
2. 复制控制台显示的配置对象（apiKey / authDomain / projectId / storageBucket / messagingSenderId / appId）；
3. 在项目根目录：`复制 .env.example 为 .env`，把六个 `VITE_FIREBASE_*` 填上（**这些是公网配置，不是机密**，但只有填了才会启用云同步）。

### 3. 创建 Firestore 数据库
1. 左侧 **构建 → Firestore Database → 创建数据库**（生产模式）；
2. 位置选就近（如 `asia-east1`）；
3. 部署规则（仓库已带 `firestore.rules`，只允许用户读写自己的 `states/{uid}`）：
   ```bash
   npm i -g firebase-tools        # 全局安装 Firebase CLI
   firebase login                 # 浏览器授权（仅首次）
   firebase use --add             # 选择刚创建的项目（或复制 .firebaserc.example 为 .firebaserc 填项目ID）
   firebase deploy --only firestore:rules
   ```

### 4. 部署 AI 代理（Cloudflare Worker，免费）

1. 打开 <https://dash.cloudflare.com> 注册/登录（免费计划**不需要信用卡**）；
2. 左侧 **Workers & Pages → 创建 → 创建 Worker**，名称填 `jobhunt-ai-proxy`（任意），点击**部署**；
3. 点 **编辑代码**，把编辑器里的内容**全部删掉**，粘贴仓库 `worker/ai-proxy.js` 的完整代码，点 **部署**；
4. 回到 Worker 页面 → **设置 → 变量和机密**：
   - 点 **添加机密**：变量名 `DEEPSEEK_API_KEY`，值填你的 DeepSeek API 密钥（保存后不可再查看，只能覆盖）；
   - 点 **添加变量**：变量名 `FIREBASE_API_KEY`，值填你 `.env` 里 `VITE_FIREBASE_API_KEY` 那串（`AIzaSy...`，公网配置）；
   - 保存后**重新部署**一次 Worker（变量才会生效）；
5. 记下 Worker 的访问网址（形如 `https://jobhunt-ai-proxy.<你的子域>.workers.dev`）：
   - 打开 `.env`，把 `VITE_AI_PROXY_URL=` 后面填上这个网址，保存；
6. 重新构建发布（见第 6 步 `npm run deploy`）后，AI 即可用。

> 密钥边界：`DEEPSEEK_API_KEY` 只存在于 Worker 环境变量（浏览器接触不到）；Worker 校验 Firebase 登录令牌，未登录用户无法调用（防止他人刷你的 DeepSeek 额度）。

## 发布正式版（真实数据版）

```bash
npm run deploy        # = npm run build（真实种子 + Firebase 配置）+ firebase deploy --only hosting,firestore:rules
```

> 免费 Spark 计划下 `deploy` 脚本**只部署网站与 Firestore 规则**（云函数需付费计划，已由 Cloudflare Worker 替代）。
> 部署内容包括：静态站点（`dist/`，含 SPA 回退）→ Firestore 规则。完成后你会得到 `https://<project>.web.app` 或自定义域名。

部署内容包括：静态站点（`dist/`，含 SPA 回退）→ Firestore 规则。完成后你会得到 `https://<project>.web.app` 或自定义域名。

## 使用流程（跨设备同步）

1. 任意设备打开网站 → 右上角 **登录 / 注册** → 注册邮箱密码；
2. 首次登录且云端无数据时，点 **上传本机数据** 开始同步（推荐先在一台设备上导入旧备份/录入数据再登录）；
3. 之后所有改动自动同步：手机改一笔投递，电脑几秒内可见；断网时本地照常用（IndexedDB 缓存），恢复联网自动补传。

## 数据迁移（从旧版 / 展示版）

- 旧版数据在本机 localStorage：`/data` 页 **导出 JSON 备份** → 新站登录后 `/data` 页 **导入**，或直接"上传本机数据"；
- 展示版（Netlify/Cloudflare）是另一个网站的 localStorage，与本项目互不影响；展示版继续提供演示体验（不会连你的 Firebase）。

## 本地开发

```bash
npm run dev           # 本地模式：不登录 = 纯本地（无需 Firebase 配置也能跑）
npm run dev:full      # 本地 + DeepSeek 本地代理（8802），AI 走本地路径
npm run build         # 生产构建（真实数据 + 云同步 + 云端 AI，公网即真实工具）
```

- 开发环境 AI 走本地代理（`fetch /api/ai/deepseek`），生产环境走 Cloudflare Worker（`VITE_AI_PROXY_URL`），代码自动区分；
- 想连真实 Firebase 调试：`.env` 填好配置后 `npm run dev` 即可（Auth/Firestore 直接用云端，无需模拟器）。

## 安全说明（与三条红线的关系）

| 红线 | 第二阶段如何守住 |
|---|---|
| 数据真实 | 云端存的就是你的真实状态；本地 localStorage 仍保留一份作为备份 |
| 本地持久化 | 升级为"本地 + 云端"双写：Firestore 离线缓存（IndexedDB）保证断网可用 |
| 确认后写入 | AI 仍只生成草稿、确认才写入；同步只上传你自己的编辑（Firestore 规则保证只能读写自己的文档） |

- 密钥边界：`DEEPSEEK_API_KEY` 只出现在本地代理 `.env`（本地开发）与 Cloudflare Worker 环境变量（生产）；浏览器代码门禁 36 项（`npm run verify`）自动检查；
- 云端数据由 Google 托管（传输 TLS、静止加密）；请勿把账号密码分享给他人。

## 故障排查

- **登录报"云端未配置"**：`.env` 没填 `VITE_FIREBASE_*`（所有构建均启用云端，填好配置后重新构建部署即可）；
- **AI 报"云端 AI 未配置"**：Worker 没部署，或 `.env` 的 `VITE_AI_PROXY_URL` 没填/填错（填完需重新 `npm run deploy`）；
- **AI 报"需要先登录"**：真实 DeepSeek 仅登录用户可用，右上角登录后再试；
- **AI 报"密钥无效"（AUTHENTICATION_FAILED）**：Worker 里 `DEEPSEEK_API_KEY` 填错 → Worker → 设置 → 变量和机密 → 覆盖该机密 → 重新部署；
- **同步异常**：检查 Firestore 规则是否已部署（`firebase deploy --only firestore:rules`）、浏览器网络；
- **改了 Worker 不生效**：Worker → 编辑代码 → 部署（或右上角"保存并部署"）后再试。

## 预算

全部免费：Firebase Spark 计划（无需信用卡，Firestore 1 GiB 存储 / 5 万读 / 2 万写每天、Hosting 10 GB，超限自动停止不扣费）+ Cloudflare Worker 免费计划（10 万次请求/天）。个人使用绰绰有余。

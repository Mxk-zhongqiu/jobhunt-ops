# 第二阶段：Firebase 云端化上线指南（认证 + 跨设备同步 + AI 上云）

把求职作战台升级为**真正可持续使用的在线产品**：邮箱密码注册登录、数据存云端 Firestore（手机/电脑登录同一账号自动同步、断网可用）、DeepSeek 密钥存云端函数环境变量。

架构：

```
浏览器（React SPA）
 ├─ 未登录：本地模式（localStorage，与原版一致）
 └─ 登录后：
     ├─ Firebase Auth（邮箱密码）→ 会话由 Google 托管
     ├─ Firestore states/{uid} ──onSnapshot 实时同步 + 离线缓存（IndexedDB）
     └─ Cloud Functions（asia-east1）：
         ├─ deepseekProxy  → 调 DeepSeek，密钥=环境变量（secret），仅登录用户可用
         └─ deepseekStatus → 密钥是否已配置
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

### 4. 部署 AI 云函数（密钥只存在云端）
```bash
cd functions && npm install && cd ..          # 安装云函数依赖
firebase functions:secrets:set DEEPSEEK_API_KEY   # 粘贴你的 DeepSeek 密钥（存 Google Secret Manager）
firebase deploy --only functions              # 部署 deepseekProxy / deepseekStatus
```
> `functions/index.js` 通过 `secrets: ["DEEPSEEK_API_KEY"]` 挂载密钥，函数运行时会注入到 `process.env`；**浏览器永远接触不到**。

## 发布正式版（真实数据版）

```bash
npm run deploy        # = npm run build（真实种子 + Firebase 配置）+ firebase deploy
```

部署内容包括：静态站点（`dist/`，含 SPA 回退）→ Firestore 规则 → 云函数。完成后你会得到 `https://<project>.web.app` 或自定义域名。

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
npm run dev:full      # 本地 + DeepSeek 本地代理（8787），AI 走本地路径
npm run build:demo    # 公网展示版（虚构数据 + 无云同步 + 仅 Mock AI）——依然可用
```

- 开发环境 AI 走本地代理（`fetch /api/ai/deepseek`），生产环境走云函数（`httpsCallable`），代码自动区分；
- 想连真实 Firebase 调试：`.env` 填好配置后 `npm run dev` 即可（Auth/Firestore 直接用云端，无需模拟器）。

## 安全说明（与三条红线的关系）

| 红线 | 第二阶段如何守住 |
|---|---|
| 数据真实 | 云端存的就是你的真实状态；本地 localStorage 仍保留一份作为备份 |
| 本地持久化 | 升级为"本地 + 云端"双写：Firestore 离线缓存（IndexedDB）保证断网可用 |
| 确认后写入 | AI 仍只生成草稿、确认才写入；同步只上传你自己的编辑（Firestore 规则保证只能读写自己的文档） |

- 密钥边界：`DEEPSEEK_API_KEY` 只出现在本地代理 `.env`（本地开发）与云端函数 secret（生产）；浏览器代码门禁 26 项（`npm run verify`）自动检查；
- 云端数据由 Google 托管（传输 TLS、静止加密）；请勿把账号密码分享给他人。

## 故障排查

- **登录报"云端未配置"**：`.env` 没填 `VITE_FIREBASE_*`，或用了 `npm run build:demo` 产物（展示版禁云）；
- **AI 报"云端 AI 未配置"**：云函数没部署，或没执行 `functions:secrets:set`；
- **AI 报"需要先登录"**：真实 DeepSeek 仅登录用户可用，右上角登录后再试；
- **同步异常**：检查 Firestore 规则是否已部署（`firebase deploy --only firestore:rules`）、浏览器网络；
- **改了云函数不生效**：`cd functions && npm install && firebase deploy --only functions`。

## 预算

Firebase 免费 Spark 计划（无需信用卡）：Firestore 1 GiB 存储 / 5 万读 / 2 万写每天、Functions 200 万次/月、Hosting 10 GB —— 个人使用绰绰有余；超限会自动停止而非扣费。

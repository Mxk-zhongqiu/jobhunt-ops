# 求职作战台（jobhunt-ops）· 项目说明与开发手册

> 本文件是项目的**完整交接文档**：任何新会话/新开发者读此文件即可完整了解项目并继续开发。
> 配套快速入口：`README.md`（对外说明）；本文档（对内开发手册）。

---

## 0. 一句话定位

**jobhunt-ops（求职作战台）** 是 2026 届量化秋招的个人作战系统：投递追踪、十周计划、两个量化项目、知识体系、面试记录、AI 助手、数据备份，全部数据**真实、本地持久化**。它不是演示框架——每一条数据都对应真实的投递、面试与产出。

---

## 1. 项目背景（为什么存在）

- **前身**：`F:\MyWorld`（自由世界成长系统）是一个"个人生活观测"框架，六现实领域（工作/事业/发展/健康/睡眠/财务）+ Mock 数据 + **明确不持久化**。结论：与真实求职场景错位，属"空中楼阁"。
- **决策**：2026-08-18 完成成本分析后**从头新建**本仓库（重构代价 ≈ 从零，且会继承错误领域模型与文档债务）。仅复用旧项目的工程模式（repository/selector 思想、AI 安全代理架构、验证门禁文化）。
- **设计哲学（三条红线）**：
  1. **数据真实**：种子数据即真实初始清单（来自《求职规划内部文档》），非演示数据；
  2. **本地持久化**：一切状态实时写入 localStorage（刷新不丢）；
  3. **确认后写入**：AI 只生成草稿，写入正式数据必须用户确认。

---

## 2. 技术栈与环境

| 项 | 值 | 备注 |
|---|---|---|
| 前端 | React 19 + TypeScript(strict) + Vite 6 | |
| 路由 | React Router 7（createBrowserRouter） | |
| 图标 | lucide-react | |
| 样式 | **原生 CSS**（`src/styles/globals.css`，无 UI 框架） | 保持轻量 |
| 包管理 | **npm**（本机无 pnpm） | 锁文件 `package-lock.json` |
| 前端端口 | **8788** | 见 §10.1 端口问题 |
| AI 代理端口 | **8787**（127.0.0.1） | `server/deepseek-proxy.mjs` |
| Node | v22+ | |

---

## 3. 仓库结构与文件地图

```text
F:\jobhunt-ops\
├── index.html                  # 入口 HTML（zh-CN，标题"求职作战台 · 2026 秋招"）
├── package.json                # 脚本：dev / dev:full / ai:proxy / build / build:demo / deploy / preview / verify / state:*
├── vite.config.ts              # host=127.0.0.1, port=8788, proxy /api/ai → 127.0.0.1:8787, base="./", firebase manualChunks
├── tsconfig.json / app / node  # TS 严格模式工程引用
├── .env.example                # DEEPSEEK_* 本地密钥模板 + VITE_FIREBASE_* 公网配置模板
├── .gitignore                  # 含 .env / .env.*.local / functions/node_modules / .firebase（密钥绝不入库）
├── firebase.json               # Firebase Hosting（SPA 回退）+ Firestore 规则 + Functions 配置
├── firestore.rules             # ★ 只允许用户读写自己的 states/{uid}
├── .firebaserc.example         # Firebase 项目 ID 模板（复制为 .firebaserc 或 firebase use --add）
├── README.md                   # 对外说明（含本手册链接）
├── docs/
│   ├── PROJECT_HANDBOOK.md     # ★ 本文档
│   ├── DEPLOY.md               # ★ 公网展示版部署指南（第一阶段，见 §13）
│   └── FIREBASE_SETUP.md       # ★ 第二阶段云端化上线指南（见 §14）
├── server/
│   └── deepseek-proxy.mjs      # ★ DeepSeek 本地安全代理（密钥只在此侧，开发用）
├── functions/                  # ★ Firebase 云函数（备选方案，需 Blaze 付费计划，见 §14.1）
│   ├── package.json            # firebase-functions / firebase-admin，node 20
│   └── index.js                # deepseekProxy / deepseekStatus（密钥=云端 secret）
├── worker/
│   └── ai-proxy.js             # ★ Cloudflare Worker AI 代理（默认方案，免费；密钥=Worker 环境变量 + 登录令牌校验，见 §14）
├── scripts/
│   ├── dev-full.mjs            # 一条命令：AI 代理 + Vite（透传 vite 参数）
│   ├── verify-ai.mjs           # ★ AI 安全门禁（36 项字符串检查，见 §7.5 / §14.4）
├── public/
│   └── _redirects              # SPA 路由回退（Netlify / Cloudflare Pages）
└── src/
    ├── main.tsx                # React 挂载
    ├── app/
    │   ├── App.tsx             # AppDataProvider + AppShell + Outlet
    │   └── router.tsx          # 9 条路由（见 §6）
    ├── components/
    │   ├── layout/AppShell.tsx # 侧边栏(9项) + 顶栏（含账号组件）+ 当前周徽章
    │   ├── auth/AuthWidget.tsx # ★ 登录/注册弹窗 + 同步状态 + 上传本机数据（见 §14）
    │   └── ai/AIWorkspace.tsx  # ★ AI 助手（能力/上下文授权/草稿确认）
    ├── pages/                  # 9 个页面（见 §6）
    │   ├── OverviewPage.tsx
    │   ├── ApplicationsPage.tsx
    │   ├── PlanPage.tsx
    │   ├── ProjectsPage.tsx
    │   ├── KnowledgePage.tsx
    │   ├── InterviewsPage.tsx
    │   ├── QuestionBankPage.tsx
    │   ├── AIPage.tsx
    │   └── DataPage.tsx
    ├── data/seed.ts            # ★ 种子数据（真实初始清单；零顶层副作用，所有构建均使用）
    ├── data/demoSeed.ts        # ★ 「游客预览」演示数据（虚构，仅 appStore.previewDemo 使用）
    ├── store/appStore.tsx      # ★ 状态 + localStorage 持久化 + 云同步（Firestore）+ 派生工具（见 §14）
    ├── services/
    │   ├── firebase.ts         # ★ Firebase 初始化/认证/错误映射（未配置 .env 时整模块禁用）
    │   └── ai/                 # ★ AI 服务层（见 §7）
    │       ├── index.ts        # createAIService 工厂
    │       ├── context.ts      # buildAIContextSummary
    │       ├── MockAdapter.ts  # 本地规则（不联网）
    │       └── DeepSeekAdapter.ts  # 开发走本地代理 / 生产走云函数 + 响应校验
    ├── types/
    │   ├── domain.ts           # ★ 数据契约（见 §4）
    │   └── ai.ts               # AI 契约（见 §7）
    ├── utils/io.ts             # 下载/CSV/备份校验/isAppState
    ├── utils/questionBank.ts   # 面试题库汇总（拆分/规范化去重/频率排序/Markdown 生成）
    └── styles/globals.css      # 全部样式（含 AI 工作区、数据管理页、面试题库、账号组件）
```

---

## 4. 领域模型（`src/types/domain.ts`）

### 4.1 对象清单

| 对象 | 关键字段 | 说明 |
|---|---|---|
| `Application` 投递 | company, tier(冲刺/主攻/保底), channel(官网/牛客/应届生/学校就业网/内推/实习转正/其他), position, positionKind(量化研究/量化开发/金融科技/数据分析/风控/其他), **status 状态机**, deadline, appliedAt, url, note, nextAction | 核心对象，见状态机 |
| `InterviewLog` 面试记录 | company, round(笔试/一面/二面/终面/HR面), date, **questions**(换行分隔), **review**(复盘，AI 确认后写入), nextAction | |
| `WeeklyPlan` 周计划 | week(1–10), label, tasks[] | tasks 为 `PlanTask{id,text,done}` |
| `QuantProject` 项目 | name, goal, status(active/paused/done), milestones[], output(GitHub/报告链接) | |
| `ProjectMilestone` 里程碑 | title, status(pending/active/done), targetDate | |
| `KnowledgeTopic` 知识主题 | category(数学/统计、编程、金融与量化、机器学习、面试准备), name, priority(高频/必考/加分), status(未开始/学习中/已掌握) | |
| `AppSettings` 设置 | targetName, **startDate**(周次基准), dailySubmitTarget, totalTarget, **aiProvider**(mock/deepseek) | |
| `AppState` 总状态 | 以上全部集合 + `questionBankMastered`(string[]，已掌握题目的规范化键) | 整个对象被序列化持久化 |

### 4.2 投递状态机

```text
计划投递 → 已投递 → 笔试 → 一面 → 二面 → 终面 → Offer
                          └──────────┴──────┴─────→ 已拒绝 / 放弃
```
状态由页面下拉直接切换；"标记已投"按钮把 计划投递 → 已投递 并写入 appliedAt。

### 4.3 派生工具（`store/appStore.tsx` 底部导出）

| 函数 | 作用 |
|---|---|
| `currentWeek(settings, today?)` | `floor((today-startDate)/7)+1`，钳制 1–10 |
| `activeApplications(apps)` | 状态 ∈ 已投递/笔试/一面/二面/终面 |
| `interviewApplications(apps)` | 状态 ∈ 一面/二面/终面 |
| `projectProgress(project)` | 已完成里程碑 / 总数 × 100 |
| `planTasks(plan?)` | 取周任务数组 |

---

## 5. 架构与数据流

```
页面组件 ── useAppData() ──▶ AppStoreValue（state 字段 + action 方法）
                                │
                     useReducer(reducer, loadState)
                                │
              loadState(): seed ──merge──▶ localStorage("jobhunt-ops-state-v1")
                                │
        每次 state 变化 → useEffect → JSON.stringify 全量写回 localStorage
```

- **唯一持久化点**：`localStorage` 键 `jobhunt-ops-state-v1`。
- **种子合并**：`mergeState(seed, stored)`——加载时用种子兜底、以存储覆盖（`settings` 做浅合并，因此新增设置字段对老用户自动生效）。
- **新增能力套路**：① 在 `domain.ts` 加字段/对象 → ② `seed.ts` 补初始值 → ③ `appStore.tsx` 加 action 类型 + reducer 分支 + 接口方法 + value 实现 → ④ 页面消费。**勿忘 ③ 的四处都要加**（类型联合 / reducer / AppStoreValue 接口 / useMemo value）。
- **序列化安全**：只有纯数据字段进状态；方法不落盘（`DataPage` 导出时显式只挑数据字段）。

---

## 6. 功能清单（9 页面）

| 路由 | 页面 | 核心功能 |
|---|---|---|
| `/` | 作战总览 | 4 指标卡（已投/推进中/面试/Offer）+ 投递漏斗（9 状态计数）+ 本周重点（可勾选）+ 7 天内截止（红字紧急）+ 项目推进条 |
| `/applications` | 投递追踪 | 快速录入表单（6 字段+链接）+ 状态/分层筛选 + 清单表格（内联改状态、标记已投、删除） |
| `/plan` | 周计划 | W1–W10 页签 + 任务勾选/增删 + 进度条 + 节奏提醒卡（文档金句） |
| `/projects` | 项目 | 项目1（多因子，7 里程碑）、项目2（配对交易/ML，5 里程碑）；里程碑勾选、进度、交付链接 |
| `/knowledge` | 知识 | 5 分类分组 + 优先级徽章 + 三态进度；顶部统计 |
| `/interviews` | 面试记录 | 记录表单（公司/轮次/日期/问题/复盘）+ 卡片列表 |
| `/question-bank` | 面试题库 | 从面试记录自动汇总去重（每题一行），按出现次数排序，高频(≥2次)标记，勾选已掌握（持久化），导出 Markdown 背诵文档 |
| `/ai` | AI 助手 | 见 §7 |
| `/data` | 数据管理 | JSON 全量导出 / 投递 CSV 导出（带 BOM）/ 文件导入（校验+预览+覆盖）/ 重置种子 |

侧边栏 9 项导航，顶栏显示当前页标题与日期；无独立设置页，`targetName/startDate/投递目标` 改 `seed.ts` 的 `settings`（或后续加设置页）。

---

## 7. AI 助手子系统

### 7.1 能力（`src/types/ai.ts`）

| 能力 | 行为 | 写入？ |
|---|---|---|
| `ask` 知识问答 | 基于授权上下文回答 | 否（确认已读） |
| `review` 面试复盘草稿 | 生成总结/做得好/不足/下一步 | **是**：确认后 `updateInterview(id,{review:...})` 写入所选面试记录 |
| `resume` 简历要点翻译 | 经历原文 → 量化岗语言 + 关键词 | 否（可复制） |

### 7.2 数据流

```
AIWorkspace（选提供商 → 选能力 → 勾选上下文/复盘对象 → 输入要求）
   └─ service.generate({capability, context, userInstruction})
        ├─ MockAdapter（本地规则，300ms 假延迟，不联网）
        └─ DeepSeekAdapter → fetch("/api/ai/deepseek")
                └─(Vite proxy)→ 127.0.0.1:8787（server/deepseek-proxy.mjs）
                        └─ DeepSeek Chat Completions（json_object, thinking disabled）
   → AIProposal（含 contextSummary / payload / 状态 draft）
   → ProposalReview：可编辑 → 确认/拒绝/重来
```

### 7.3 安全模型（继承旧项目架构，勿破坏）

1. **密钥只在服务端**：`.env` 的 `DEEPSEEK_API_KEY` 只被 `server/deepseek-proxy.mjs` 读取；浏览器代码不含密钥字面量；
2. **最小上下文**：`DeepSeekAdapter.authorizedContext` 只裁剪**用户显式勾选**的 id 且只带最小字段（问题/复盘、公司/状态、主题名等），不发送全量数据；
3. **响应本地校验**：`parsePayload` 校验 kind 与能力匹配、字段类型合法，非法即拒绝（`INVALID_PROVIDER_RESPONSE`）；
4. **确认才写入**：`accept()` 内才有 `updateInterview` 等正式写入；拒绝不产生对象；
5. **代理防护**：绑定 127.0.0.1、JSON Output、上下文/输出上限、超时+一次有限重试（仅 429/500/503）、调用日志不含正文；
6. **降级**：默认 Mock；真实请求失败可一键"改用本地 Mock"。

### 7.4 提供商切换

- 设置 `AppSettings.aiProvider`（默认 `"mock"`），AI 页面右上角切换并持久化；
- 真实 DeepSeek：复制 `.env.example` → `.env` 填 `DEEPSEEK_API_KEY` → `npm run dev:full` → 切 "DeepSeek 真实 API"；状态栏显示"已配置/未配置密钥"（`getDeepSeekStatus` → `/api/ai/status`）。

### 7.5 验证门禁（`npm run verify`，17 项，改动相关文件后必须通过）

1. API 密钥使用服务端环境变量（`.env.example` 无 VITE_ 前缀）
2. 真实 `.env` 已被 `.gitignore` 忽略
3. 代理只绑定本机回环地址 `127.0.0.1`
4. 浏览器代码不包含 `DEEPSEEK_API_KEY` 字面量
5. 代理使用 Bearer 鉴权
6. 结构化草稿启用 JSON Output + 中文 JSON 指令
7. 代理限制上下文与输出规模（maxContextCharacters / max_tokens）
8. 代理实现超时与有限重试（AbortController / attempt<2 / timeoutMs）
9. 仅重试限流和服务端故障（`[429,500,503]`）
10. 调用日志不保存上下文正文
11. DeepSeekAdapter 只裁剪显式勾选对象（interviewIds/applicationIds/topicIds/projectIds 的 includes 过滤）
12. DeepSeek 响应经过本地类型校验（parsePayload）
13. 前端只调用本地代理（`fetch("/api/ai/deepseek"`，无 api.deepseek.com）
14. AIService 工厂支持 Mock 与 DeepSeek
15. 提供商默认 Mock 且可切换（seed `aiProvider:"mock"` + UI "改用本地 Mock"）
16. 正式写入只在确认分支（`const accept` 出现在 `updateInterview(` 之前）
17. Vite 仅代理本地 AI 路径（`/api/ai` → 127.0.0.1:8787）

---

## 8. 数据管理（`/data`）

- **导出 JSON**：`downloadText` 生成 `jobhunt-ops-backup-日期.json`，全量状态（不含方法）；
- **导出 CSV**：`applicationsToCsv`（BOM + 引号转义，Excel 直接打开），11 列投递明细；
- **导入**：`isAppState` 校验结构（六数组 + settings 对象）→ 预览计数 → `window.confirm` → `restoreState` 整状态替换；
- **重置**：`createSeedState()` 覆盖（二次确认）。
- 工具在 `src/utils/io.ts`。

---

## 9. 开发命令

```bash
npm install          # 安装依赖（锁文件 package-lock.json）
npm run dev          # 仅前端 → http://127.0.0.1:8788（未配置 Firebase 时=本地模式）
npm run dev:full     # ★ 本地推荐：AI 代理(8787) + 前端(8788) 一条命令
npm run dev:full -- --port 8789   # 换端口（dev-full 透传 vite 参数）
npm run ai:proxy     # 只起代理
npm run build        # 生产构建：tsc -b（严格检查） + vite build → dist/（真实种子数据 + Firebase 云同步）
npm run build:demo   # 与 build 相同（兼容别名）
npm run deploy       # ★ 正式发布：build + firebase deploy --only hosting,firestore:rules（免费计划不含 functions）
npm run preview      # 预览构建产物
npm run verify       # ★ AI 安全门禁 36 项（改动 AI/云函数后必跑）
cd functions && npm install && cd ..   # 云函数依赖（仅 Blaze 备选方案需要）
# 云端密钥（默认方案 Cloudflare Worker）：控制台 → Worker → 设置 → 变量和机密 → 机密 DEEPSEEK_API_KEY
```

---

## 10. 已知问题与决策记录（改代码前必读）

1. **端口**：5173 落在本机 Windows 保留端口段（Hyper-V 保留 5141–5240，`netsh interface ipv4 show excludedportrange protocol=tcp` 可查），绑定即 EACCES。因此前端用 **8788**、AI 代理 **8787**，且 `vite.config.ts` 显式 `host:"127.0.0.1"`（避开 ::1）。**不要改回 5173**；换端口用 `--port` 参数。
2. **年份差异**：秋招文档快照写 "2025-08-18"，而本机系统时钟为 2026-08-18。种子 `settings.startDate="2026-08-18"` 使"今天=第 1 周"成立。若实际日期不同，改 startDate 即自动校准周次。
3. **持久化语义**：未登录时 localStorage 是唯一存储（清浏览器数据即丢数据，`/data` 导出备份是刚需）；登录后本地 + 云端 Firestore 双写（云端为真、本地为备份，见 §14）。新增字段走 `mergeState`（settings 浅合并，数组以存储为准）；云端文档整份覆盖（`replace-state`），字段缺失有兜底。
4. **seed 是真实数据**：12 家冲刺层公司、W1–W10、两个项目、24 个知识主题均来自策略文档，可自由增删改，但**已初始化过 localStorage 的用户不会自动拿到 seed 改动**（数组以存储为准）；如需推送新种子，需在 merge 逻辑或版本迁移上处理。
5. **验证脚本是字符串检查**：`verify-ai.mjs` 依赖特定字符串（如 `attempt < 2`、`updateInterview(` 等），重构成其他写法会误报/漏报，改动后跑 `npm run verify` 确认（当前 36 项）。
6. **dev 服务器在本沙箱内无法监听端口**（EACCES），冒烟测试只能在用户本机做；构建（tsc+vite）可在任意环境验证。
7. **旧项目归档**：`F:\MyWorld` 保持不动，仅作架构参考（repository/selector、AI 代理、验证门禁三样可借鉴）。

---

## 11. 路线图与下一步

已交付：MVP 底座（8 页面+持久化）→ 数据导入导出 → AI 助手（问答/复盘/简历翻译/知识点生成）→ 高频面试题库自动汇总（`/question-bank`）→ 知识模块细化（主题下知识点项 + 展开学习 + 导出）→ Firebase 云端化（认证 + Firestore 跨设备同步 + AI Worker）→ **公网真实版**（2026 决策：公网 = 真实工具测评，真实数据 + 云同步 + 云端 AI，见 §13 / `docs/DEPLOY.md`）。

待办（按价值排序）：

- [x] **高频面试题库自动汇总**（已完成）：从 `InterviewLog.questions` 汇总去重，生成可背诵的题库文档（可导出 Markdown）；
- [ ] 投递状态变化时间线：记录每次状态变更时间，统计各阶段耗时；
- [ ] 简历版本管理：版本化保存简历要点与投递版本映射；
- [ ] CSV 导入（从 Excel 批量录入投递）；
- [ ] 设置页：startDate/投递目标/称呼 可视化配置（当前在 seed）；
- [ ] 投递"下一步行动"提醒（nextAction + 日期）。

---

## 12. 新会话快速上手指引（给接手开发的 Agent）

1. **先读**：`README.md` → 本文档 §4/§5/§7（模型/数据流/AI）→ 再看要改的页面文件；
2. **环境**：代码在 `F:\jobhunt-ops`（npm 项目）；本机 Node v22；端口 8788/8787；
3. **改前验证**：`npm run build` 必须通过（strict TS）；涉及 AI 的文件改动后 `npm run verify`；
4. **改动套路**：见 §5"新增能力套路"；保持红线（本地持久化 / 确认后写入 / 账号数据隔离 + AI 白名单）；
5. **提交规范**：`git add -A && git commit`（local 签名，仓库已初始化 main 分支，4 个历史提交可参考）；
6. **协作入口**：GUI 侧边栏工作区浏览器中 jobhunt-ops 是独立工作区（`F:\jobhunt-ops`），本会话文件操作可用绝对路径直达。

---

## 13. 公网部署（真实工具测评版，见 `docs/DEPLOY.md` 操作指南）

### 13.1 公网 = 真实工具（2026 决策）

| 层次 | 公网版处理 |
|---|---|
| 界面 | `npm run build` 构建（`dist/`），`firebase deploy --only hosting` 发布到 `https://jobhunt-ops.web.app`（或 Netlify / Cloudflare Pages） |
| 数据 | **真实种子数据**进入所有构建；虚构演示数据仅保留为应用内「游客预览」开关（`appStore.previewDemo`，截图/内容展示用，不写本地与云端） |
| AI 服务 | Cloudflare Worker 代理（`worker/ai-proxy.js`），密钥存 Worker 环境变量、校验登录令牌；**建议配置 `AI_ALLOWED_EMAILS` 邮箱白名单**防止公网账号刷 DeepSeek 额度 |
| 数据同步 | Firebase Auth 登录 → Firestore `states/{uid}` 跨设备同步（规则仅本人可读写）；未登录 = 本地模式 |

### 13.2 历史数据隔离机制（已移除）

- 曾经的 `__DEMO_MODE__` define 与 `scripts/verify-seed.mjs` 种子隔离门禁已随"公网=真实版"决策**删除**（vite.config.ts / package.json / vite-env.d.ts / verify-seed.mjs 均已清理）；`build:demo` 保留为兼容别名；
- 仍保留的工程约束：`seed.ts` 与 `demoSeed.ts` 保持"零顶层副作用"（顶层只有函数/纯常量声明），模块纯净便于 Rollup 摇树与测试。

### 13.3 数据安全边界

- Firestore `states/{uid}` 规则只允许本人读写；DeepSeek 密钥只在服务端（Worker 环境变量 / 本地代理进程），浏览器接触不到（`npm run verify` 36 项门禁）；
- 公网测评期注意：任何注册用户都能看到**自己的**数据（互不可见）；AI 额度消耗需用 `AI_ALLOWED_EMAILS` 白名单收口。

---

## 14. 云同步（第二阶段，Firebase，详见 `docs/FIREBASE_SETUP.md`）

### 14.1 架构

```
浏览器（React SPA）
 ├─ 未登录：本地模式（localStorage，与原版一致，seed 兜底）
 └─ 登录后：
     ├─ Firebase Auth（邮箱密码）→ 会话由 Google 托管
     ├─ Firestore states/{uid} ──onSnapshot 实时同步 + IndexedDB 离线缓存（多标签页）
     └─ Cloudflare Worker（worker/ai-proxy.js，免费计划）：
         ├─ POST /deepseek → 调 DeepSeek（密钥 = Worker 环境变量 env.DEEPSEEK_API_KEY；校验 Firebase ID Token，仅登录用户）
         └─ GET  /status   → 密钥是否已配置
```

- 数据模型不变：每个用户一个文档 `states/{uid}`，字段 `{ data: AppState, updatedAt: serverTimestamp }`（1 MiB 文档上限内，个人数据量绰绰有余）；
- Firestore 规则 `firestore.rules`：只允许 `request.auth.uid == uid` 读写，用户之间天然隔离；
- **为什么不用 Firebase Cloud Functions**：函数构建依赖 Cloud Build，免费 Spark 计划不允许（需升级 Blaze 绑卡）。AI 代理改用 Cloudflare Worker（免费 10 万次/天）。仓库 `functions/` 保留为 Blaze 用户的备选方案（需改回 `httpsCallable` 路径）。

### 14.2 客户端同步实现（`src/store/appStore.tsx` + `src/services/firebase.ts`）

- **开关**：`firebaseEnabled = !__DEMO_MODE__ && 已填 VITE_FIREBASE_*`——展示版与未配置环境自动禁用云能力，退回本地模式；
- **登录监听**：`subscribeAuth`（onAuthStateChanged）→ 登出时清空远端引用，回到本地模式；
- **快照订阅**：登录后 `onSnapshot(states/{uid})`，`snapshot.metadata.hasPendingWrites` 跳过自己刚写入的回显；远端无文档 → `cloudEmpty=true`（顶栏出现"上传本机数据"）；远端有文档 → `isAppState` 校验后 `replace-state` 整状态覆盖；
- **防抖上传**：状态变化 600ms 后 `setDoc`（`merge:true` + serverTimestamp）；`lastRemoteJson` 记录已应用的远端 JSON，与当前状态一致时不写回，**避免同步死循环**；
- **离线**：IndexedDB 持久化（`persistentLocalCache` + 多标签页），断网照常用、恢复后自动补传；
- **并发语义**：多设备最后写入者胜（serverTimestamp 排序），个人工具可接受；旧备份字段缺失由 `replace-state` 兜底（`questionBankMastered ?? []`）。

### 14.3 AI 双路径（`src/services/ai/DeepSeekAdapter.ts`）

| 环境 | 路径 | 密钥位置 |
|---|---|---|
| 开发（`import.meta.env.DEV`） | `fetch("/api/ai/deepseek")` → Vite 代理 → 本地代理 8787 | `.env`（本机） |
| 生产 | `fetch(VITE_AI_PROXY_URL + "/deepseek")` → Cloudflare Worker | Worker 环境变量 |

- 生产路径要求登录：`getIdToken()` 取 Firebase ID Token 放 `Authorization: Bearer`；Worker 用 identitytoolkit `accounts:lookup` 校验（无需 Admin SDK）；错误码直接透传（AUTH_REQUIRED / AI_NOT_CONFIGURED_CLOUD / RATE_LIMITED…）；
- **真实 DeepSeek 仅登录用户可用**（Worker 校验令牌，防止他人刷你的额度）；未登录点 DeepSeek 会提示"需要先登录"；
- `getDeepSeekStatus` 生产走 `GET {base}/status`（无需登录，只暴露是否已配置）。

### 14.4 门禁与安全（勿破坏）

- `npm run verify` 现为 **36 项**：本地代理 17 项 + 云函数 9 项（`functions/` 备选方案仍检查）+ **Worker 10 项**（密钥只用 `env.` / 校验登录令牌 / 浏览器转发令牌 / Bearer 调 DeepSeek / JSON Output / 限流 / 超时重试 / 仅重试 429,500,503 / 不记录正文 / CORS）+ "浏览器代码不含密钥名"（UI 文案里不要出现 `DEEPSEEK_API_KEY` 字面量）；
- Worker 密钥：控制台 → Worker → 设置 → 变量和机密 → **机密** `DEEPSEEK_API_KEY`（保存后不可见）；另需普通**变量** `FIREBASE_API_KEY`（公网配置，用于令牌校验）；改完必须**重新部署** Worker 才生效；
- 包体积：firebase SDK 单独 manualChunks（`firebase-*.js` ~192KB gz），独立缓存；后续可用动态 import 让展示版进一步瘦身。

### 14.5 运维要点

- 部署：`npm run deploy` = build + `firebase deploy --only hosting,firestore:rules`（**免费计划不含 functions**；云函数部署需 Blaze，已由 Worker 替代）；
- 免费额度：Firebase Spark（Firestore 1GiB、5 万读/2 万写每天、Hosting 10GB，超限自动停不扣费）+ Cloudflare Worker 免费计划（10 万次/天）；
- 数据迁移：旧 localStorage 数据 → `/data` 导出 JSON → 登录新站后导入，或登录后"上传本机数据"；
- 展示版与正式版是不同 origin，localStorage 互不影响。

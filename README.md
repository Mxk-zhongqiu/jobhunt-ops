# 求职作战台 · jobhunt-ops

> **给新会话/新开发者的完整交接文档**：见 [`docs/PROJECT_HANDBOOK.md`](docs/PROJECT_HANDBOOK.md)（背景、架构、数据模型、AI 子系统、命令、已知问题、红线约定与下一步）。

2026 届量化秋招的个人作战系统。数据真实、本地持久化，服务于投递、笔试、面试、项目与知识这五条真实战线——不是演示框架，不是空中楼阁。

## 为什么叫 jobhunt-ops

- `jobhunt`：求职，直指用途；
- `ops`：作战 / 运营，强调它是投递漏斗、周计划、项目里程碑这些"作战动作"的指挥台；
- 不绑定"秋招 / 2026"等短期词：春招、日常实习转正阶段可以继续使用。

## 五大模块

| 模块 | 路由 | 解决什么问题 |
|---|---|---|
| 作战总览 | `/` | 投递漏斗、本周重点、7 天内截止、项目推进，30 秒看清全局 |
| 投递追踪 | `/applications` | 100+ 家公司的分层 / 渠道 / 状态机 / 截止日 / 投递链接（**核心页面**） |
| 周计划 | `/plan` | W1–W10 十周行动清单，勾选即走 |
| 项目 | `/projects` | 项目1 多因子、项目2 配对交易/ML 的里程碑看板 |
| 知识 | `/knowledge` | 数学/统计、编程、金融量化、机器学习、面试准备的主题进度 |
| 面试记录 | `/interviews` | 每场笔试/面试的问题与复盘，30 分钟内记录 |
| 面试题库 | `/question-bank` | 从面试记录自动汇总去重、按频率排序、标记已掌握、导出 Markdown 背诵文档 |
| AI 助手 | `/ai` | 知识问答 / 面试复盘草稿 / 简历要点翻译（Mock 或 DeepSeek） |
| 数据管理 | `/data` | 导出 JSON 全量备份、导出投递 CSV、导入恢复、重置种子 |

> **游客预览模式**：顶栏"演示预览"按钮一键切换为虚构演示数据（用于截图/内容展示，如小红书），演示数据为独立内存态、**不写入本地与云端**，退出即恢复真实数据。

## 数据模型（src/types/domain.ts）

- `Application`：公司、分层（冲刺/主攻/保底）、渠道、岗位、状态机（计划投递→已投递→笔试→一面→二面→终面→Offer/已拒绝/放弃）、截止日、链接；
- `WeeklyPlan`：10 周计划，每项行动可勾选；
- `QuantProject` + `ProjectMilestone`：两个量化项目的里程碑；
- `KnowledgeTopic`：主题、优先级（高频/必考/加分）、进度（未开始/学习中/已掌握）；
- `InterviewLog`：轮次、问题、复盘。

**持久化**：所有数据实时写入浏览器 localStorage（键 `jobhunt-ops-state-v1`），刷新不丢失。种子数据来自《求职规划内部文档》，可直接修改。

## 启动

```bash
npm install
npm run dev        # 仅前端：http://127.0.0.1:8788
npm run dev:full   # 前端 + DeepSeek 本地代理（一条命令，推荐）
npm run ai:proxy   # 只启动代理（127.0.0.1:8787）
```

> 端口说明：开发服务器使用 **8788**（AI 代理 8787 的相邻端口）。默认的 5173 在本机落在 Windows 保留端口段（Hyper-V 保留 5141–5240）内，绑定会报 `EACCES`。若 8788 也被占用，可换端口：`npm run dev:full -- --port 8789`。

## 构建与验证

```bash
npm run build        # 真实版：tsc -b && vite build，产物在 dist/（真实种子数据）
npm run build:demo   # 公网展示版：虚构演示数据 + 仅 Mock AI，构建末尾自动检查无真实数据泄漏
npm run verify       # AI 安全代码级验收（密钥只在服务端 / 最小上下文 / 确认写入）
npm run verify:seed:real   # 检查当前 dist 是真实包且不含演示数据
npm run verify:seed:demo   # 检查当前 dist 是演示包且不含真实数据
```

## 公网展示版（部署）

发布为公网网站、任何设备可访问、无需电脑开机：见 [`docs/DEPLOY.md`](docs/DEPLOY.md)（Netlify Drop / Cloudflare Pages 一键部署）。

- 展示版 = 完整界面 + **虚构演示数据** + 仅本地 Mock AI；**真实种子数据被构建期隔离门禁拦截，绝不进公网包**；
- 本地 `npm run dev` / `npm run build` 仍为真实数据 + 真实 DeepSeek（本地代理），互不干扰；
- 跨设备数据同步（账户 + 云端数据库）属于第二阶段，见 `docs/DEPLOY.md`。

## 云同步（第二阶段，Firebase）

**邮箱密码注册/登录 → 数据自动同步到云端，手机/电脑登录同一账号即互通**。详细开通步骤见 [`docs/FIREBASE_SETUP.md`](docs/FIREBASE_SETUP.md)。

- 认证：Firebase Auth；数据库：Firestore `states/{uid}`（规则只允许读写自己的文档）；离线缓存：IndexedDB；
- AI 上云：Cloudflare Worker 代理 DeepSeek（免费计划），**密钥存 Worker 环境变量，浏览器接触不到**（门禁 36 项自动检查），仅登录用户可用；
- 未登录/未配置：自动退回本地模式（localStorage），与原版行为一致；公网展示版永不连接真实 Firebase。

## AI 助手

- 三种能力：**知识问答**（不写入）、**面试复盘草稿**（确认后写入面试记录的复盘字段）、**简历要点翻译**（经历 → 量化岗语言，可复制）；
- 默认使用 Mock 本地规则（不访问网络）；配置真实 DeepSeek 只需在项目根目录 `.env` 填 `DEEPSEEK_API_KEY`（参照 `.env.example`），再 `npm run dev:full`；
- 安全模型与旧项目一致：密钥只在本地服务端、浏览器只发送勾选的最小上下文、生成一律是草稿、写入必须确认、调用日志不含正文。

## 技术栈

React 19 · TypeScript(strict) · Vite 6 · React Router 7 · lucide-react · 原生 CSS（无 UI 框架依赖，轻量可改）

## 浏览器自动化（Playwright + Edge）

已内置用 Playwright 驱动本机 Edge 的通道：自动打开投递链接、抓取招聘页面、定时检查笔试/面试入口等。详见 [`docs/BROWSER_AUTOMATION.md`](docs/BROWSER_AUTOMATION.md)，快速验证：`npm run browser:smoke`。

## 与旧项目（F:\MyWorld）的关系

旧项目《自由世界成长系统》是"低维护生活观测"框架（Mock 数据、不持久化、六现实领域），与真实求职场景错位，故本仓库从头构建，仅复用其工程模式（repository/selector、验证门禁思想）与组件审美。旧仓库保持原样归档。

## 路线图（按需追加）

- [x] 投递数据导入/导出（JSON 备份 + CSV）
- [x] AI 辅助（复用旧项目 DeepSeek 安全代理：问答 / 面试复盘 / 简历翻译）
- [ ] 状态变化时间线（投递→笔试→面试的耗时统计）
- [x] 高频面试题文档沉淀（从 InterviewLog 自动汇总）
- [ ] 简历版本管理

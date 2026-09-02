# Edge 插件 · 求职作战台投递同步助手（v0.1）

在你浏览 **Boss直聘 / 猎聘** 时，把「投递」与「状态变化」半自动同步到求职作战台（[obs.jobhunt.top](https://obs.jobhunt.top/)）你自己的账号数据里。P0 只做**同步链路**；打招呼语 / 回复语（AI 写手）是 P1，本版本不含。

## 安装（开发模式加载）

1. `npm run ext:config`（在仓库根目录执行，从 `.env` 生成 `extension/config.js`；`config.example.js` 是模板，可手工复制填写）。
2. Edge 打开 `edge://extensions` → 打开右上角「开发人员模式」→「加载解压缩的扩展」→ 选择本目录 `extension/`。
3. 进入插件弹窗，用**与作战台相同的账号（邮箱密码）**登录一次。
4. 打开 Boss直聘 / 猎聘 的岗位页或会话页 → 点「从当前页提取」→ 核对/修改字段 →「保存到作战台」；或选一条云端记录「应用状态」。

> 前置：云端还没有你的数据文档时，请先在 obs.jobhunt.top 登录一次（触发云端初始化），再回来同步——避免插件用空数据覆盖你的本机数据。

## 它能做什么 / 不能做什么

能：
- 提取当前页（JSON-LD / DOM / 标题三级兜底）的平台、公司、岗位、JD 摘要，**全部可改，保存前由你确认**；
- 新增投递：写入 Firestore `states/{uid}.data.applications`（与网页端同一文档模型），自动带 `platform`、`url`、`jdSummary`、初始 `statusHistory`；
- 更新状态：选择云端记录 → 推进到 9 态之一 → 与网页端**同一规则**自动追加 `statusHistory`（旧记录无时间线时用 `createdAt` 初始化；同状态不重复记录），「已投递」时自动补 `appliedAt`；
- 智能去重：同 URL，或同名公司且平台一致 → 不重复添加（不同平台同名公司允许分开记录）。

不能（红线，设计与网页端一致）：
- **不自动投递、不自动发送任何消息、不绕验证码、不做高频自动化**——只做你手动确认后的单次写入；
- 不含任何服务端密钥：登录走 Firebase Auth REST，写库走 Firestore REST（规则仍按 uid 隔离兜底）；
- 不读取、不写入任何非本人 uid 的文档。

## 架构与同步语义

```
popup（登录 / 表单 / 确认）
  │ chrome.runtime.sendMessage
  ▼
background SW（background.js）
  ├─ Firebase Auth REST：signInWithPassword + refresh_token（会话存 chrome.storage.local，过期自动刷新）
  └─ Firestore REST：GET/PATCH documents/states/{uid}
        （mask 只动 data + updatedAt 两个字段，与网页端 setDoc(merge) 的文档模型一致）
content/extract.js —— 在 zhipin.com / liepin.com 注入，响应"从当前页提取"
```

并发语义：与网页端一致为「最后写入者胜」（个人工具可接受）。网页端打开时会通过 `onSnapshot` 自动收到插件的写入；反之插件写入前总是先 GET 最新整份再改，避免覆盖他人/旧内容。**冲突兜底**：插件是"读→改→写"整文档（保留网页端写入的其他集合），不是字段级合并。

## 与网页端的时间线规则（必须保持一致）

状态变化 → 在 `application.statusHistory` 追加 `{ status, at }`：
- 旧数据无 `statusHistory` → 先用 `createdAt` 初始化一条当前状态，再追加；
- 新投递 → 初始一条 `{ status: 创建时状态, at: createdAt }`；
- 与末尾状态相同 → 不重复记录。

修改任何一侧的这条规则时，必须同步修改另一侧（网页端在 `src/store/appStore.tsx` 的 `recordStatusChange`）。

## 数据模型关联

- 网页端类型：`src/types/domain.ts` 的 `Application.platform / jdSummary / statusHistory`；
- 状态机：计划投递 → 已投递 → 笔试 → 一面 → 二面 → 终面 → Offer（及 已拒绝/放弃）；
- 作战台 `/stats`（投递统计页）会读取 `statusHistory` 计算阶段耗时与最近动态。

## 排查

- 「缺少 Firebase 公网配置」→ 未生成 `extension/config.js`：`npm run ext:config`。
- 提取不到内容 → 该页面没有可识别的结构化信息，手动填写即可（半自动是设计取舍）。
- 「云端还没有你的数据文档」→ 先去网站登录一次。
- 网页端看不到新增 → 确认网页端已登录同一账号并等待几秒（Firestore onSnapshot 自动同步）。

## P1 · AI 写手（打招呼语 / HR 回复建议，v0.2）

在 BOSS直聘/猎聘 直聊场景生成话术草稿（3 版），确认后填入输入框或复制——**发送永远由你按键**。

使用：
1. 前提：插件已登录作战台账号；云端已有简历（先在 obs.jobhunt.top 登录并保存）；云端 AI Worker 已部署本仓库 `worker/ai-proxy.js` 的最新版（含 greeting/reply 能力）到 Cloudflare，并已 `npm run ext:config`（config 含 aiProxyUrl）。
2. 打开 BOSS **job_detail 页** → 扩展弹窗 → 「④ AI 写手」→「从当前页抓取」→ 核对岗位/公司/JD/简历版本（自动按岗位推荐）→「生成 3 版草稿」。
3. 打开与 HR 的**会话页** → 切「回复建议」→「从当前页抓取」（自动抓最后一条 HR 消息，抓不到就手动粘贴）→ 生成 → 选一版「填入输入框」（自动定位输入框）或「复制」→ 人工核对后按 Enter 发送。

实测行为与降级（2026-09-02 探测）：
- JD 全文在 job_detail 页 DOM 完整可读（自动截 1500 字）；公司名 **DOM 会被脱敏为「某基金公司」**，故公司以**页面标题解析**为准，可手改；
- HR 消息按气泡抓取并过滤工具条提示（「发简历/换电话/按Enter」等）；抓不到即手动粘贴；
- 输入框注入走 `execCommand('insertText')`（contenteditable 实测可行）；找不到输入框时自动改为复制，提示手动粘贴；
- 红线：不自动发送、不自动投递、不落库；AI 只依据你授权上下文生成；Worker 未部署新版本时报「AI 代理未配置」，请先部署。

> P0 附带修复：background 的 Firestore URL 曾重复 `/documents` 导致云同步 404，已按集合（states/resumes）修正。

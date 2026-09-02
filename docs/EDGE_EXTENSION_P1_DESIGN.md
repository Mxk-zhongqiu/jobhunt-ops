# Edge 插件 P1「AI 写手」设计（打招呼语 / HR 回复建议）

> 状态：设计已获用户批准（2026-09-02）。待用户复核本文档后，进入 writing-plans 排实现计划。
> 关联：`docs/EDGE_EXTENSION_GOALS.md` §7 P1；实现于 `extension/`（v0.1 同步助手）与 `worker/ai-proxy.js` 之上。

---

## 1. 目标与非目标

**目标**：在 Boss直聘 / 猎聘 直聊场景内完成「AI 写手」闭环——从当前页取 JD/HR 消息 → 结合本人云端简历 → 云端 DeepSeek 生成 **3 版草稿** → 用户确认后 **填入直聊输入框**（或一键复制）。绝不自动发送。

已确认决策：
- 入口只在 **Edge 插件**（网站 AI 助手本次不动）；
- 简历内容 = **云端 `resumes/{uid}`**，按当前岗位关键词**自动推荐版本**（popup 可切换）；
- 生成结果**纯草稿、不落库**（不扩展 Application/会话数据模型，话术留痕留待 P2）。

**非目标**：不自动发送消息；不自动海投；不抓取/存储平台全量会话；不新增任何云端数据写入（除 Worker 原有 AI 调用外无副作用）；不修改网站前端。

## 2. 架构与数据流

```
popup「AI 写手」卡（模式：打招呼 / 回复建议）
  │ chrome.runtime.sendMessage
  ▼
background.js（新增）
  ├─ listResumeVersions()       Firestore REST 读 resumes/{uid}.data（本人，rules 已放行）
  ├─ suggestVersion(jd)         按 JD/岗位关键词评分推荐版本；popup 下拉列出全部版本
  ├─ buildResumeDigest(state, versionId)
  │      版本 blocks→素材（应用 override）→ 分节文本 + 求职意向 + 自我评价，≤6k 字符
  └─ aiGenerate({mode, jdText, hrMessage, versionId, tone})
        ├─ 构造 { request: {capability: "greeting"|"reply", userInstruction }, authorizedContext }
        ├─ POST {aiProxyUrl}/deepseek（Bearer = 登录会话 idToken，自动刷新；配置入 EXT_CONFIG.aiProxyUrl）
        └─ 校验 JSON kind 与 drafts[3] → 返回草稿列表（本地类型校验失败给明确错误）
  ▲
content scripts（扩展）
  ├─ 提取当前页岗位/JD/平台（已有 jobhunt-extract）
  ├─ 新增 jobhunt-extract-message：尽力返回 HR 最后一条消息文本（平台适配层 best-effort）
  └─ 新增 jobhunt-fill-input：定位直聊输入框并写入文本（只填，不发送）
```

- 鉴权复用：background 已有 Firebase Auth REST 会话（`ensureToken`），直接给 Worker 发 idToken；
- Worker 是唯一 AI 出口：`VITE_AI_PROXY_URL`（.env）同步进 `extension/config.js`（`EXT_CONFIG.aiProxyUrl`），`npm run ext:config` 更新生成；
- 所有写回作业（Firestore）仅限「读本人 resumes」+「AI 调用」；插件对 states/{uid} 的写入维持 P0 原样。

## 3. 云端能力契约（worker/ai-proxy.js 扩展）

沿用现有：POST `/deepseek` + Bearer 鉴权 + 白名单 + JSON Output + 上下文/输出上限 + 超时有限重试 + 错误码；`npm run verify` 门禁保持通过。

新增 `schemaInstruction` 分支：

- `greeting`（打招呼语）：`{"kind":"greeting","drafts":["…","…","…"],"notes":"1 条说明"}`。3 版需覆盖不同侧重（简洁礼貌 / 突出相关经历 / 主动邀约沟通），结合 JD 关键词与简历摘要；**不夸大事实**；≤140 字/版。
- `reply`（HR 回复建议）：`{"kind":"reply","drafts":["…×3"],"notes":"…"}`。依据 HR 消息意图分类（约面试/笔试邀请/要材料/已读未回/婉拒等），给出得体、有行动项的回复；≤200 字/版。

system 提示追加红线：只依据 `authorizedContext`；drafts 均为待确认草稿；提醒用户人工核对后自行发送。

**authorizedContext 字段（由插件构造，符合最小上下文）**：
```jsonc
{
  "mode": "greeting" | "reply",
  "jd": { "position": "...", "company": "...", "jdText": "…截断 1500 字" },
  "hrMessage": "…（reply 模式；截断 800 字）",
  "resumeDigest": "…（所选版本摘要，≤6000 字符）",
  "tone": "quant-professional" | "concise-friendly" | "enthusiastic"
}
```

## 4. 插件改动清单（extension/）

| 文件 | 改动 |
|---|---|
| `manifest.json` | host_permissions 追加 `resumes` 读取无需改动（同 Firestore 域已授权）；content script matches 不变（zhipin/liepin） |
| `config.example.js` / 生成脚本 | `EXT_CONFIG` 增加 `aiProxyUrl`（`scripts/gen-extension-config.mjs` 读 `VITE_AI_PROXY_URL`） |
| `background.js` | Firestore REST 通用读改为可指定集合（states/resumes）；新增 `listResumeVersions` / `suggestVersionByJd` / `aiGenerate`；消息路由注册 |
| `content/extract.js` | 扩展消息：`jobhunt-extract-message`（最后一条 HR 消息文本 best-effort）、`jobhunt-fill-input`（写入直聊输入框） |
| `content/platforms/zhipin.js`、`liepin.js`（新增） | 每平台选择器适配：会话消息容器、输入框（textarea / [contenteditable]）；DOM 变化时只改这里 |
| `popup.html/css/js` | 新增「③ AI 写手」卡：模式切换、JD/岗位展示（可改）、HR 消息区（自动抓取 + 手动粘贴兜底）、简历版本下拉（自动推荐置顶）、语气下拉、生成/重生成、3 版草稿（可编辑）+「填入输入框」「复制」 |

**填充语义**：写入输入框时按元素类型处理（textarea 设 value；contenteditable 设 textContent 并派发 `input`/`compositionend` 事件模拟受控组件）。仅填充，**用户手动点发送**；找不到输入框 → 自动复制并提示。

## 5. 错误与降级

| 场景 | 处理 |
|---|---|
| 未登录 / 令牌过期 | 引导回登录卡；错误文案复用 P0 风格 |
| 云端无简历文档 | 提示「先在 obs.jobhunt.top 登录并保存简历」 |
| Worker 未部署 / 无密钥 / 额度 / 限流 | 透传 Worker 错误码（AI_NOT_CONFIGURED / INSUFFICIENT_BALANCE / RATE_LIMITED…）给出人话 |
| 响应非预期 JSON / 截断 | 本地校验失败 → 明确错误，允许重试 |
| 抓不到 HR 消息 / 找不到输入框 | 手动粘贴 / 复制兜底（best-effort 是设计取舍，适配层易维护） |

## 6. 安全红线（不变）

1. 密钥只在 Worker 环境变量；插件不含密钥；AI 只走 Worker + 本人 idToken。
2. 只读本人 `resumes/{uid}`（Firestore 规则按 uid 隔离兜底）。
3. 生成一律草稿；确认后才填充/复制；**不自动发送**。
4. 不落库、不扩数据模型（本 P1）；最小上下文（JD 截断、消息截断、摘要 ≤6k）。
5. 平台风控：低频率、仅用户手动触发的单次调用与单次填充。

## 7. 验证与交付

- `node --check`（background/popup/content/新适配文件）、`npm run verify`（36 项门禁，worker 改动后必须）、前端 `npx tsc -b`（若未触碰前端可省）。
- Worker 需**用户执行一次部署**（`worker/ai-proxy.js` 改动上到 Cloudflare，wrangler 或控制台；仅新增两分支，风险低）。
- 浏览器侧：Edge 重新加载扩展 → 登录 → 打开 Boss直聘 岗位/会话页 → 生成 → 填框手测。
- 文档：`extension/README.md` 补 P1 用法；`docs/EDGE_EXTENSION_GOALS.md` §9 P0 记录后追加 P1 记录（实现后）。

## 8. 风险与开放项

- Boss直聘/猎聘 DOM 可能调整：用集中适配层 + 多候选选择器 + 手动兜底对冲；适配失败不阻断核心（复制即可）。
- 直聊输入框若是自研编辑器（非标准 textarea/contenteditable）可能无法注入：降级复制并提示。
- AI 话术质量依赖简历摘要质量与版本推荐命中：版本推荐按「岗位/JD 关键词 ⊆ targetRole/jobIntent.positions」评分，popup 明确展示命中的推荐版本与理由；命中差时用户可手动切换。
- Worker 部署动作需用户本人在 Cloudflare 完成（本仓库不含部署凭据）。

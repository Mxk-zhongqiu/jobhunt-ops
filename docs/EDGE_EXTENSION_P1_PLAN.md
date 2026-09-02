# P1「AI 写手」实现计划（Edge 插件 + Cloudflare Worker）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务执行本计划。步骤用 `- [ ]` 勾选跟踪。

**Goal:** 在 Boss直聘/猎聘 直聊场景闭环「AI 写手」：job_detail 页自动取 JD/岗位/公司（公司以页面标题为准）→ 会话页取 HR 最后消息 → 结合云端简历版本摘要 → 云端 DeepSeek 生成 greeting/reply 各 3 版草稿 → 用户确认后填入直聊输入框或复制。不自动发送、不落库。

**Architecture:** 复用 P0 扩展（MV3 经典脚本，无打包）。纯函数抽到 `extension/lib/parsers.js`（经典脚本，通过注入顺序/importScripts 共享，node 可测）；页面交互全走 content script（真实会话通道，CDP 已被实测排除）；AI 走既有 Cloudflare Worker `/deepseek`（新增 `greeting`/`reply` 两个 capability），鉴权复用扩展内 Firebase 会话 idToken；简历读本人 `resumes/{uid}`（Firestore REST，规则已放行）。

**Tech Stack:** Manifest V3（经典 JS，无模块、无 TS、无打包）；Firestore/IdentityToolkit/SecureToken REST；Cloudflare Worker（现有 ai-proxy.js）；node --test 用于纯函数单测；Playwright 仅作回归脚本（不用于 BOSS/猎聘 页面）。

**Spec:** `docs/EDGE_EXTENSION_P1_DESIGN.md`（v1.1 实测版，含 §9 实测矩阵）。本计划以 Spec 为据，执行者先读 Spec 与本计划。

## Global Constraints

- MV3 经典脚本：content/popup 不用 import/require/module；background 仅可用 `importScripts`；无 TS/JSX。
- 扩展不含任何密钥字面量；密钥只在 Worker 环境变量（`npm run verify` 36 项门禁保持全绿）。
- 只读本人 `resumes/{uid}` 与 `states/{uid}`；除 Worker AI 调用外不做任何网络写入。
- **红线**：不自动点发送、不模拟回车发送、不自动投递；草稿确认后才填框/复制。
- 抓取/填充全部以**页面类型识别**为前置（job_detail / chat / other）；识别失败或元素缺失→ 禁用自动抓取、退回手动粘贴/复制，绝不在错误页面上报假数据。
- 文案中文；CSS 新增类一律 `.ai-` 前缀；`extension/config.js` 由 `npm run ext:config` 生成且 gitignored。
- 纯函数放 `extension/lib/parsers.js`；同一文件不得依赖 DOM（测试用 node:test 直接跑）。
- 每个任务结束都提交；worker 相关改动后跑 `npm run verify`；扩展改动后 `node --check` 相关文件。

---
## 文件地图

- Modify `worker/ai-proxy.js` — schemaInstruction 增加 greeting/reply 分支。
- Modify `scripts/gen-extension-config.mjs` / `extension/config.example.js` — 增加 `aiProxyUrl`；重新生成 `extension/config.js`（gitignored）。
- Create `extension/lib/parsers.js` — 纯函数（标题解析/页面分类/工具条过滤/版本评分/简历摘要）。
- Create `scripts/test/parsers.test.mjs` — node --test 单测（vm 沙箱加载 parsers.js）。
- Modify `extension/manifest.json` — content_scripts 注入顺序加 `lib/parsers.js`。
- Modify `extension/background.js` — resume 读取/版本推荐/摘要投影/aiGenerate/路由。
- Modify `extension/content/extract.js` — 页面类型化采集（JD/公司/岗位/HR 消息）+ `jobhunt-fill` 注入。
- Create `extension/content/platforms/zhipin.js` — 平台选择器与已知坑适配（v1 先并入 extract 常量，本文件为后续 DOM 变更兜底位）。（可选折叠进 extract 常量节）
- Modify `extension/popup.html` / `popup.css` / `popup.js` — 「④ AI 写手」卡。
- Modify `extension/README.md` / `docs/EDGE_EXTENSION_GOALS.md` — 用法与 P1 记录。

---

### Task 1: Worker 增加 greeting / reply 能力分支

**Files:** Modify `worker/ai-proxy.js`（schemaInstruction 函数内，约 L31-46 区）。

**Interfaces:**
- Consumes: 现有 POST `/deepseek` 契约（`{request:{capability,userInstruction}, authorizedContext}`），本任务不改契约形状。
- Produces: `capability ∈ {"greeting","reply"}`；系统提示语沿用「只依据授权上下文…草稿」。

- [ ] **Step 1: 在 `schemaInstruction` 增加分支**（插在 `rewrite` 分支之后、`return answer` 之前）：

```js
if (capability === "greeting") {
  return `${shared} 格式：{"kind":"greeting","drafts":["...","...","..."],"notes":"1 条说明"}；3 版需各有侧重（简洁礼貌 / 突出与 JD 相关的经历 / 主动邀约沟通），单版 ≤140 字，不夸大简历事实，称呼与语气自然。`;
}
if (capability === "reply") {
  return `${shared} 格式：{"kind":"reply","drafts":["...","...","..."],"notes":"1 条说明"}；先判断 HR 消息意图（约面试/笔试邀请/要材料/待推进/婉拒等），回复要得体并给出可执行的下一步，单版 ≤200 字。`;
}
```

- [ ] **Step 2: 收紧系统提示**：把 worker 中 system content 的尾句（当前为 `…不做主观评价定性。${schemaInstruction(...)}`）前追加一句：`起草话术时只依据授权上下文中的 JD/HR 消息/简历摘要；不要编造未提供的经历；所有话术均为待用户确认的草稿，不得引导自动发送。`

- [ ] **Step 3: 语法与门禁**：Run `node --check worker/ai-proxy.js`；Run `npm run verify`。Expected: exit 0（36 项仍绿）。
- [ ] **Step 4: Commit** `git add worker/ai-proxy.js && git commit -m "feat(worker): greeting/reply 话术能力分支"`（注明：需用户后续部署 Worker 生效，见 Task 8）。

---

### Task 2: 扩展配置增加 aiProxyUrl

**Files:** Modify `scripts/gen-extension-config.mjs`、`extension/config.example.js`；重新生成 `extension/config.js`。

**Interfaces:** `globalThis.EXT_CONFIG = { apiKey, authDomain, projectId, aiProxyUrl }`；aiProxyUrl 来源 `.env` 的 `VITE_AI_PROXY_URL`（如 `https://jobhunt.example.workers.dev`）。

- [ ] **Step 1:** `config.example.js` 中 EXT_CONFIG 增加 `aiProxyUrl: "https://…workers.dev", // VITE_AI_PROXY_URL`。
- [ ] **Step 2:** `gen-extension-config.mjs`：从 env 读 `VITE_AI_PROXY_URL`，缺省 `""`；输出对象含 `aiProxyUrl`。
- [ ] **Step 3:** Run `npm run ext:config`；Expected: 生成 `extension/config.js` 且含 aiProxyUrl；Run `node --check scripts/gen-extension-config.mjs`。
- [ ] **Step 4: Commit** `git add extension/config.example.js scripts/gen-extension-config.mjs && git commit -m "chore(ext): EXT_CONFIG 增加 aiProxyUrl"`。

---

### Task 3: 纯函数库 parsers.js + 单测

**Files:** Create `extension/lib/parsers.js`；Create `scripts/test/parsers.test.mjs`。

**Interfaces（挂 `globalThis.JH`，content 注入顺序保证在 extract 前；background 用 `importScripts("lib/parsers.js")`；测试用 vm 加载）:**
- `JH.norm(text)` → 折叠空白 trim。
- `JH.cut(text, max)` → 截断（≤max 字符）。
- `JH.parseTitleJob(title)` → `{ position: string, company: string }`。规则（实测样例）：
  - job_detail：`「量化研究实习生（北京）招聘」_微观博易招聘-BOSS直聘` → position=「量化研究实习生（北京）」、company=「微观博易」；
  - 其他：先剥尾部 `-BOSS直聘` / `-Liepin招聘` / `招聘` 类后缀再按 `_`/`-` 分段，末段含“公司”时并入 company。
- `JH.classifyPage(url, title)` → `"job_detail" | "chat" | "other"`（url 含 `job_detail`→job_detail；含 `/web/geek/chat` 或 pathname 含 chat→chat）。
- `JH.isToolbarText(text)` → 含 发简历|换电话|换微信|按Enter|安全验证|微信扫码 等工具条/提示关键词 → true（消息候选需过滤）。
- `JH.suggestVersion(jobText, versions)` → `{ versionId?: string, reason: string }`；versions 为 `[{id,name,targetRole,jobIntentPositions}]`；评分=岗位词命中 targetRole/positions 的子串数，无命中返回 `{versionId:undefined, reason:"未匹配，请手动选择"}`。
- `JH.buildVersionDigest(version, materials)` → 纯文本分节（≤6000 字符）：`【求职意向】positions/city/expectSalary/availability/tags` + 各纳入素材（按 category 顺序）`### 标题 / 副标题 / ·要点`，应用 material 原值（override 由调用方先合入 materials）。
- `JH.isMaskedCompany(text)` → `某基金公司|某知名|某公司` 脱敏模式 → true。

- [ ] **Step 1: 写 parsers.js**（每个函数 5–25 行；无 DOM/无网络；顶部 `(() => { const JH = {...}; globalThis.JH = JH; })();`）。
- [ ] **Step 2: 写失败测试** `scripts/test/parsers.test.mjs`（node:test + assert；用 `readFileSync` + `new Function` 沙箱执行 parsers.js 后取 `sandbox.JH`）：
  - parseTitleJob：`「量化研究实习生（北京）招聘」_微观博易招聘-BOSS直聘` → position/company 断言；
  - classifyPage：job_detail/chat/other 三种 url；
  - isToolbarText：「发简历 换电话」true、「你好，有兴趣吗」false；
  - suggestVersion：jobText「量化研究实习生（兼职/远程）」对 versions=[量化岗版(positions 量化研究),视觉版] 应命中量化岗版；
  - buildVersionDigest：含 jobIntent 与两条素材，输出含「求职意向」与要点符号；
  - isMaskedCompany('某基金公司') true。
- [ ] **Step 3: Run `node --test scripts/test/parsers.test.mjs`** → 期望初始失败（JH 未定义）。
- [ ] **Step 4: 实现至全绿**。
- [ ] **Step 5: Commit**。

---

### Task 4: content 采集升级（类型化 + 注入）

**Files:** Modify `extension/manifest.json`（content_scripts.js 前置 `lib/parsers.js`）、Modify `extension/content/extract.js`。

**Interfaces:**
- Consumes: `JH.*`；现有 `jobhunt-extract`/`jobhunt-dom-probe` 消息。
- Produces 消息：
  - `jobhunt-extract` 响应扩展为 `{ platform, url, pageType, capture: { position, company, companyFromTitle, jdText }, message: { text, source: "auto|none" } }`；
  - 新增 `jobhunt-fill`（payload `{ text }`）→ `{ ok, filled: boolean, reason? }`（只填不发送）。

- [ ] **Step 1: manifest content_scripts `js` 改为 `["lib/parsers.js", "content/extract.js"]`**。
- [ ] **Step 2: job_detail 采集**（在 extract.js 新增 `captureJobPage()`）：position 优先 title 解析；company 优先 `JH.parseTitleJob(title).company`（若 DOM 公司文本 `JH.isMaskedCompany` 则弃用 DOM 值）；jdText 取关键字容器评分最长文本（沿用探测里 `longestKeywordText` 实现，关键字同探测集）`JH.cut(...,1500)`。
- [ ] **Step 3: chat 消息采集** `captureChatMessage()`：扫描会话正文候选元素（class 含 message/msg/conversation 且位于 `[class*="conversation"]` 内），取最后一条**长度 6–800、非工具条（`JH.isToolbarText` 过滤）、非纯时间**的文本；找不到返回 `text:""`（popup 显示手动粘贴框）。
- [ ] **Step 4: `jobhunt-fill` 处理器**：定位可见 `textarea`/`[contenteditable="true"]`（会话页实测为 contenteditable DIV）；聚焦后：清空现有内容（contenteditable 设空），用 `document.execCommand("insertText", false, text)`（textarea 走原生 setter + input 事件，参考探测已验证路径）；回读 innerText/value 包含文本 → `filled:true`；异常→`{ok:true,filled:false,reason}`（popup 自动复制兜底）。**绝不触发 keydown Enter/click 发送。**
- [ ] **Step 5: `runDomProbe`/旧 extract 保持可用**；`node --check` 两个文件。
- [ ] **Step 6: Commit**。

---

### Task 5: background：简历读取 + 版本推荐 + aiGenerate

**Files:** Modify `extension/background.js`。

**Interfaces:**
- Consumes: `CFG.aiProxyUrl`、`JH`（`importScripts("lib/parsers.js")` 置于 config.js 之后）、现有 `ensureToken`/`decodeField`/`docRequest`。
- Produces 消息处理器：
  - `listResumeVersions` → `{ versions: [{id,name,targetRole,jobIntentPositions}], empty: boolean }`（读 `resumes/{uid}`：`docRequest("?mask.fieldPaths=data")` → `decodeField(fields.data)`，取 `.versions`；文档缺失 → `empty:true`）。
  - `suggestResumeVersion`（payload `{ hint }`）→ `JH.suggestVersion(hint, versions)` 结果。
  - `aiGenerate`（payload `{ mode: "greeting"|"reply", jd: {position,company,jdText}, hrMessage, versionId, tone }`）→ `{ drafts: string[], notes: string }`：
    - 读 resumeState → 选中 version（无则取 versions[0] 并在 notes 提示）；materials 先按 blocks 应用 override 后交 `JH.buildVersionDigest`；
    - `authorizedContext = { mode, jd, hrMessage, resumeDigest, tone }`；
    - `request = { capability: mode, userInstruction: mode==="greeting" ? "针对该 JD 生成打招呼语…" : "针对这条 HR 消息生成得体回复…" }`；
    - `fetch(CFG.aiProxyUrl + "/deepseek")`（Bearer idToken；复用 cloudEmpty/auth 错误语义）；
    - 本地校验 JSON：kind===mode、drafts 为 3 条字符串 → 返回；否则抛 `INVALID_PROVIDER_RESPONSE`。
  - 错误码透传人话映射（AUTH_REQUIRED→先登录；AI_NOT_CONFIGURED/INSUFFICIENT_BALANCE/RATE_LIMITED/PROVIDER_UNAVAILABLE/TIMEOUT）。

- [ ] **Step 1: `importScripts("lib/parsers.js")`；写 `readResumeVersions()`（Firestore REST，仅本人）。**
- [ ] **Step 2: 写 `aiGenerate` 及其上下文裁剪/校验**（内容如上；`userInstruction` 长度受限：jdText ≤1500、hrMessage ≤800、digest ≤6000，由 JH.cut 强制）。
- [ ] **Step 3: handlers 注册三项；`node --check`。**
- [ ] **Step 4: Commit。**

---

### Task 6: popup「④ AI 写手」卡

**Files:** Modify `extension/popup.html` / `popup.css` / `popup.js`。

**Interfaces:**
- Consumes: 上述 background 消息 + content `jobhunt-extract`/`jobhunt-fill`。
- Produces: UI 状态字段（见步骤）。

- [ ] **Step 1（html）：** 卡片 ④ 置于 ③ 之后：模式切换（打招呼/回复建议）；「从当前页抓取」按钮（调 jobhunt-extract，把 capture/message 填入字段：岗位、公司、JD 摘要（只读可改，textarea rows=4）、HR 消息（自动或手动粘贴 textarea，回复模式必填）；「加载简历版本」下拉（空态提示先登录/建档）；语气下拉（量化专业/简洁礼貌/热情主动）；「生成 3 版草稿」按钮；草稿区 `#aiDraftList`（每版一个 `textarea.readonly`+「编辑」切换+「填入输入框」「复制」按钮）；`#aiNote` 提示；结果行复用 `#result`。
- [ ] **Step 2（css）：** 追加 `.ai-*` 少量样式（草稿项分隔、编辑态高亮、小按钮）。
- [ ] **Step 3（js）：** 逻辑：
  - 打开卡片自动 `jobhunt-extract` 填 capture；模式切到 reply 且 hrMessage 空时尝试再次 extract 拿 message；
  - 版本下拉：`listResumeVersions` → 有 hint（岗位/JD 前 40 字）时 `suggestResumeVersion`，推荐项置顶并 `label = name + "（推荐）"`；无版本→提示「先在 obs.jobhunt.top 登录并保存简历」；
  - 生成：校验（greeting 需岗位或 JD 其一；reply 需 hrMessage）→ `aiGenerate` → 渲染 drafts；错误按映射文案显示；
  - 「填入输入框」：向活动 tab 发 `jobhunt-fill {text}`；`filled:false` 时自动 `navigator.clipboard.writeText` 并提示「未找到输入框，已复制，请手动粘贴发送」；「复制」直接写剪贴板。
  - 全流程不自动发送。
- [ ] **Step 4: `node --check extension/popup.js`；手动冒烟清单（见 Task 7）。**
- [ ] **Step 5: Commit。**

---

### Task 7: 文档与收口验证

**Files:** Modify `extension/README.md`、`docs/EDGE_EXTENSION_GOALS.md`（§7 P1 勾进度 + §9 P1 实现记录）。

- [ ] **Step 1:** README 补 P1 用法（探测→生成→填框 三步 + 红线 + 「公司名以标题为准/手动核对」「HR 消息抓不到就粘贴」）。
- [ ] **Step 2:** GOALS.md 补 P1 实现记录（含实测矩阵结论引用、Worker 需部署提示）。
- [ ] **Step 3:** Run：`npm run verify`、`node --test scripts/test/parsers.test.mjs`、`node --check extension/*.js extension/content/*.js extension/lib/*.js`、`npm run tsc`不需要（未动前端，跳过；若 `npx tsc -b` 顺手跑通即可）。
- [ ] **Step 4:** Commit（收口）。
- [ ] **Step 5:** 用户侧验收清单（在本机执行）：
  1. Worker：把 `worker/ai-proxy.js` 部署到 Cloudflare（wrangler 或控制台粘贴）；
  2. `edge://extensions` 重新加载扩展；
  3. BOSS job_detail 页：AI 写手→打招呼→确认版本→生成→检查 3 版→填框→人工发送；
  4. 会话页：回复建议→抓 HR 消息（失败则粘贴）→生成→填框；
  5. 反馈任何「抓不到/填不上」现象 → 走手动兜底并回报（供适配层迭代）。

## Self-Review 记录（执行前已自查）

- Spec 覆盖：§3 契约→Task1/5；§4 采集与填充→Task3/4；简历匹配→Task3/5；错误降级→Task4/5/6 内置；红线→各 Task Global Constraints；§9 实测修订（title 公司、关键字 JD、工具条过滤、execCommand、页面分类）→Task3/4 显式落点。无缺口。
- 占位符扫描：无 TBD/TODO；每步含可执行命令与代码要点。
- 类型一致：`JH.*` 签名跨 Task3/4/5 一致；消息名 `jobhunt-extract/jobhunt-fill/jobhunt-dom-probe` 与现有代码一致；`aiGenerate` 返回 `{drafts,notes}` 在 Task5/6 一致。

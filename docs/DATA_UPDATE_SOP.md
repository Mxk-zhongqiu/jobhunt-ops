# jobhunt-ops 个人数据更新 SOP（标准作业文件 · 唯一入口）

> **一句话定位**：本文件是 jobhunt-ops 全部个人数据的**唯一更新入口**。
> 以后任何数据更新（投递 / 面试 / 周计划 / 项目 / 知识 / 设置 / 题库），你只需一句话描述需求，
> 执行者（AI / 开发者 / 你自己）按本 SOP 的标准五步流程完成，**每一步都有校验与备份兜底**。
>
> - 执行层工具：`scripts/data/state-tools.mjs`（npm 别名：`npm run state:*`）
> - 规范状态文件：`.edge-profile/state.json`（真实数据，gitignored，不入库）
> - 配套文档：`docs/PROJECT_HANDBOOK.md`（开发手册）、`docs/HANDOVER.md`（交接索引）
> - 最后更新：2026-08-22

---

## 1. 入口与使用方式

### 1.1 入口组成

| 部件 | 位置 | 作用 |
|---|---|---|
| 本 SOP | `docs/DATA_UPDATE_SOP.md` | 标准作业流程与字段字典（本文档） |
| 状态工具 | `scripts/data/state-tools.mjs` | export / validate / backup / apply 四个子命令 |
| 规范状态文件 | `.edge-profile/state.json` | 全量数据的工作副本（= `/data` 页导出的 JSON 格式） |
| 备份目录 | `.edge-profile/backups/` | 每次改动前的自动快照（保留最近 20 份） |

### 1.2 使用者分工

- **你（用户）**：只描述需求，例如：
  - "新增一家公司投递：XX 量化，主攻，官网投递"
  - "把幻方的状态改成笔试"
  - "录一下今天 XX 公司的面经"
  - "项目1 的 f2 里程碑完成了"
  - "把贝叶斯公式标记为已掌握"
- **执行者（AI / 开发者）**：严格按 §3 五步流程执行，任何一步失败即停止并向你报告。
- **你（验证）**：应用后打开页面核对，或让执行者出示 export 结果。

### 1.3 适用数据范围

**本 SOP 覆盖全部 7 块应用数据**：投递、面试记录、周计划、项目里程碑、知识体系、设置、面试题库已掌握标记。
> 不在范围内：代码、种子数据（`src/data/seed.ts`）、简历 / 小红书素材等文档资产（见 HANDOVER §4）。

---

## 2. 数据全景（字段字典）

数据整体结构 = `AppState`（与 `/data` 页「导出完整备份」的 JSON 完全一致），本地持久化于
localStorage 键 **`jobhunt-ops-state-v1`**；登录 Firebase 后同时写云端 Firestore `states/{uid}`（云端为真、本地为备份、双向同步）。

### 2.1 七块数据一览

| 集合 | 含义 | 主键 | 关键枚举 |
|---|---|---|---|
| `applications` | 投递记录 | `id` | tier / channel / status / positionKind |
| `interviews` | 面试 / 笔试记录 | `id` | round（自由文本：笔试/一面/二面/终面/HR 面） |
| `weeklyPlans` | 十周计划 | `week`(1–10) | tasks[].done |
| `projects` | 量化项目 + 里程碑 | `id` | status / milestones[].status |
| `knowledge` | 知识主题 + 知识点 | `id` | priority / status / points[].depth / points[].mastered |
| `settings` | 应用设置 | —（单对象） | aiProvider |
| `questionBankMastered` | 题库已掌握标记 | 规范化题目键 | — |

### 2.2 字段明细

**applications[]**
| 字段 | 类型 | 必填 | 规则 |
|---|---|---|---|
| id | string | ✅ | 唯一；新记录 `app-<时间戳>`；种子为 `seed-app-公司` |
| company | string | ✅ | 公司名（真实名称，勿用演示名） |
| tier | enum | ✅ | `冲刺` / `主攻` / `保底` |
| channel | enum | ✅ | `官网` / `牛客` / `应届生` / `学校就业网` / `内推` / `实习转正` / `其他` |
| position | string | ✅ | 岗位名，如「量化研究员（2026 届）」 |
| positionKind | enum | ✅ | `量化研究` / `量化开发` / `金融科技` / `数据分析` / `风控` / `其他` |
| status | enum | ✅ | `计划投递` / `已投递` / `笔试` / `一面` / `二面` / `终面` / `Offer` / `已拒绝` / `放弃` |
| deadline | date | 否 | `yyyy-MM-dd`，投递截止日 |
| appliedAt | date | 否 | `yyyy-MM-dd`，实际投递日 |
| url | string | 否 | 投递链接 |
| note | string | 否 | 备注 |
| nextAction | string | 否 | 下一步动作 |
| createdAt | datetime | ✅ | ISO 8601（如 `2026-08-22T14:22:01.207Z`） |
| updatedAt | datetime | ✅ | ISO 8601；应用每次修改自动刷新 |

**状态机（建议流转顺序）**：`计划投递 → 已投递 → 笔试 → 一面 → 二面 → 终面 → Offer`；任意阶段可落 `已拒绝` / `放弃`。

**interviews[]**
| 字段 | 类型 | 必填 | 规则 |
|---|---|---|---|
| id | string | ✅ | 唯一；新记录 `interview-<时间戳>` |
| company | string | ✅ | 公司名 |
| round | string | ✅ | 笔试 / 一面 / 二面 / 终面 / HR 面 |
| date | date | ✅ | `yyyy-MM-dd` |
| questions | string | ✅ | **每题一行**（换行分隔）；面试题库自动由此汇总 |
| review | string | ✅ | 复盘：做得好 / 不好 / 下次改进（可留空字符串） |
| nextAction | string | 否 | 下一步 |
| createdAt | datetime | ✅ | ISO 8601 |

**weeklyPlans[]**
| 字段 | 类型 | 必填 | 规则 |
|---|---|---|---|
| week | number | ✅ | 1–10，全表唯一 |
| label | string | ✅ | 周标签，如「8/18–8/24 定方向与启动」 |
| tasks[] | 数组 | ✅ | `{ id, text, done }`；id 周内唯一；新任务 `task-<时间戳>`；done 为布尔 |

**projects[]**
| 字段 | 类型 | 必填 | 规则 |
|---|---|---|---|
| id | string | ✅ | 唯一（种子：`project-factor` / `project-pair`） |
| name / goal | string | ✅ | 项目名与目标 |
| status | enum | ✅ | `active` / `paused` / `done` |
| output | string | 否 | 交付物：GitHub 链接 / 报告位置 |
| milestones[] | 数组 | ✅ | `{ id, title, status, targetDate? }`；status ∈ `pending` / `active` / `done`；targetDate `yyyy-MM-dd` |

**knowledge[]**
| 字段 | 类型 | 必填 | 规则 |
|---|---|---|---|
| id | string | ✅ | 唯一（种子：`k-*`；新主题 `topic-<时间戳>`） |
| category | string | ✅ | 如「数学/统计」「编程」「金融与量化」「机器学习」「面试准备」 |
| name | string | ✅ | 主题名 |
| priority | enum | ✅ | `高频` / `必考` / `加分` |
| status | enum | ✅ | `未开始` / `学习中` / `已掌握` |
| note | string | 否 | 备注 |
| points[] | 数组 | ✅ | `{ id, title, summary, depth?, mastered }`；id 主题内唯一（新知识点 `point-<时间戳>`）；depth ∈ `基础` / `进阶`（可省略）；mastered 布尔 |

**settings（单对象）**
| 字段 | 类型 | 必填 | 规则 |
|---|---|---|---|
| targetName | string | ✅ | 当前用户称呼 |
| startDate | date | ✅ | 作战起点 `yyyy-MM-dd`；**修改它即自动校准当前周次** |
| dailySubmitTarget | number | ✅ | 每日投递目标 |
| totalTarget | number | ✅ | 总投递目标 |
| aiProvider | enum | ✅ | `mock` / `deepseek` |

**questionBankMastered[]**
- 字符串数组，元素 = **规范化题目键**。题库本身**自动**从所有 `interviews[].questions`（每题一行）汇总生成；
  本字段只记录"已掌握"标记。
- 规范化键规则（`utils/questionBank.ts`）：去首尾空白 → 折叠连续空白（含全角空格）→ **去掉句末标点**（。！？!?；;…）→ **小写**。
- 示例：`贝叶斯公式是什么？` → 键 `贝叶斯公式是什么`

### 2.3 派生数据说明（重要）

- **面试题库页** = 从 `interviews` 实时计算，**不要**直接往 `questionBankMastered` 塞"题目"——那是标记数组，不是题目库。
- 新增/修改面试记录 → 题库自动增减；标记已掌握 → 才操作 `questionBankMastered`。
- 删除某条面试记录会连带让相关题目从题库消失（已掌握标记会残留，属已知语义，可手动清理）。

---

## 3. 标准五步流程（核心）

> 前置条件：应用正在运行（`npm run dev` 或 `npm run dev:full`，默认 **http://127.0.0.1:8788**）；
> 浏览器 profile `.edge-profile/` 未被其他 Edge 窗口占用；页面**不在**演示预览模式。

```
① 导出当前状态      npm run state:export
② 备份快照          npm run state:backup
③ 修改 state.json   按 §4 对应小节编辑
④ 校验              npm run state:validate     ← 必须全绿
⑤ 应用并验证        npm run state:apply        ← 自动备份+导入+比对验证
```

### 步骤① 导出（`npm run state:export`）
- 自动打开 Edge（复用 `.edge-profile/` 登录态）→ 读取应用 localStorage 当前真实状态 → 字段校验 → 写入 `.edge-profile/state.json`。
- 若提示"该 origin 没有数据"：先真实模式下打开一次应用再重试（演示模式不写存储）。
- ⚠️ 首次使用：`state.json` 初始为**种子基线**（见 §8 注记），第一次 export 会刷新为你的真实运行态。

### 步骤② 备份（`npm run state:backup`）
- 把当前 `state.json` 快照到 `.edge-profile/backups/state-<时间戳>.json`，自动保留最近 20 份。
- 备份的是**改动前的状态**——这是你的撤销保险。

### 步骤③ 修改 state.json
- 只改需要变的部分，保持文件为**完整 AppState**（七块齐全）。按 §4 对应小节操作。
- 新增记录注意 id 与时间戳规则（§2.2）；改已有记录**只改目标字段**。
- 不要手改 `updatedAt`——应用写入时会自动刷新（但修改 `updatedAt` 本身合法）。

### 步骤④ 校验（`npm run state:validate`）
- 结构 / 枚举 / 必填 / id 唯一 / 日期格式逐项检查。**必须输出"校验通过"**，否则回到步骤③。

### 步骤⑤ 应用并验证（`npm run state:apply`）
- 自动执行：打开应用 `/data` → 检测**演示预览模式（红线，有则中止）** → 先备份应用内当前状态到 `backups/pre-apply-*.json` → 驱动「导入备份」→ 确认覆盖 → 读回 localStorage 与 state.json 逐字节比对。
- 登录云端的用户：导入后应用自动同步到 Firestore（防抖 600ms），其他设备登录同一账号即同步。
- 无头运行：`npm run state:apply -- --headless`（远程 / 定时场景）。

### 手动兜底路径（脚本不可用时）
1. `npm run state:export` 不可用 → 在应用 `/data` 页「导出完整备份（JSON）」，把下载文件另存为 `.edge-profile/state.json`；
2. `npm run state:apply` 不可用 → 在 `/data` 页「选择备份文件」选 `state.json` → 预览确认 → 「确认导入（覆盖）」。
3. 两条路径的**安全语义一致**：整包覆盖 + 有确认 + 有备份。

---

## 4. 各类数据操作细则

### 4.1 投递 applications

**新增一条投递**（必填：company / tier / channel / position / positionKind；status 默认 `计划投递`）：
```json
{
  "id": "app-1724380000000",
  "company": "XX 量化",
  "tier": "主攻",
  "channel": "官网",
  "position": "量化研究员（2026 届）",
  "positionKind": "量化研究",
  "status": "计划投递",
  "deadline": "2026-09-15",
  "appliedAt": "2026-08-22",
  "url": "https://careers.example.com/job/123",
  "note": "官网直接投，岗位匹配度高",
  "nextAction": "关注笔试通知",
  "createdAt": "2026-08-22T14:30:00.000Z",
  "updatedAt": "2026-08-22T14:30:00.000Z"
}
```
**状态流转**：改 `status` 字段即可（如 `"已投递"` → `"笔试"`）。建议按 §2.2 状态机顺序推进。
**修改其他字段**：只改目标字段（如补 `deadline`、改 `tier`、填 `nextAction`）。
**删除**：移除整个对象。⚠️ 删除不可撤销（可从备份恢复）。

### 4.2 面试记录 interviews

**新增**（questions **每题一行**，换行分隔；review 复盘）：
```json
{
  "id": "interview-1724380000000",
  "company": "XX 量化",
  "round": "一面",
  "date": "2026-08-22",
  "questions": "贝叶斯公式是什么？\n描述一下你的多因子选股流程\n如何防止过拟合",
  "review": "做得好：项目讲得顺。不好：贝叶斯答慢了。下次改进：概率题每天多刷 2 道。",
  "nextAction": "准备二面：手撕 SQL",
  "createdAt": "2026-08-22T15:00:00.000Z"
}
```
**修改 / 删除**：同上。注意 §2.3——改 questions 会联动面试题库。

### 4.3 周计划 weeklyPlans

**勾选任务**：找到 `week` 与任务 `id`，把 `done` 改为 `true` / `false`。
**新增任务**：往对应周的 `tasks` 追加 `{ "id": "task-1724380000000", "text": "...", "done": false }`（id 周内唯一）。
**删除任务**：从 `tasks` 移除。**不要删除整个 week**（周次 1–10 固定）。

### 4.4 项目 projects

**里程碑状态**：`pending`（未开始）→ `active`（进行中）→ `done`（完成）。
**新增里程碑**：追加 `{ "id": "f8", "title": "...", "status": "pending", "targetDate": "2026-09-10" }`。
**改项目状态 / output**：改顶层 `status` / `output`（如完成后填 GitHub 链接）。

### 4.5 知识 knowledge

**主题**：`status`（未开始/学习中/已掌握）、`priority`（高频/必考/加分）、`note` 可改；可整条增删。
**知识点**：`points` 内增删改 `{ id, title, summary, depth?, mastered }`。标记掌握即 `"mastered": true`。

### 4.6 设置 settings

**改作战起点校准周次**：改 `startDate`（如 `"2026-08-25"`）。
**改称呼 / 目标 / AI 提供商**：改对应字段。`aiProvider` 仅 `mock` / `deepseek`。

### 4.7 题库已掌握 questionBankMastered

**标记某题已掌握**：先按 §2.2 规则把题目文本规范化成键，再加入数组（去重）。
```json
// 题目："什么是夏普比率？" → 键："什么是夏普比率"
"questionBankMastered": ["什么是夏普比率", "如何防止过拟合"]
```
**取消标记**：从数组移除该键。题库本身（题目/频次/来源）由面试记录自动生成，勿在此直接增删。

---

## 5. 安全红线（违反即事故）

1. **备份先行**：任何改动前必须 `state:backup`；`apply` 还会自动备份应用内当前状态（`pre-apply-*.json`）双保险。
2. **演示模式绝不写**：`apply` 自动检测「演示预览中」横幅，检测到立即中止；手动路径请先「退出演示」。
3. **导入是整包覆盖**：`state.json` 必须是**完整 AppState**（七块齐全），禁止只含部分字段——否则会清空其余数据。
4. **真实数据不入库**：`state.json` 与 `backups/` 位于 `.edge-profile/`（gitignored）；任何导出文件勿提交 git、勿进公网目录。
5. **云端为准**：登录用户以 Firestore 为真、导入后自动同步；多端/多浏览器以同一 Firebase 账号互通，注意不同 origin（8788 / 4173 / web.app）localStorage 彼此独立。
6. **校验不过不应用**：`validate` 报错必须修到全绿，禁止带错 apply。
7. **id 不可复用**：新记录必须用新 id（时间戳前缀）；复用 id 会导致合并错乱。
8. **同一时刻只允许一个写操作**：apply 期间不要人工在页面同时改数据，避免互相覆盖。
9. **删除谨慎**：删除是永久的，恢复只能靠备份（§7）。

---

## 6. 常见更新请求速查表

| 你说 | 执行 |
|---|---|
| 新增一家公司投递 | §4.1 新增 → 五步流程 |
| XX 公司状态改为笔试 | §4.1 状态流转（改 status） |
| 补一下 XX 的投递链接 / 截止日 | §4.1 修改字段 |
| 录入今天 XX 公司的面经 | §4.2 新增（questions 每题一行） |
| 把 XX 面试的复盘改一下 | §4.2 修改 review |
| 勾选 W3 的"简历定稿" | §4.3 把对应任务 done 置 true |
| 项目1 的 f2 里程碑完成 | §4.4 里程碑 status 改 done |
| 标记知识点"贝叶斯公式"已掌握 | §4.5 points[].mastered 置 true |
| 某面试题已掌握 | §4.7 规范化键加入 questionBankMastered |
| 改作战起点 / 每日投递目标 | §4.6 settings |
| 恢复昨天的数据 | §7 从备份 apply 回滚 |
| 看看现在总共投了多少家 | 步骤① export 后看概况 |

---

## 7. 回滚与备份管理

- **备份命名**：`state-<yyyyMMddTHHmmss>.json`（手动备份）、`pre-apply-<时间戳>.json`（apply 自动备份）。
- **保留策略**：默认最近 20 份（`--keep N` 调整）；旧备份自动清理。
- **恢复**：把目标备份复制为 `state.json` → `npm run state:validate` → `npm run state:apply`；或直接在 `/data` 页导入该备份文件。
- **建议**：每周一导出一次全量备份到云盘（坚果云/OneDrive），防本机硬盘故障。

---

## 8. 命令速查

```bash
npm run state:export        # ① 从运行中的应用导出当前状态 → .edge-profile/state.json
npm run state:backup        # ② 快照 state.json 到 backups/
npm run state:validate      # ④ 字段级校验
npm run state:apply         # ⑤ 应用到应用（自动备份 + 导入 + 比对）
npm run state:apply -- --headless   # 无头运行（远程/定时）
node scripts/data/state-tools.mjs help            # 全部选项
# 可选参数：--file <路径> --base <url> --out <路径> --keep <N>
```

> **注记（初始基线）**：仓库初始 `state.json` 以 `src/data/seed.ts` 真实种子为基线生成
> （12 家冲刺公司、W1–W10、两个项目、24 个知识主题），时间戳为 2026-08-22T14:22:01.207Z。
> 首次执行 `state:export` 会用你浏览器中的真实运行数据覆盖它（含你已做过的修改），此后 state.json 始终是真实现状的工作副本。

---

## 附录 A：validate 校验规则清单（与脚本一致）

- 顶层：七块齐全（applications / interviews / weeklyPlans / projects / knowledge / settings / questionBankMastered）
- 枚举逐项核对（§2.2 全部 enum）；必填字段非空字符串 / 非负数字 / 布尔
- 日期：`yyyy-MM-dd`（日期字段）；ISO 8601 可解析（时间戳字段）
- 唯一性：applications.id / interviews.id / projects.id / knowledge.id 全局唯一；weeklyPlans.week 唯一且 1–10；task / milestone / point id 各自容器内唯一
- 结构：各嵌套数组必须存在且为数组

## 附录 B：更新请求话术模板（你只需这样说）

```
按 SOP 更新：
- 新增投递：公司=XX量化，分层=主攻，渠道=官网，岗位=量化研究员（2026 届），岗位类型=量化研究，截止日=2026-09-15
- 幻方 状态 → 笔试
- 录入面经：公司=XX量化，轮次=一面，日期=2026-08-22，问题/复盘如下…
- 项目1 f2 里程碑 → done
- 知识主题 k-kalman → 已掌握
- settings.startDate → 2026-08-25
```

## 附录 C：与现有文档的关系

- `docs/HANDOVER.md` §4 文件索引：已加入本 SOP 入口
- `README.md`：数据管理一节已指向本 SOP
- `docs/PROJECT_HANDBOOK.md` §8（数据管理）：与 `/data` 页机制一致，本 SOP 是其"操作化"标准

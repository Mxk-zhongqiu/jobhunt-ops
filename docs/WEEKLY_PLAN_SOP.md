# 周计划 · 内容与状态修改 SOP（专用入口）

> **一句话定位**：周计划是最高频的更新对象（每天勾选、每周调整任务），因此从主 SOP 中拆出**专用快捷入口**。
> 90% 的操作一条命令完成，不用打开 `state.json` 手改。
>
> - 主入口（覆盖全部 7 块数据）：[`docs/DATA_UPDATE_SOP.md`](DATA_UPDATE_SOP.md)
> - 执行工具：`npm run state:plan`（`scripts/data/state-tools.mjs plan`）
> - 状态文件：`.edge-profile/state.json`（gitignored，不入库）
> - 最后更新：2026-08-23

---

## 1. 三条核心命令（覆盖 90% 场景）

```bash
npm run state:plan -- list                          # 查看全部周计划与勾选状态
npm run state:plan -- check --task w3t1,w3t2        # 勾选/取消任务（默认切换）
npm run state:plan -- add --week 4 --text "笔试准备：SQL 基础"   # 新增任务
```

> 每次**写操作**自动完成：**备份 → 修改 → 校验 → 写盘**，最后提醒你 `npm run state:apply` 应用到应用。
> 未指定 `--week` 时默认**当前周**（按 `settings.startDate` 自动计算，与应用内一致）。

---

## 2. 数据结构（先懂再改）

```jsonc
"weeklyPlans": [
  {
    "week": 3,                       // 周次 1–10，固定不变，不可删除整周
    "label": "9/1–9/7 项目1完成",     // 周标签（可改）
    "tasks": [
      { "id": "w3t1", "text": "项目1：回测框架 + 分层回测", "done": false },   // 种子任务 id：w<周>t<序号>
      { "id": "task-1787464171253", "text": "每天投 5 家", "done": true }        // 新增任务 id：task-<时间戳>（自动生成）
    ]
  }
]
```

| 字段 | 规则 |
|---|---|
| `week` | 1–10 整数，全局唯一；**不要删除整周**（应用按周渲染） |
| `label` | 周标签文本，可改（如顺延日期范围） |
| `tasks[].id` | 周内唯一；种子 `w1t1…w10t3`，新增自动 `task-<时间戳>`，**禁止手填重复 id** |
| `tasks[].text` | 任务内容，可改 |
| `tasks[].done` | 布尔；`true`=已勾选，`false`=未勾选 |

---

## 3. 命令详解

### 3.1 查看 `list`

```bash
npm run state:plan -- list                 # 全部十周
npm run state:plan -- list --week 3        # 只看第 3 周
```
输出示例：
```
📅 当前周：第 1 周（按 settings.startDate=2026-08-18 计算）
W1 8/18–8/24 定方向与启动（3/6 完成）
  [x] w1t1 定方向：明确冲刺 / 主攻 / 保底目标分层
  [ ] w1t2 搭 Python 环境，刷 pandas 基础
```

### 3.2 勾选/取消 `check`（状态修改）

```bash
npm run state:plan -- check --task w3t1            # 切换：已勾→取消，未勾→勾上
npm run state:plan -- check --task w3t1 --done true     # 显式设为已完成
npm run state:plan -- check --task w3t1,w3t2,w3t3       # 批量（逗号分隔）
```
> `--task` 的 id 从 `list` 输出中复制；一次可勾多个，用逗号分隔。

### 3.3 新增任务 `add`（内容修改）

```bash
npm run state:plan -- add --week 4 --text "笔试准备：SQL 基础"
# 不写 --week 默认加到当前周；id 自动生成 task-<时间戳>，done=false
```

### 3.4 删除任务 `remove`（内容修改）

```bash
npm run state:plan -- remove --week 3 --task w3t2
# ⚠️ 删除不可撤销（备份里可恢复，见 §6）
```

### 3.5 修改任务文本 `edit`（内容修改）

```bash
npm run state:plan -- edit --week 3 --task w3t1 --text "项目1：回测框架 + 分层回测（含手续费）"
```

### 3.6 修改周标签 `label`（内容修改）

```bash
npm run state:plan -- label --week 3 --text "9/1–9/7 项目1完成（提前 2 天）"
```

### 选项总表

| 选项 | 适用 | 说明 |
|---|---|---|
| `--week <1-10>` | check/add/remove/edit/label | 目标周次；缺省=当前周 |
| `--task <id>` | check/remove/edit | 任务 id（check 支持逗号分隔多个） |
| `--text "..."` | add/edit/label | 文本内容 |
| `--done <true\|false>` | check | 显式指定状态；缺省=切换 |
| `--file <path>` | 全部 | 指定状态文件（默认 `.edge-profile/state.json`） |
| `--no-backup` | 写操作 | 跳过修改前自动备份（仅批量脚本场景谨慎使用） |

---

## 4. 完整五步流程（批量 / 复杂修改时）

一次改很多条（比如整周重排）时，走主 SOP 标准流程，直接编辑 `state.json` 的 `weeklyPlans`：

1. `npm run state:export`（导出当前真实状态）
2. `npm run state:backup`（备份）
3. 编辑 `.edge-profile/state.json` 的 `weeklyPlans`（规则见 §2）
4. `npm run state:validate`（必须全绿）
5. `npm run state:apply`（应用到应用）

> 快捷命令本质 = 自动完成 2/3/4 步 + 保留第 5 步让你确认。批量场景建议走完整流程。

---

## 5. 日常速查表

| 你要做的事 | 命令 |
|---|---|
| 看看这周还剩啥 | `npm run state:plan -- list` |
| 完成 W3 的三件事 | `npm run state:plan -- check --task w3t1,w3t2,w3t3` |
| 勾错了，取消 | `npm run state:plan -- check --task w3t1`（再切一次） |
| 这周加一件新任务 | `npm run state:plan -- add --text "..."` |
| 删掉一条过时任务 | `npm run state:plan -- remove --task w2t4` |
| 改一条任务的表述 | `npm run state:plan -- edit --task w3t1 --text "..."` |
| 周标签日期顺延 | `npm run state:plan -- label --text "..."` |
| 改动生效 | `npm run state:apply` |

---

## 6. 安全红线（周计划专用）

1. **周次固定**：`week` 1–10 是骨架，删除整周会破坏应用渲染；只增删改 `tasks`。
2. **id 唯一**：新增任务的 id 由命令自动生成；手改时不得复用已有 id。
3. **自动备份**：每次写操作前自动快照（`backups/state-<时间戳>.json`，保留最近 20 份）；恢复 = 把备份复制为 `state.json` 后 `apply`。
4. **改的是 state.json，不是应用**：所有 `state:plan` 只改工作副本；**必须 `state:apply` 才进应用**（apply 会自动检测演示预览模式并中止）。
5. **校验内置**：每次写盘前自动跑字段校验，校验不过不写盘。
6. **先 export 再批量改**：批量编辑前务必 `state:export` 刷新，避免在过期副本上改。

---

## 7. 与主 SOP 的关系

- 本文件是 `docs/DATA_UPDATE_SOP.md` §4.3（周计划）的**快捷操作版**；字段校验规则与主 SOP 附录 A 完全一致。
- 新增命令/字段变更时：同步更新本文件 §2/§3 与主 SOP §4.3。

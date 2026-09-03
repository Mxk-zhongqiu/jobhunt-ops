/* global process, console */
// ============================================================================
// jobhunt-ops 状态工具集 ——《数据更新 SOP》(docs/DATA_UPDATE_SOP.md) 的执行层
// ----------------------------------------------------------------------------
// 子命令：
//   export    从运行中的应用（浏览器 localStorage）导出当前真实状态 → state.json
//   validate  字段级校验 state.json（结构 + 枚举 + 必填 + id 唯一 + 日期格式）
//   backup    把 state.json 快照到 .edge-profile/backups/（保留最近 N 份）
//   apply     把 state.json 全量应用到运行中的应用（Playwright 驱动 /data 导入）
//   help      打印用法
//
// 约定（与 SOP 一致）：
//   - 规范状态文件：.edge-profile/state.json（gitignored，真实数据不入库）
//   - 目标 origin：http://127.0.0.1:8801（npm run dev / dev:full）
//   - 浏览器：本机 Edge + 持久化 profile（.edge-profile/，复用现有自动化基建）
//   - 应用前自动备份应用内当前状态到 backups/pre-apply-*.json（双保险）
// ============================================================================
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { findEdgeExecutable, defaultProfileDir } from "../browser/edge-launcher.mjs";

// ─── 常量 ────────────────────────────────────────────────────────────────────
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const STATE_FILE = resolve(PROJECT_ROOT, ".edge-profile", "state.json");
const BACKUP_DIR = resolve(PROJECT_ROOT, ".edge-profile", "backups");
const STORAGE_PREFIX = "jobhunt-ops-state-v1";
const DEFAULT_BASE = "http://127.0.0.1:8801";
const DEFAULT_KEEP = 20;

// 读取"当前生效"状态槽：已登录时应用数据落在带 :uid 的账号槽，未登录落在游客槽（键即前缀）。
// 两者兼容：优先账号槽，无账号槽时退回游客槽。
async function readActiveState(page) {
  return page.evaluate((prefix) => {
    const keys = Object.keys(window.localStorage).filter((k) => k === prefix || k.startsWith(prefix + ":"));
    if (!keys.length) return null;
    const key = keys.find((k) => k.includes(":")) ?? keys[0];
    return window.localStorage.getItem(key);
  }, STORAGE_PREFIX);
}

// ─── 枚举字典（与 src/types/domain.ts 保持一致） ─────────────────────────────
const ENUMS = {
  tier: ["冲刺", "主攻", "保底"],
  platform: ["Boss直聘", "猎聘", "官网", "牛客", "应届生", "学校就业网", "内推", "实习转正", "其他平台"],
  status: ["计划投递", "已投递", "笔试", "一面", "二面", "终面", "Offer", "已拒绝", "放弃"],
  positionKind: ["量化研究", "量化开发", "金融科技", "数据分析", "风控", "其他"],
  milestoneStatus: ["pending", "active", "done"],
  projectStatus: ["active", "paused", "done"],
  topicPriority: ["高频", "必考", "加分"],
  topicStatus: ["未开始", "学习中", "已掌握"],
  pointDepth: ["基础", "进阶"],
  aiProvider: ["mock", "deepseek"],
};

// 旧「渠道(channel)」→「来源平台(platform)」兼容映射（应用端已自动迁移；这里放行旧 state 里的历史 channel 值）
const LEGACY_CHANNEL_MAP = {
  官网: "官网",
  牛客: "牛客",
  应届生: "应届生",
  学校就业网: "学校就业网",
  内推: "内推",
  实习转正: "实习转正",
  其他: "其他平台",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ─── 基础校验工具 ────────────────────────────────────────────────────────────
const errors = [];
function err(path, message) {
  errors.push(`${path}：${message}`);
}
function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}
function isOptionalString(v) {
  return v === undefined || v === "" || typeof v === "string";
}
function isValidDate(s) {
  if (typeof s !== "string" || !ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d); // 本地时区构造，纯日历校验，无 UTC 偏移问题
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
function isValidDateTime(s) {
  if (typeof s !== "string") return false;
  const t = Date.parse(s);
  return !Number.isNaN(t) && /T| /.test(s);
}
function checkEnum(path, value, allowed) {
  if (!allowed.includes(value)) err(path, `取值 "${value}" 非法，应为：${allowed.join(" | ")}`);
}
function checkIdUniqueness(list, pathOf, label) {
  const seen = new Set();
  for (const item of list) {
    if (!item || typeof item.id !== "string" || !item.id) continue;
    if (seen.has(item.id)) err(`${pathOf}(${item.id})`, `${label} id 重复：${item.id}`);
    seen.add(item.id);
  }
}

// ─── 全量校验：返回错误数组（空 = 通过） ─────────────────────────────────────
export function validateState(state) {
  errors.length = 0;
  if (typeof state !== "object" || state === null) {
    errors.push("state：不是对象");
    return [...errors];
  }

  // settings
  const s = state.settings;
  if (typeof s !== "object" || s === null) {
    err("settings", "缺失或不是对象");
  } else {
    if (!isNonEmptyString(s.targetName)) err("settings.targetName", "缺失或为空");
    if (!isValidDate(s.startDate)) err("settings.startDate", `日期格式非法：${s.startDate}（应为 yyyy-MM-dd）`);
    if (typeof s.dailySubmitTarget !== "number" || s.dailySubmitTarget < 0) err("settings.dailySubmitTarget", "应为非负数字");
    if (typeof s.totalTarget !== "number" || s.totalTarget < 0) err("settings.totalTarget", "应为非负数字");
    checkEnum("settings.aiProvider", s.aiProvider, ENUMS.aiProvider);
  }

  // applications
  if (!Array.isArray(state.applications)) err("applications", "缺失或不是数组");
  else {
    checkIdUniqueness(state.applications, "applications", "投递");
    state.applications.forEach((a, i) => {
      const p = `applications[${i}]`;
      if (typeof a !== "object" || a === null) return err(p, "不是对象");
      if (!isNonEmptyString(a.company)) err(`${p}.company`, "缺失或为空");
      checkEnum(`${p}.tier`, a.tier, ENUMS.tier);
      // 来源平台是唯一来源维度：新记录校验 platform；旧记录若仍带 channel（且无 platform），能映射则放行、不能则提示改为 platform
      const legacyPlatform = LEGACY_CHANNEL_MAP[a.channel];
      if (a.channel !== undefined && a.platform === undefined && legacyPlatform === undefined) {
        err(`${p}.channel`, `旧「渠道」值 "${a.channel}" 无法映射到来源平台，请改为 platform 字段`);
      } else if (a.platform !== undefined) {
        checkEnum(`${p}.platform`, a.platform, ENUMS.platform);
      }
      if (!isNonEmptyString(a.position)) err(`${p}.position`, "缺失或为空");
      checkEnum(`${p}.positionKind`, a.positionKind, ENUMS.positionKind);
      checkEnum(`${p}.status`, a.status, ENUMS.status);
      if (a.deadline !== undefined && !isValidDate(a.deadline)) err(`${p}.deadline`, `日期格式非法：${a.deadline}`);
      if (a.appliedAt !== undefined && !isValidDate(a.appliedAt)) err(`${p}.appliedAt`, `日期格式非法：${a.appliedAt}`);
      if (!isOptionalString(a.url)) err(`${p}.url`, "应为字符串");
      if (!isOptionalString(a.note)) err(`${p}.note`, "应为字符串");
      if (!isOptionalString(a.nextAction)) err(`${p}.nextAction`, "应为字符串");
      if (!isValidDateTime(a.createdAt)) err(`${p}.createdAt`, "时间戳非法");
      if (!isValidDateTime(a.updatedAt)) err(`${p}.updatedAt`, "时间戳非法");
    });
  }

  // interviews
  if (!Array.isArray(state.interviews)) err("interviews", "缺失或不是数组");
  else {
    checkIdUniqueness(state.interviews, "interviews", "面试记录");
    state.interviews.forEach((iv, i) => {
      const p = `interviews[${i}]`;
      if (typeof iv !== "object" || iv === null) return err(p, "不是对象");
      if (!isNonEmptyString(iv.company)) err(`${p}.company`, "缺失或为空");
      if (!isNonEmptyString(iv.round)) err(`${p}.round`, "缺失或为空（笔试/一面/二面/终面/HR 面）");
      if (!isValidDate(iv.date)) err(`${p}.date`, `日期格式非法：${iv.date}（应为 yyyy-MM-dd）`);
      if (typeof iv.questions !== "string") err(`${p}.questions`, "缺失或不是字符串（每题一行）");
      if (typeof iv.review !== "string") err(`${p}.review`, "缺失或不是字符串");
      if (!isOptionalString(iv.nextAction)) err(`${p}.nextAction`, "应为字符串");
      if (!isValidDateTime(iv.createdAt)) err(`${p}.createdAt`, "时间戳非法");
    });
  }

  // weeklyPlans
  if (!Array.isArray(state.weeklyPlans)) err("weeklyPlans", "缺失或不是数组");
  else {
    const seenWeeks = new Set();
    state.weeklyPlans.forEach((plan, i) => {
      const p = `weeklyPlans[${i}]`;
      if (typeof plan !== "object" || plan === null) return err(p, "不是对象");
      if (!Number.isInteger(plan.week) || plan.week < 1 || plan.week > 10) err(`${p}.week`, `应为 1–10 的整数，实际：${plan.week}`);
      else if (seenWeeks.has(plan.week)) err(`${p}.week`, `周次重复：${plan.week}`);
      else seenWeeks.add(plan.week);
      if (!isNonEmptyString(plan.label)) err(`${p}.label`, "缺失或为空");
      if (!Array.isArray(plan.tasks)) err(`${p}.tasks`, "缺失或不是数组");
      else {
        const seenTask = new Set();
        plan.tasks.forEach((t, j) => {
          const tp = `${p}.tasks[${j}]`;
          if (typeof t !== "object" || t === null) return err(tp, "不是对象");
          if (typeof t.id !== "string" || !t.id) err(`${tp}.id`, "缺失或为空");
          else if (seenTask.has(t.id)) err(`${tp}.id`, `任务 id 重复：${t.id}`);
          else seenTask.add(t.id);
          if (!isNonEmptyString(t.text)) err(`${tp}.text`, "缺失或为空");
          if (typeof t.done !== "boolean") err(`${tp}.done`, "应为布尔值");
        });
      }
    });
  }

  // projects
  if (!Array.isArray(state.projects)) err("projects", "缺失或不是数组");
  else {
    checkIdUniqueness(state.projects, "projects", "项目");
    state.projects.forEach((proj, i) => {
      const p = `projects[${i}]`;
      if (typeof proj !== "object" || proj === null) return err(p, "不是对象");
      if (!isNonEmptyString(proj.name)) err(`${p}.name`, "缺失或为空");
      if (!isNonEmptyString(proj.goal)) err(`${p}.goal`, "缺失或为空");
      checkEnum(`${p}.status`, proj.status, ENUMS.projectStatus);
      if (!isOptionalString(proj.output)) err(`${p}.output`, "应为字符串");
      if (!Array.isArray(proj.milestones)) err(`${p}.milestones`, "缺失或不是数组");
      else {
        const seenMs = new Set();
        proj.milestones.forEach((m, j) => {
          const mp = `${p}.milestones[${j}]`;
          if (typeof m !== "object" || m === null) return err(mp, "不是对象");
          if (typeof m.id !== "string" || !m.id) err(`${mp}.id`, "缺失或为空");
          else if (seenMs.has(m.id)) err(`${mp}.id`, `里程碑 id 重复：${m.id}`);
          else seenMs.add(m.id);
          if (!isNonEmptyString(m.title)) err(`${mp}.title`, "缺失或为空");
          checkEnum(`${mp}.status`, m.status, ENUMS.milestoneStatus);
          if (m.targetDate !== undefined && !isValidDate(m.targetDate)) err(`${mp}.targetDate`, `日期格式非法：${m.targetDate}`);
        });
      }
    });
  }

  // knowledge
  if (!Array.isArray(state.knowledge)) err("knowledge", "缺失或不是数组");
  else {
    checkIdUniqueness(state.knowledge, "knowledge", "知识主题");
    state.knowledge.forEach((topic, i) => {
      const p = `knowledge[${i}]`;
      if (typeof topic !== "object" || topic === null) return err(p, "不是对象");
      if (!isNonEmptyString(topic.category)) err(`${p}.category`, "缺失或为空");
      if (!isNonEmptyString(topic.name)) err(`${p}.name`, "缺失或为空");
      checkEnum(`${p}.priority`, topic.priority, ENUMS.topicPriority);
      checkEnum(`${p}.status`, topic.status, ENUMS.topicStatus);
      if (!isOptionalString(topic.note)) err(`${p}.note`, "应为字符串");
      if (!Array.isArray(topic.points)) err(`${p}.points`, "缺失或不是数组");
      else {
        const seenPt = new Set();
        topic.points.forEach((pt, j) => {
          const pp = `${p}.points[${j}]`;
          if (typeof pt !== "object" || pt === null) return err(pp, "不是对象");
          if (typeof pt.id !== "string" || !pt.id) err(`${pp}.id`, "缺失或为空");
          else if (seenPt.has(pt.id)) err(`${pp}.id`, `知识点 id 重复：${pt.id}`);
          else seenPt.add(pt.id);
          if (!isNonEmptyString(pt.title)) err(`${pp}.title`, "缺失或为空");
          if (typeof pt.summary !== "string") err(`${pp}.summary`, "缺失或不是字符串");
          if (pt.depth !== undefined) checkEnum(`${pp}.depth`, pt.depth, ENUMS.pointDepth);
          if (typeof pt.mastered !== "boolean") err(`${pp}.mastered`, "应为布尔值");
        });
      }
    });
  }

  // questionBankMastered
  if (!Array.isArray(state.questionBankMastered)) err("questionBankMastered", "缺失或不是数组");
  else {
    state.questionBankMastered.forEach((key, i) => {
      if (!isNonEmptyString(key)) err(`questionBankMastered[${i}]`, "应为非空字符串（规范化题目键）");
    });
  }

  return [...errors];
}

// ─── 文件读写 ────────────────────────────────────────────────────────────────
function readStateFile(file) {
  if (!existsSync(file)) {
    console.error(`❌ 状态文件不存在：${file}`);
    console.error(`   首次使用请先运行 export（从应用导出当前状态），或确认路径。`);
    process.exit(1);
  }
  let raw;
  try {
    raw = readFileSync(file, "utf8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1); // 剥离 UTF-8 BOM（Windows 工具常见）
  } catch (e) {
    console.error(`❌ 读取失败：${file}（${e.message}）`);
    process.exit(1);
  }
  let state;
  try {
    state = JSON.parse(raw);
  } catch (e) {
    console.error(`❌ ${file} 不是合法 JSON：${e.message}`);
    process.exit(1);
  }
  return state;
}

function printSummary(state) {
  const mastered = Array.isArray(state.questionBankMastered) ? state.questionBankMastered.length : 0;
  console.log(
    `📊 状态概况：${state.applications.length} 家投递 · ${state.interviews.length} 条面试 · ` +
      `${state.weeklyPlans.length} 周计划 · ${state.projects.length} 个项目 · ` +
      `${state.knowledge.length} 个知识主题 · ${mastered} 个已掌握标记`,
  );
}

// ─── validate 子命令 ─────────────────────────────────────────────────────────
function cmdValidate({ file }) {
  const state = readStateFile(file);
  const list = validateState(state);
  if (list.length === 0) {
    console.log(`✅ 校验通过：${file}`);
    printSummary(state);
    process.exit(0);
  }
  console.error(`❌ 校验失败（${list.length} 处）：`);
  for (const e of list) console.error(`   - ${e}`);
  console.error(`   修复后再运行 validate，全绿后才能 apply。`);
  process.exit(1);
}

// ─── export 子命令 ───────────────────────────────────────────────────────────
async function cmdExport({ base, out, headless }) {
  const exe = findEdgeExecutable();
  if (!exe) {
    console.error("❌ 未找到 Microsoft Edge（可设环境变量 EDGE_PATH 指定 msedge.exe）。");
    process.exit(1);
  }
  console.log(`🔌 打开 ${base}（${headless ? "headless" : "有窗口"}，profile=.edge-profile）…`);
  const context = await chromium.launchPersistentContext(defaultProfileDir(), {
    executablePath: exe,
    headless,
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
  });
  try {
    const page = await context.newPage();
    await page.goto(base + "/data", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(1800); // 等 SPA 挂载与状态加载
    const raw = await readActiveState(page);
    if (!raw) {
      console.error(`❌ ${base} 在该浏览器 profile 的 localStorage 中没有数据（游客槽 ${STORAGE_PREFIX} 或账号槽 ${STORAGE_PREFIX}:<uid>）。`);
      console.error(`   可能原因：应用从未用此 profile 打开过该 origin；或浏览器处于演示预览模式（不写存储）。`);
      console.error(`   解决：先在真实模式下打开 ${base} 一次，再重试 export。`);
      process.exit(1);
    }
    let state;
    try {
      state = JSON.parse(raw);
    } catch {
      console.error("❌ 读到的 localStorage 内容不是合法 JSON，已中止导出（未覆盖 state.json）。");
      process.exit(1);
    }
    const list = validateState(state);
    if (list.length > 0) {
      console.error(`❌ 应用内当前状态未通过字段校验（${list.length} 处），已中止导出，避免污染 state.json：`);
      for (const e of list) console.error(`   - ${e}`);
      process.exit(1);
    }
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(state, null, 2) + "\n", "utf8");
    console.log(`✅ 已导出当前真实状态 → ${out}`);
    printSummary(state);
    console.log(`   （提示：建议随后运行 backup 存档，再开始修改）`);
  } finally {
    await context.close();
  }
}

// ─── backup 子命令 ───────────────────────────────────────────────────────────
function cmdBackup({ file, keep }) {
  const state = readStateFile(file);
  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15); // yyyyMMddTHHmmss
  const dest = resolve(BACKUP_DIR, `state-${stamp}.json`);
  copyFileSync(file, dest);
  console.log(`✅ 已备份 → ${dest}`);
  // 清理旧备份，保留最近 keep 份
  const all = readdirSync(BACKUP_DIR).filter((n) => /^state-\d{8}T\d{6}\.json$/.test(n)).sort();
  const remove = all.length - keep;
  if (remove > 0) {
    for (const n of all.slice(0, remove)) {
      const p = resolve(BACKUP_DIR, n);
      try {
        rmSync(p);
        console.log(`🧹 已清理旧备份：${n}`);
      } catch {
        /* 忽略清理失败 */
      }
    }
  }
}

// ─── apply 子命令 ────────────────────────────────────────────────────────────
async function cmdApply({ file, base, headless }) {
  const state = readStateFile(file);
  const list = validateState(state);
  if (list.length > 0) {
    console.error(`❌ state.json 未通过校验（${list.length} 处），禁止应用：`);
    for (const e of list) console.error(`   - ${e}`);
    process.exit(1);
  }
  const exe = findEdgeExecutable();
  if (!exe) {
    console.error("❌ 未找到 Microsoft Edge（可设环境变量 EDGE_PATH 指定 msedge.exe）。");
    process.exit(1);
  }
  console.log(`🔌 打开 ${base}（${headless ? "headless" : "有窗口"}，profile=.edge-profile）…`);
  const context = await chromium.launchPersistentContext(defaultProfileDir(), {
    executablePath: exe,
    headless,
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
  });
  try {
    const page = await context.newPage();
    // 捕获确认对话框（导入覆盖前的 window.confirm）
    page.on("dialog", (dialog) => dialog.accept());

    await page.goto(base + "/data", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(1200);

    // 红线 1：演示预览模式禁止写入（demo 不落 localStorage / 云端）
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes("演示预览中")) {
      console.error("❌ 检测到「演示预览」模式（黄色横幅），已中止应用——演示模式不写真实数据。");
      console.error("   请在页面点击「退出演示」后重试。");
      process.exit(1);
    }

    // 双保险：应用前先备份应用内当前状态
    const rawBefore = await readActiveState(page);
    if (rawBefore) {
      mkdirSync(BACKUP_DIR, { recursive: true });
      const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
      const dest = resolve(BACKUP_DIR, `pre-apply-${stamp}.json`);
      writeFileSync(dest, rawBefore, "utf8");
      console.log(`🛡️ 应用前已备份应用内当前状态 → ${dest}`);
    } else {
      console.warn("⚠️ 应用内 localStorage 为空（首次使用？），将直接导入 state.json。");
    }

    // 驱动 /data 导入流程：选文件 → 预览 → 确认覆盖
    const importBtn = page.getByRole("button", { name: "选择备份文件" });
    await importBtn.waitFor({ state: "visible", timeout: 30000 });
    await importBtn.click();
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(file);
    const confirmBtn = page.getByRole("button", { name: "确认导入" });
    await confirmBtn.waitFor({ state: "visible", timeout: 15000 });
    console.log("👀 已读到待导入内容预览，点击「确认导入（覆盖）」…");
    await confirmBtn.click();
    await page.getByText(/导入完成/).waitFor({ state: "visible", timeout: 20000 });
    console.log("✅ 页面提示「导入完成」。");

    // 验证：读回 localStorage 与源文件比对（等待云端回显/写盘稳定）
    await page.waitForTimeout(2000);
    const rawAfter = await readActiveState(page);
    let after = null;
    try {
      after = JSON.parse(rawAfter);
    } catch {
      /* 解析失败按不一致处理 */
    }
    // 深度比较（消除"源格式化 vs 页面紧凑"的字符串格式误报）
    const equal = after !== null && JSON.stringify(after) === JSON.stringify(state);
    if (equal) {
      console.log("✅ 验证通过：应用内状态与 state.json 完全一致。");
      printSummary(state);
    } else {
      const diff =
        after && Array.isArray(after.applications)
          ? `投递 ${after.applications.length}（源 ${state.applications.length}）· 面试 ${after.interviews.length}（源 ${state.interviews.length}）`
          : "无法解析";
      console.error(`⚠️ 验证未完全一致（${diff}）。`);
      console.error(`   请人工检查页面状态；如需恢复可用 backups/pre-apply-*.json。`);
      process.exit(1);
    }
  } finally {
    await context.close();
  }
}

// ─── plan 子命令：周计划快捷入口（内容与状态修改） ────────────────────────────
// 文档：docs/WEEKLY_PLAN_SOP.md；写操作统一走「自动备份 → 修改 → 校验 → 写盘」，
// 之后仍需 state:apply 才会应用到运行中的应用。
function planCurrentWeek(state) {
  const start = new Date(`${state.settings.startDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return 1;
  const diffDays = Math.floor((Date.now() - start.getTime()) / 86_400_000);
  return Math.min(10, Math.max(1, Math.floor(diffDays / 7) + 1));
}

function planFindWeek(state, week) {
  return state.weeklyPlans.find((p) => p.week === week) ?? null;
}

function planResolveWeek(state, a) {
  if (a.week !== null) {
    if (!Number.isInteger(a.week) || a.week < 1 || a.week > 10) {
      console.error(`❌ --week 应为 1–10 的整数，实际：${a.week}`);
      process.exit(1);
    }
    return a.week;
  }
  const cur = planCurrentWeek(state);
  console.log(`ℹ️  未指定 --week，默认当前周：第 ${cur} 周`);
  return cur;
}

function planRequireWeek(state, a) {
  const plan = planFindWeek(state, a.week);
  if (!plan) {
    console.error(`❌ 未找到第 ${a.week} 周计划（week 范围 1–10）。`);
    process.exit(1);
  }
  return plan;
}

function planList(state, week) {
  const cur = planCurrentWeek(state);
  console.log(`📅 当前周：第 ${cur} 周（按 settings.startDate=${state.settings.startDate} 计算）`);
  const plans = week ? state.weeklyPlans.filter((p) => p.week === week) : state.weeklyPlans;
  if (!plans.length) {
    console.error(`❌ 没有周次为 ${week} 的周计划。`);
    process.exit(1);
  }
  for (const plan of plans) {
    const doneCount = plan.tasks.filter((t) => t.done).length;
    console.log(`W${plan.week} ${plan.label}（${doneCount}/${plan.tasks.length} 完成）`);
    for (const t of plan.tasks) {
      console.log(`  ${t.done ? "[x]" : "[ ]"} ${t.id} ${t.text}`);
    }
  }
}

function planWriteBack(state, file) {
  const list = validateState(state);
  if (list.length > 0) {
    console.error(`❌ 修改后校验失败（${list.length} 处），未写盘，state.json 保持原样：`);
    for (const e of list) console.error(`   - ${e}`);
    return false;
  }
  writeFileSync(file, JSON.stringify(state, null, 2) + "\n", "utf8");
  console.log(`✅ 已写入 ${file}`);
  printSummary(state);
  console.log(`   ▶ 下一步：npm run state:apply 把改动应用到应用（自动备份应用内现状 + 导入 + 验证）`);
  return true;
}

function planCheck(state, a) {
  const plan = planRequireWeek(state, a);
  const ids = (a.task ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!ids.length) {
    console.error("❌ 缺少任务 id（--task <id>，多个用逗号分隔，如 --task w3t1,w3t2）。");
    process.exit(1);
  }
  for (const id of ids) {
    const t = plan.tasks.find((x) => x.id === id);
    if (!t) {
      console.error(`❌ 第 ${a.week} 周没有任务 id「${id}」。可用任务：`);
      for (const x of plan.tasks) console.error(`   - ${x.id} ${x.text}`);
      process.exit(1);
    }
    const next = a.done === null ? !t.done : a.done;
    t.done = next;
    console.log(`☑️  ${t.id}「${t.text}」→ ${next ? "已完成 [x]" : "未完成 [ ]"}`);
  }
}

function planAdd(state, a) {
  const plan = planRequireWeek(state, a);
  const text = (a.text ?? "").trim();
  if (!text) {
    console.error('❌ 缺少任务文本（--text "任务内容"）。');
    process.exit(1);
  }
  const dup = plan.tasks.find((x) => x.text === text);
  if (dup) console.warn(`⚠️ 该周已有相同文本任务（${dup.id}），仍会新增一条。`);
  const id = `task-${Date.now()}`;
  plan.tasks.push({ id, text, done: false });
  console.log(`➕ 已新增任务：${id}「${text}」（第 ${a.week} 周，未完成）`);
}

function planRemove(state, a) {
  const plan = planRequireWeek(state, a);
  const idx = plan.tasks.findIndex((x) => x.id === a.task);
  if (idx < 0) {
    console.error(`❌ 第 ${a.week} 周没有任务 id「${a.task}」。可用任务：`);
    for (const x of plan.tasks) console.error(`   - ${x.id} ${x.text}`);
    process.exit(1);
  }
  const [removed] = plan.tasks.splice(idx, 1);
  console.log(`🗑️  已删除任务：${removed.id}「${removed.text}」`);
}

function planEdit(state, a) {
  const plan = planRequireWeek(state, a);
  const t = plan.tasks.find((x) => x.id === a.task);
  if (!t) {
    console.error(`❌ 第 ${a.week} 周没有任务 id「${a.task}」。可用任务：`);
    for (const x of plan.tasks) console.error(`   - ${x.id} ${x.text}`);
    process.exit(1);
  }
  const text = (a.text ?? "").trim();
  if (!text) {
    console.error('❌ 缺少新文本（--text "新内容"）。');
    process.exit(1);
  }
  console.log(`✏️  任务 ${t.id}：${t.text} → ${text}`);
  t.text = text;
}

function planLabel(state, a) {
  const plan = planRequireWeek(state, a);
  const text = (a.text ?? "").trim();
  if (!text) {
    console.error('❌ 缺少新标签（--text "新标签"）。');
    process.exit(1);
  }
  console.log(`🏷️  第 ${a.week} 周标签：${plan.label} → ${text}`);
  plan.label = text;
}

function parsePlanArgs(raw) {
  const a = { action: raw[0], week: null, task: null, text: null, done: null, file: STATE_FILE, keep: DEFAULT_KEEP, noBackup: false, help: false };
  for (let i = 1; i < raw.length; i++) {
    const k = raw[i];
    if (k === "--week") a.week = Number(raw[++i]);
    else if (k === "--task") a.task = raw[++i] ?? "";
    else if (k === "--text") a.text = raw[++i] ?? "";
    else if (k === "--done") a.done = String(raw[++i]).toLowerCase() === "true";
    else if (k === "--file") a.file = resolve(PROJECT_ROOT, raw[++i] ?? "");
    else if (k === "--keep") a.keep = Number(raw[++i]) || DEFAULT_KEEP;
    else if (k === "--no-backup") a.noBackup = true;
    else if (k === "--help" || k === "-h") a.help = true;
    else {
      console.error(`未知参数：${k}`);
      a.help = true;
    }
  }
  return a;
}

function printPlanHelp() {
  console.log(`周计划快捷入口（内容与状态修改）—— 直接改 .edge-profile/state.json

用法：
  npm run state:plan -- <操作> [选项]

操作：
  list                     列出全部周计划任务与勾选状态（--week 3 只看第 3 周）
  check --task <id>        勾选/取消任务（默认切换；--done true|false 显式指定；多个用逗号分隔）
  add --text "..."         新增任务（自动生成 id，未完成）
  remove --task <id>       删除任务
  edit --task <id> --text "..."   修改任务文本
  label --text "..."       修改周标签

选项：
  --week <1-10>      目标周次（写操作未指定时默认当前周，按 settings.startDate 计算）
  --task <id>        任务 id（list 输出中可见）
  --text "..."       文本内容
  --done <true|false>  check 时显式设定状态（缺省为切换）
  --file <path>      状态文件（默认 .edge-profile/state.json）
  --no-backup        跳过修改前自动备份（仅批量场景谨慎使用）

每次写操作自动：备份 → 修改 → 校验 → 写盘；随后运行 npm run state:apply 应用到应用。
详见 docs/WEEKLY_PLAN_SOP.md`);
}

async function cmdPlan(raw) {
  const a = parsePlanArgs(raw);
  if (a.help || !a.action || a.action === "help") {
    printPlanHelp();
    process.exit(a.help || a.action === "help" ? 0 : 1);
  }
  const WRITE_ACTIONS = ["check", "add", "remove", "edit", "label"];
  const state = readStateFile(a.file);

  if (a.action === "list") {
    planList(state, a.week);
    process.exit(0);
  }
  if (!WRITE_ACTIONS.includes(a.action)) {
    console.error(`未知操作：${a.action}`);
    printPlanHelp();
    process.exit(1);
  }

  a.week = planResolveWeek(state, a);
  if (!a.noBackup) cmdBackup({ file: a.file, keep: a.keep }); // 修改前自动备份

  switch (a.action) {
    case "check": planCheck(state, a); break;
    case "add": planAdd(state, a); break;
    case "remove": planRemove(state, a); break;
    case "edit": planEdit(state, a); break;
    case "label": planLabel(state, a); break;
  }
  if (!planWriteBack(state, a.file)) process.exit(1);
  process.exit(0);
}

// ─── CLI 解析 ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { file: STATE_FILE, base: DEFAULT_BASE, out: STATE_FILE, headless: false, keep: DEFAULT_KEEP, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--file": args.file = resolve(PROJECT_ROOT, argv[++i] ?? ""); break;
      case "--out": args.out = resolve(PROJECT_ROOT, argv[++i] ?? ""); break;
      case "--base": args.base = argv[++i] ?? DEFAULT_BASE; break;
      case "--headless": args.headless = true; break;
      case "--keep": args.keep = Number(argv[++i]) || DEFAULT_KEEP; break;
      case "--help": case "-h": args.help = true; break;
      default:
        if (a.startsWith("-")) {
          console.error(`未知参数：${a}`);
          args.help = true;
        } else if (!args.cmd) args.cmd = a;
    }
  }
  return args;
}

function printHelp() {
  console.log(`jobhunt-ops 状态工具集（数据更新 SOP 执行层）

用法：
  node scripts/data/state-tools.mjs <命令> [选项]

命令：
  export     从运行中的应用导出当前真实状态 → state.json（默认 .edge-profile/state.json）
  validate   字段级校验 state.json（结构/枚举/必填/id 唯一/日期）
  backup     把 state.json 快照到 .edge-profile/backups/（默认保留最近 20 份）
  apply      把 state.json 全量应用到运行中的应用（驱动 /data 导入，自动备份+验证）
  help       显示本帮助

选项：
  --file <path>   状态文件路径（默认 .edge-profile/state.json）
  --out <path>    export 输出路径（默认同 state.json）
  --base <url>    应用地址（默认 http://127.0.0.1:8801）
  --headless      Edge 无头运行（apply/export）
  --keep <n>      backup 保留份数（默认 20）

前置条件：
  - 应用正在运行（npm run dev 或 npm run dev:full → 8801）
  - 浏览器 profile .edge-profile 未被其他 Edge 窗口占用
  - 完整流程见 docs/DATA_UPDATE_SOP.md`);
}

// ─── 入口 ────────────────────────────────────────────────────────────────────
const rawArgv = process.argv.slice(2);
if (rawArgv[0] === "plan") {
  // 周计划快捷入口（独立参数解析，见 docs/WEEKLY_PLAN_SOP.md）
  await cmdPlan(rawArgv.slice(1));
  process.exit(0);
}
const args = parseArgs(rawArgv);
if (args.help || !args.cmd) {
  printHelp();
  process.exit(args.help ? 0 : 1);
}

switch (args.cmd) {
  case "validate":
    cmdValidate(args);
    break;
  case "backup":
    cmdBackup(args);
    break;
  case "export":
    await cmdExport(args);
    break;
  case "apply":
    await cmdApply(args);
    break;
  case "help":
    printHelp();
    process.exit(0);
    break;
  default:
    console.error(`未知命令：${args.cmd}`);
    printHelp();
    process.exit(1);
}

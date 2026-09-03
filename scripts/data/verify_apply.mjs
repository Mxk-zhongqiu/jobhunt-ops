// 验证 apply 结果：读 8801 页面 localStorage，对比周计划勾选状态与 state.json
// 用法: node scripts/data/verify_apply.mjs
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { findEdgeExecutable, defaultProfileDir } from "../browser/edge-launcher.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const STATE_FILE = resolve(ROOT, ".edge-profile", "state.json");
const KEY = "jobhunt-ops-state-v1";

// 读取"当前生效"槽：已登录时数据在账号槽（键带 :uid），未登录在游客槽（键即前缀）
async function readActiveState(page) {
  return page.evaluate((prefix) => {
    const keys = Object.keys(window.localStorage).filter((k) => k === prefix || k.startsWith(prefix + ":"));
    if (!keys.length) return null;
    const key = keys.find((k) => k.includes(":")) ?? keys[0];
    return window.localStorage.getItem(key);
  }, KEY);
}

const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));

const exe = findEdgeExecutable();
const context = await chromium.launchPersistentContext(defaultProfileDir(), {
  executablePath: exe, headless: true, viewport: { width: 1280, height: 800 }, locale: "zh-CN",
});
try {
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:8801/data", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1500);
  const raw = await readActiveState(page);
  if (!raw) { console.log("❌ localStorage 为空"); process.exit(1); }
  const app = JSON.parse(raw);

  // 1) 周计划勾选对比
  const want = {};
  for (const w of state.weeklyPlans) for (const t of w.tasks) want[t.id] = t.done;
  const got = {};
  for (const w of app.weeklyPlans) for (const t of w.tasks) got[t.id] = t.done;
  const ids = new Set([...Object.keys(want), ...Object.keys(got)]);
  let mismatch = 0;
  console.log("=== 周计划勾选对比（state.json vs 页面）===");
  for (const id of [...ids].sort()) {
    const w = want[id], g = got[id];
    if (w !== g) { console.log(`  [差异] ${id}: 源=${w} 页面=${g}`); mismatch++; }
  }
  console.log(mismatch === 0 ? "✅ 周计划全部一致" : `❌ ${mismatch} 处差异`);

  // 2) 整体差异定位（顶层键）
  const k1 = Object.keys(state).sort().join(",");
  const k2 = Object.keys(app).sort().join(",");
  console.log(`\n=== 顶层键 ===\n源: ${k1}\n页: ${k2}`);
  console.log(`\n=== 关键计数 ===\n投递: 源=${state.applications.length} 页=${app.applications.length}`
    + ` | 面试: ${state.interviews.length}/${app.interviews.length}`
    + ` | 周计划任务数: ${state.weeklyPlans.reduce((a, w) => a + w.tasks.length, 0)}/${app.weeklyPlans.reduce((a, w) => a + w.tasks.length, 0)}`);
  console.log("\n=== 深度一致检查（消除格式差异）===");
  const equal = JSON.stringify(app) === JSON.stringify(state);
  console.log(equal ? "✅ 深度一致" : "❌ 深度不一致（见上方差异）");
} finally {
  await context.close();
}

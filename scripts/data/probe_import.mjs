// 实验：apply 导入后立即读 localStorage（防抖 600ms 内），判断是导入失败还是被回滚
// 用法: node scripts/data/probe_import.mjs
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
const want = {};
for (const w of state.weeklyPlans) for (const t of w.tasks) want[t.id] = t.done;

const exe = findEdgeExecutable();
const context = await chromium.launchPersistentContext(defaultProfileDir(), {
  executablePath: exe, headless: true, viewport: { width: 1280, height: 800 }, locale: "zh-CN",
});
const page = await context.newPage();
page.on("dialog", (d) => d.accept());
try {
  await page.goto("http://127.0.0.1:8801/data", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1200);
  // 选择备份文件 → 预览 → 确认
  await page.getByRole("button", { name: "选择备份文件" }).click();
  await page.locator('input[type="file"]').setInputFiles(STATE_FILE);
  await page.getByRole("button", { name: "确认导入" }).click();
  await page.getByText(/导入完成/).waitFor({ state: "visible", timeout: 20000 });

  // 立即读（T0，同步前）
  const t0 = await readActiveState(page);
  // 等 1.2s（超过 600ms 防抖）再读（T1）
  await page.waitForTimeout(1200);
  const t1 = await readActiveState(page);

  const check = (raw, label) => {
    if (!raw) return console.log(`${label}: localStorage 为空`);
    const app = JSON.parse(raw);
    const got = {};
    for (const w of app.weeklyPlans) for (const t of w.tasks) got[t.id] = t.done;
    const mism = Object.keys(want).filter((id) => got[id] !== want[id]);
    const len = raw.length;
    console.log(`${label}: 长度=${len} | 周计划差异: ${mism.length ? mism.join(",") : "无（全部一致）"}`);
  };
  check(t0, "T0(导入瞬间)");
  check(t1, "T1(1.2s后)");
  console.log(`T0===T1: ${t0 === t1 ? "是（无变化）" : "否（被改写！）"}`);
} finally {
  await context.close();
}

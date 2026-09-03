// 探测页面 UI 实际状态：登录态 / 周计划显示 / 同步状态
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { findEdgeExecutable, defaultProfileDir } from "../browser/edge-launcher.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const exe = findEdgeExecutable();
const context = await chromium.launchPersistentContext(defaultProfileDir(), {
  executablePath: exe, headless: true, viewport: { width: 1440, height: 900 }, locale: "zh-CN",
});
try {
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:8801", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(3000);

  // 1) 登录态：找用户邮箱/头像/同步指示
  const body = await page.evaluate(() => document.body.innerText);
  const emailMatch = body.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  const syncMatch = body.match(/(已同步|同步中|同步出错|本地模式|未配置云端)/);

  // 2) 周计划显示：找关键任务
  const hasW1t5 = body.includes("数据获取") && body.includes("因子");
  const hasPaperTrading = body.includes("模拟实盘");
  // 找勾选状态指示（[x] 或 已完成 或 1/7 等）
  const progressMatch = body.match(/(\d+)\/(\d+) 完成/);

  console.log(`=== 页面 UI 状态 ===`);
  console.log(`登录邮箱: ${emailMatch ? emailMatch[0] : "未找到（可能未登录）"}`);
  console.log(`同步状态: ${syncMatch ? syncMatch[0] : "未找到指示"}`);
  console.log(`周计划进度: ${progressMatch ? progressMatch[0] : "未找到"}`);
  console.log(`含'模拟实盘'任务: ${hasPaperTrading}`);
  console.log(`含'数据获取+因子'任务: ${hasW1t5}`);

  // 3) localStorage 与 auth
  const lsKeys = await page.evaluate(() => Object.keys(window.localStorage));
  console.log(`\nlocalStorage 键: ${lsKeys.join(", ")}`);
  const state = await page.evaluate((prefix) => {
    // 读取"当前生效"槽：账号槽（键带 :uid）优先，游客槽兜底
    const keys = Object.keys(window.localStorage).filter((k) => k === prefix || k.startsWith(prefix + ":"));
    if (!keys.length) return null;
    const key = keys.find((k) => k.includes(":")) ?? keys[0];
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const s = JSON.parse(raw);
    const tasks = {};
    for (const w of s.weeklyPlans) for (const t of w.tasks) tasks[t.id] = t.done;
    return { nTask: Object.keys(tasks).length, w1t5: tasks["w1t5"], w2t1: tasks["w2t1"], w3t2: tasks["w3t2"], paper: tasks["task-1787467354105"] };
  }, "jobhunt-ops-state-v1");
  console.log(`localStorage 状态: ${JSON.stringify(state)}`);
} finally {
  await context.close();
}

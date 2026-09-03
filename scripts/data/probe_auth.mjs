// 探测 .edge-profile 的 Firebase 登录态（localStorage + IndexedDB）
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { findEdgeExecutable, defaultProfileDir } from "../browser/edge-launcher.mjs";

const exe = findEdgeExecutable();
const context = await chromium.launchPersistentContext(defaultProfileDir(), {
  executablePath: exe, headless: true, viewport: { width: 1440, height: 900 }, locale: "zh-CN",
});
try {
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:8801", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);
  const ls = await page.evaluate(() => Object.keys(window.localStorage));
  console.log(`localStorage 键: ${ls.join(", ")}`);
  // Firebase auth 可能存 IndexedDB
  const idb = await page.evaluate(async () => {
    const names = await indexedDB.databases ? (await indexedDB.databases()).map(d => d.name) : [];
    return names;
  });
  console.log(`IndexedDB 数据库: ${idb.join(", ")}`);
  // 读 firebase auth 键
  const authRaw = await page.evaluate(() => {
    const keys = Object.keys(window.localStorage).filter(k => k.includes("firebase"));
    return keys.map(k => `${k}: ${(window.localStorage.getItem(k) || "").slice(0, 80)}`);
  });
  console.log(`firebase 相关 localStorage:\n${authRaw.join("\n") || "无"}`);
  // 顶栏状态（body 文本中含邮箱/同步）
  const body = await page.evaluate(() => document.body.innerText);
  const email = body.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  const sync = body.match(/(已云端同步|同步中|云端待上传|同步异常|登录 \/ 注册)/);
  console.log(`\n邮箱: ${email ? email[0] : "无"} | 同步/登录指示: ${sync ? sync[0] : "无"}`);
} finally {
  await context.close();
}

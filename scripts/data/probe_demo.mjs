// 探测：演示预览模式？顶栏登录状态？同步状态？
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
  await page.goto("http://127.0.0.1:8801", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);
  const body = await page.evaluate(() => document.body.innerText);
  console.log(`演示预览横幅: ${body.includes("演示预览中") ? "⚠️ 是（处于演示模式！）" : "否"}`);
  console.log(`登录/注册按钮: ${body.includes("登录 / 注册") ? "有" : "无"}`);
  console.log(`上传本机数据: ${body.includes("上传本机数据") ? "有" : "无"}`);
  console.log(`退出演示按钮: ${body.includes("退出演示") ? "有" : "无"}`);
  console.log(`已同步指示: ${/(已云端同步|同步中|云端待上传|同步异常)/.test(body) ? body.match(/(已云端同步|同步中|云端待上传|同步异常)/)[0] : "无"}`);
  // 邮箱
  const m = body.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  console.log(`页面邮箱: ${m ? m[0] : "无"}`);
  // 顶栏按钮文本（前 300 字符）
  console.log(`\n=== 页面文本(前 400) ===\n${body.slice(0, 400)}`);
} finally {
  await context.close();
}

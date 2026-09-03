// 精确读取页面 UI 周计划板块的任务与勾选状态
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
  await page.waitForTimeout(3000);
  const body = await page.evaluate(() => document.body.innerText);
  // 抓取包含关键任务的上下文行
  for (const kw of ["数据获取", "IC 分析", "回测框架", "模拟实盘", "因子扩充"]) {
    const idx = body.indexOf(kw);
    if (idx >= 0) {
      console.log(`[${kw}] ...${body.slice(Math.max(0, idx - 40), idx + 40).replace(/\n/g, "⏎")}...`);
    } else {
      console.log(`[${kw}] 未在页面文本中找到`);
    }
  }
  console.log(`\n=== 页面总文本长度: ${body.length} ===`);
} finally {
  await context.close();
}

/* global console, process */
// 探测公网站点：能否出网 + 线上知识页是否包含知识点模块
// 用法：node scripts/browser/probe-live.mjs <url>
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchEdge } from "./edge-launcher.mjs";

const url = process.argv[2] ?? "https://jobhunt-ops.web.app";
const profileDir = mkdtempSync(join(tmpdir(), "dsh-live-probe-"));
const context = await launchEdge({ headless: true, profileDir });
const page = context.pages()[0] ?? (await context.newPage());

try {
  const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  console.log(`HTTP ${response?.status() ?? "?"} · 最终 URL: ${page.url()}`);
  const title = await page.title();
  console.log(`标题: ${title}`);

  // 检查首页是否渲染（SPA）
  const hasApp = await page.locator(".app-shell, .sidebar, .topbar").count();
  console.log(`应用外壳渲染: ${hasApp ? "是 ✅" : "否 ❌"}`);

  // 去知识页
  await page.goto(`${url}/knowledge`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForTimeout(1500);
  const topicCount = await page.locator(".topic-item, .topic-row").count();
  const statTexts = await page.$$eval(".stat-card", (els) => els.map((el) => el.innerText.replace(/\s+/g, " ").trim()).slice(0, 4));
  console.log(`知识页主题行数: ${topicCount}`);
  console.log(`统计条: ${statTexts.join(" | ") || "(无)"}`);

  // 关键：是否存在知识点模块特征（展开面板/添加知识点按钮/知识点进度）
  const hasPointFeature = await page.locator("text=添加知识点").count() + await page.locator(".topic-progress, .point-row, .knowledge-search").count();
  console.log(`知识点模块特征元素数: ${hasPointFeature} ${hasPointFeature ? "✅ 已上线" : "❌ 未上线"}`);

  // 展开第一个主题看是否有知识点
  const firstRow = page.locator(".topic-item .topic-row, .topic-row").first();
  if (await firstRow.count()) {
    await firstRow.click();
    await page.waitForTimeout(800);
    const points = await page.locator(".point-row:not(.point-edit), .topic-detail").count();
    const detailText = (await page.locator(".topic-detail, .point-empty").first().innerText().catch(() => ""))?.slice(0, 120);
    console.log(`展开后详情元素数: ${points} · 文本: ${detailText || "(无)"}`);
  }
} catch (error) {
  console.log(`❌ 出网失败（沙箱限制或站点不可达）: ${error.message.split("\n")[0]}`);
}

await context.close();

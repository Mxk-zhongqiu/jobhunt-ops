/* global console */
// 线上部署验收：知识页知识点模块 + 演示数据（无真实公司）
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchEdge } from "./edge-launcher.mjs";

const base = "https://jobhunt-ops.web.app";
const profileDir = mkdtempSync(join(tmpdir(), "dsh-live-final-"));
const context = await launchEdge({ headless: true, profileDir });
const page = context.pages()[0] ?? (await context.newPage());
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`[verify] ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`); };

// 知识页
await page.goto(`${base}/knowledge`, { waitUntil: "networkidle", timeout: 30_000 });
await page.waitForTimeout(1500);
const stats = await page.$$eval(".stat-card", (els) => els.map((el) => el.innerText.replace(/\s+/g, " ").trim()).slice(0, 4));
console.log("[verify] 统计条:", stats.join(" | "));
check("统计条含「知识点总数」", stats.some((s) => s.includes("知识点总数")), stats[1] ?? "");
const topics = await page.locator(".topic-item .topic-row, .topic-row").count();
check("演示主题数=17（非真实 24）", topics === 17, `实际 ${topics}`);
check("搜索框存在", (await page.locator(".knowledge-search input").count()) === 1);
check("「导出 Markdown」按钮存在", (await page.locator("button", { hasText: "导出 Markdown" }).count()) === 1);

// 展开第一个主题（概率论，演示数据有 2 条示例点）
const firstRow = page.locator(".topic-item .topic-row").first();
if (await firstRow.count()) {
  await firstRow.click();
  await page.waitForTimeout(800);
  const points = await page.locator(".topic-detail .point-row:not(.point-edit)").count();
  check("展开后显示知识点列表", points >= 1, `实际 ${points} 条`);
  check("「添加知识点」按钮存在（展开态）", (await page.locator(".topic-detail button", { hasText: "添加知识点" }).count()) === 1);
  check("「编辑主题」按钮存在（展开态）", (await page.locator(".topic-detail button", { hasText: "编辑主题" }).count()) === 1);
  const firstPoint = await page.locator(".topic-detail .point-title").first().innerText().catch(() => "");
  check("示例知识点内容", firstPoint.includes("条件概率") || firstPoint.includes("贝叶斯"), firstPoint);
}

// 投递页：应为虚构公司
await page.goto(`${base}/applications`, { waitUntil: "networkidle", timeout: 30_000 });
await page.waitForTimeout(1500);
const companyText = await page.locator(".app-row").allInnerTexts();
const companies = companyText.map((t) => t.split(/\s+/)[0]).filter(Boolean).slice(0, 6);
console.log("[verify] 投递公司前 6 个:", companies.join(" | "));
const realLeak = ["幻方", "九坤", "明汯", "衍复", "宽德", "灵均"].some((c) => companies.includes(c));
check("投递为虚构公司（无真实泄漏）", !realLeak, companies.join("、"));

// 深链接
const resp = await page.goto(`${base}/question-bank`, { waitUntil: "networkidle", timeout: 30_000 });
check("深链接 /question-bank 可打开", (resp?.status() ?? 0) === 200 && (await page.locator("h2", { hasText: "题库" }).count()) >= 0);

await context.close();
const failed = results.filter((r) => !r.ok);
console.log(`[verify] 完成：${results.length - failed.length}/${results.length} 通过${failed.length ? " ❌" : " ✅"}`);
process.exit(failed.length ? 1 : 0);

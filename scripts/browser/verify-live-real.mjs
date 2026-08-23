/* global console */
// 公网真实版验收：真实数据 + 知识点模块 + DeepSeek 入口 + 登录组件
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchEdge } from "./edge-launcher.mjs";

const base = "https://jobhunt-ops.web.app";
const profileDir = mkdtempSync(join(tmpdir(), "dsh-live-real-"));
const context = await launchEdge({ headless: true, profileDir });
const page = context.pages()[0] ?? (await context.newPage());
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`[verify] ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`); };

// 知识页：真实主题 + 知识点模块
await page.goto(`${base}/knowledge`, { waitUntil: "networkidle", timeout: 30_000 });
await page.waitForTimeout(1500);
const stats = await page.$$eval(".stat-card", (els) => els.map((el) => el.innerText.replace(/\s+/g, " ").trim()).slice(0, 4));
console.log("[verify] 统计条:", stats.join(" | "));
check("主题数=24（真实种子）", stats[0]?.startsWith("主题总数 24"), stats[0] ?? "");
check("统计条含「知识点总数」", stats.some((s) => s.includes("知识点总数")));
check("搜索框存在", (await page.locator(".knowledge-search input").count()) === 1);

// 投递页：真实公司
await page.goto(`${base}/applications`, { waitUntil: "networkidle", timeout: 30_000 });
await page.waitForTimeout(1500);
const companyText = await page.locator(".app-row").allInnerTexts();
const companies = companyText.map((t) => t.split(/\s+/)[0]).filter(Boolean).slice(0, 5);
console.log("[verify] 投递公司前 5 个:", companies.join(" | "));
check("投递为真实公司（幻方等）", companies.includes("幻方") && companies.includes("九坤"), companies.join("、"));

// AI 页：公网展示 DeepSeek 入口（无"仅本地 Mock"）
await page.goto(`${base}/ai`, { waitUntil: "networkidle", timeout: 30_000 });
await page.waitForTimeout(1500);
const hasDeepSeekBtn = await page.locator(".provider-switch button", { hasText: "DeepSeek 真实 API" }).count();
const hasDemoBanner = (await page.locator("text=公网展示版").count()) > 0;
check("公网显示 DeepSeek 真实 API 入口", hasDeepSeekBtn === 1, `按钮=${hasDeepSeekBtn}`);
check("无「公网展示版」限制提示", !hasDemoBanner);
check("「知识点生成」能力存在", (await page.locator(".ai-capability-grid button", { hasText: "知识点生成" }).count()) === 1);

await context.close();
const failed = results.filter((r) => !r.ok);
console.log(`[verify] 完成：${results.length - failed.length}/${results.length} 通过${failed.length ? " ❌" : " ✅"}`);
process.exit(failed.length ? 1 : 0);

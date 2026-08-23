/* global console, process */
// AI 云端回退链路验证（本地代理未配置密钥 → 自动走云端 Worker）：
// 1) DeepSeek 状态徽章显示「已配置（云端）」；2) 未登录点生成 → AUTH_REQUIRED（证明走云端而非本地）
// 用法：node scripts/browser/verify-ai-cloud-fallback.mjs [baseUrl]
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchEdge } from "./edge-launcher.mjs";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:8801";
const STORAGE_KEY = "jobhunt-ops-state-v1";

const profileDir = mkdtempSync(join(tmpdir(), "dsh-ai-cloud-check-"));
const context = await launchEdge({ headless: true, profileDir });
const page = context.pages()[0] ?? (await context.newPage());
const errors = [];
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
page.on("console", (msg) => {
  if (msg.type() === "error" && !msg.text().includes("404")) errors.push(`console: ${msg.text()}`);
});

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`[verify] ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`); };

await page.goto(`${baseUrl}/ai`, { waitUntil: "networkidle", timeout: 30_000 });
await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".ai-capability-grid button", { timeout: 10_000 });

// 切换到 DeepSeek 真实 API
await page.locator(".provider-switch button", { hasText: "DeepSeek 真实 API" }).click();
await page.waitForSelector(".provider-status", { timeout: 10_000 });
const badge = await page.locator(".provider-status").innerText();
check("状态徽章显示「已配置（云端）」", badge.includes("已配置（云端）"), badge);

// 未登录点生成 → 应提示先登录（AUTH_REQUIRED 在客户端发出，证明走云端链路；本地会报 AI_NOT_CONFIGURED）
await page.locator("textarea").first().fill("测试云端链路");
await page.locator("button[type='submit']").click();
await page.waitForSelector(".ai-error", { timeout: 15_000 });
const errText = await page.locator(".ai-error").innerText();
check("未登录提示先登录（走云端链路）", errText.includes("登录"), errText);

// 切回 Mock 仍可正常生成（兜底不破坏）
await page.locator(".provider-switch button", { hasText: "Mock 本地规则" }).click();
await page.waitForTimeout(200);
await page.locator("textarea").first().fill("Mock 兜底测试");
await page.locator("button[type='submit']").click();
await page.waitForSelector(".ai-review", { timeout: 15_000 });
await page.waitForTimeout(300);
check("Mock 兜底可用", (await page.locator(".ai-answer").count()) >= 1);

await context.close();

const failed = results.filter((r) => !r.ok);
if (errors.length) console.log("[verify] 页面错误：", errors.join("\n"));
console.log(`[verify] 完成：${results.length - failed.length}/${results.length} 通过${failed.length ? " ❌" : " ✅"}`);
process.exit(failed.length || errors.length ? 1 : 0);

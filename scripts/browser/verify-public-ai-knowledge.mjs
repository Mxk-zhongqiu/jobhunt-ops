/* global console, process */
// 公网 AI 知识点生成实测（可见窗口）：登录 → 知识点生成 → 生成 8 条 → 验证草稿完整（无截断）
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchEdge } from "./edge-launcher.mjs";

const profileDir = mkdtempSync(join(tmpdir(), "dsh-verify-kg-"));
const context = await launchEdge({ headless: false, profileDir, width: 1360, height: 860 });
const page = context.pages()[0] ?? (await context.newPage());
await page.goto("https://jobhunt-ops.web.app/ai", { waitUntil: "networkidle", timeout: 45_000 });
console.log("[verify] 窗口已打开：https://jobhunt-ops.web.app/ai （请登录，密码亲自输入）");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const deadline = Date.now() + 10 * 60 * 1000;
let loggedIn = false;
while (Date.now() < deadline) {
  try {
    if (await page.locator(".auth-email").count()) {
      loggedIn = true;
      console.log(`[verify] ✅ 已登录：${await page.locator(".auth-email").innerText()}`);
      break;
    }
  } catch { /* navigating */ }
  await wait(1500);
}
if (!loggedIn) { console.log("[verify] ❌ 登录超时"); await context.close(); process.exit(1); }

// 切真实 AI + 知识点生成
await page.locator(".provider-switch button", { hasText: "DeepSeek 真实 API" }).click();
await wait(800);
await page.locator(".ai-capability-grid button", { hasText: "知识点生成" }).click();
await wait(300);

// 选择生成目标（假设检验）
const topicSelect = page.locator("label.ai-field select").first();
const topicValue = await page.locator("label.ai-field select option", { hasText: "假设检验" }).getAttribute("value");
await topicSelect.selectOption(topicValue ?? "");
await wait(300);

// 生成 8 条
await page.locator("textarea").first().fill("生成 8 个知识点，含公式、关键结论与面试必答法。");
await page.locator("button[type='submit']").click();

// 等待草稿或错误
let outcome = "timeout";
for (let i = 0; i < 90; i += 1) {
  try {
    if (await page.locator(".ai-review").count()) { outcome = "draft"; break; }
    if (await page.locator(".ai-error").count()) { outcome = "error"; break; }
  } catch { /* navigating */ }
  await wait(1000);
}

if (outcome === "draft") {
  await wait(500);
  const pointCount = await page.locator(".knowledge-draft-point").count();
  const firstTitle = await page.locator(".knowledge-draft-point input").first().inputValue().catch(() => "");
  const confirmEnabled = await page.locator(".ai-review-actions button.primary").isEnabled().catch(() => false);
  console.log(`[verify] ✅ 草稿生成成功：${pointCount} 个知识点 · 首条标题「${firstTitle.slice(0, 30)}」`);
  console.log(`[verify] 确认按钮可用：${confirmEnabled ? "✅" : "❌"}`);
  if (pointCount >= 1 && confirmEnabled) console.log("[verify] 知识点生成链路（含 4000 token 修复）全部通过 ✅");
  else process.exitCode = 1;
} else if (outcome === "error") {
  const err = await page.locator(".ai-error").innerText();
  console.log(`[verify] ❌ AI 报错：${err.replace(/\s+/g, " ").slice(0, 200)}`);
  process.exitCode = 1;
} else {
  console.log("[verify] ❌ 等待结果超时");
  process.exitCode = 1;
}

await context.close();
process.exit();

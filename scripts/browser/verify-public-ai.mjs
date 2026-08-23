/* global console, process */
// 公网 AI 端到端验证（可见窗口）：用户登录 → 切换 DeepSeek(云端) → 真实调用一次
// 验证：登录令牌 → Worker 白名单(AI_ALLOWED_EMAILS) → DeepSeek 真实返回
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchEdge } from "./edge-launcher.mjs";

const profileDir = mkdtempSync(join(tmpdir(), "dsh-verify-public-ai-"));
const context = await launchEdge({ headless: false, profileDir, width: 1360, height: 860 });
const page = context.pages()[0] ?? (await context.newPage());
await page.goto("https://jobhunt-ops.web.app/ai", { waitUntil: "networkidle", timeout: 45_000 });
console.log("[verify] 窗口已打开：https://jobhunt-ops.web.app/ai （请登录 you@example.com，密码亲自输入）");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const deadline = Date.now() + 10 * 60 * 1000;
let loggedIn = false;
while (Date.now() < deadline) {
  try {
    if (await page.locator(".auth-email").count()) {
      if (!loggedIn) {
        loggedIn = true;
        console.log(`[verify] ✅ 已登录：${await page.locator(".auth-email").innerText()}`);
      }
      break;
    }
  } catch { /* navigating */ }
  await wait(1500);
}
if (!loggedIn) {
  console.log("[verify] ❌ 等待登录超时（10 分钟）");
  await context.close();
  process.exit(1);
}

// 切到 DeepSeek 真实 API
await page.locator(".provider-switch button", { hasText: "DeepSeek 真实 API" }).click();
await page.waitForSelector(".provider-switch .provider-status", { timeout: 15_000 });
const badge = await page.locator(".provider-switch .provider-status").innerText();
console.log(`[verify] 提供商状态：${badge}`);

// 触发一次真实生成（知识问答，最小成本）
await page.locator("textarea").first().fill("用一句话回答：什么是夏普比率？");
await page.locator("button[type='submit']").click();

// 等待草稿或错误
let outcome = "timeout";
for (let i = 0; i < 60; i += 1) {
  try {
    if (await page.locator(".ai-answer").count()) { outcome = "answer"; break; }
    if (await page.locator(".ai-error").count()) { outcome = "error"; break; }
  } catch { /* navigating */ }
  await wait(1000);
}

if (outcome === "answer") {
  const text = (await page.locator(".ai-answer").innerText()).slice(0, 200);
  console.log(`[verify] ✅ 真实 AI 返回成功：${text}`);
  console.log("[verify] 端到端链路（登录→白名单→DeepSeek）全部通过 ✅");
} else if (outcome === "error") {
  const err = await page.locator(".ai-error").innerText();
  console.log(`[verify] ❌ AI 调用报错：${err.replace(/\s+/g, " ").slice(0, 200)}`);
} else {
  console.log("[verify] ❌ 等待结果超时");
}

await page.screenshot({ path: ".edge-profile/verify-public-ai.png" }).catch(() => {});
await context.close();
process.exit(outcome === "answer" ? 0 : 1);

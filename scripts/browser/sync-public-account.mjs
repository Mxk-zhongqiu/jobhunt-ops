/* global console, process */
// 账号同步引导（可见窗口模式，密码不经过聊天）：
//  窗口1：打开公网站点，等待用户登录 you@example.com 并完成「上传本机数据」
//  窗口2：打开 Cloudflare 控制台（供用户配置 AI 白名单）
// 运行期间保持浏览器打开；用户完成后由外部终止本任务（关闭浏览器）。
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchEdge } from "./edge-launcher.mjs";

const profileDir = mkdtempSync(join(tmpdir(), "dsh-sync-account-"));
const context = await launchEdge({ headless: false, profileDir, width: 1360, height: 860 });

const sitePage = context.pages()[0] ?? (await context.newPage());
await sitePage.goto("https://jobhunt-ops.web.app", { waitUntil: "networkidle", timeout: 45_000 });
console.log("[sync] 窗口1 已打开：https://jobhunt-ops.web.app （请在窗口1完成登录+上传）");

const cfPage = await context.newPage();
await cfPage.goto("https://dash.cloudflare.com", { waitUntil: "domcontentloaded", timeout: 45_000 });
console.log("[sync] 窗口2 已打开：https://dash.cloudflare.com （Cloudflare 控制台）");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const deadline = Date.now() + 25 * 60 * 1000; // 25 分钟
let loggedIn = false;
let uploadHinted = false;
let reported = false;

while (Date.now() < deadline) {
  try {
    const emailEl = sitePage.locator(".auth-email");
    if (await emailEl.count()) {
      const email = await emailEl.innerText();
      if (!loggedIn) {
        loggedIn = true;
        console.log(`[sync] ✅ 已登录：${email}`);
      }
      const label = await sitePage.locator(".auth-user .provider-status").innerText().catch(() => "");
      if (label.includes("已云端同步")) {
        if (!reported) {
          reported = true;
          console.log("[sync] ✅ 云端同步完成（已云端同步）");
          // 采样同步后的数据，确认是真实种子
          await sitePage.goto("https://jobhunt-ops.web.app/knowledge", { waitUntil: "networkidle", timeout: 30_000 }).catch(() => {});
          await wait(1500);
          const stats = await sitePage.$$eval(".stat-card", (els) => els.map((el) => el.innerText.replace(/\s+/g, " ").trim()).slice(0, 2)).catch(() => []);
          await sitePage.goto("https://jobhunt-ops.web.app/applications", { waitUntil: "networkidle", timeout: 30_000 }).catch(() => {});
          await wait(1500);
          const companies = await sitePage.locator(".app-row").allInnerTexts().catch(() => []);
          console.log(`[sync] 知识页统计：${stats.join(" | ") || "(读取失败)"}`);
          console.log(`[sync] 投递公司前3：${companies.slice(0, 3).map((t) => t.split(/\s+/)[0]).filter(Boolean).join("、") || "(读取失败)"}`);
        }
        break;
      }
      if (label.includes("云端待上传") && !uploadHinted) {
        uploadHinted = true;
        console.log("[sync] ⏳ 云端待上传：请在窗口1点击「上传本机数据」按钮");
      }
    }
  } catch {
    // 页面正在跳转或已被用户关闭
  }
  await wait(2000);
}

if (!reported) console.log("[sync] 等待超时（25 分钟）或窗口已关闭：若你已完成登录+上传，请直接告诉我结果；否则可重跑本脚本。");
console.log("[sync] 浏览器保持打开（供继续使用 Cloudflare 控制台）；不再输出新信息。");

// 保持进程存活以维持浏览器窗口，直到外部终止
for (;;) await wait(60_000);

/* global console, process */
// 冒烟测试：验证 Playwright 能成功驱动本机 Edge
// 用法：
//   npm run browser:smoke                  # 有窗口模式（默认），打开 example.com 并截图
//   node scripts/browser/smoke-test.mjs https://www.boss直聘.com  # 打开指定网址
//   node scripts/browser/smoke-test.mjs --headless                 # 无头模式
import { launchEdge } from "./edge-launcher.mjs";

const args = process.argv.slice(2);
const headless = args.includes("--headless");
const url = args.find((a) => a.startsWith("http")) ?? "https://example.com";

console.log(`[browser] 启动 Edge（headless=${headless}）…`);
const context = await launchEdge({ headless });
const page = context.pages()[0] ?? (await context.newPage());

console.log(`[browser] 打开 ${url} …`);
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

const title = await page.title();
console.log(`[browser] 页面标题：${title}`);
console.log(`[browser] 最终 URL：${page.url()}`);

const shot = ".edge-profile/smoke.png";
await page.screenshot({ path: shot });
console.log(`[browser] 截图已保存：${shot}`);

await context.close();
console.log("[browser] 冒烟测试通过 ✅");

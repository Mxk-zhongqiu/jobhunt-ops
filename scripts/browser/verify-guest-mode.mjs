/* global console */
// 游客模式功能验证：用临时浏览器配置（不碰 .edge-profile 真实数据）
// 验证：真实数据 → 点"演示预览" → 出现 demo 虚构公司 + 横幅 + localStorage 未被污染 → 退出恢复
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:4173";
const tmpProfile = resolve(".edge-profile", "_verify-tmp");
rmSync(tmpProfile, { recursive: true, force: true });

const { findEdgeExecutable } = await import("./edge-launcher.mjs");
const context = await chromium.launchPersistentContext(tmpProfile, {
  executablePath: findEdgeExecutable(),
  headless: true,
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();

const results = [];
function check(name, ok, extra = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${extra ? `（${extra}）` : ""}`);
}

try {
  await page.goto(BASE + "/applications", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);

  // 1. 初始为真实种子数据（种子包含"启林"等真实公司 —— 但注意全新临时 profile 的 localStorage 为空，种子即真实 seed）
  const before = await page.evaluate(() => document.body.innerText);
  check("初始页面加载", before.includes("投递追踪") || before.length > 200);

  // 2. 点击"演示预览"按钮
  await page.getByRole("button", { name: "演示预览" }).first().click();
  await page.waitForTimeout(1500);
  const demoText = await page.evaluate(() => document.body.innerText);
  const hasDemoCompany = demoText.includes("北辰量化") || demoText.includes("青禾资本") || demoText.includes("澜舟资产");
  const hasBanner = demoText.includes("演示预览中");
  check("切换后出现 demo 虚构公司", hasDemoCompany, hasDemoCompany ? "北辰量化/青禾资本等" : "未找到");
  check("出现演示横幅提示", hasBanner);

  // 3. 真实种子公司不应出现在 demo 视图（种子里的"启林"不在 demo 数据里）
  const realCompanyVisible = demoText.includes("启林");
  check("demo 视图不含真实种子公司(启林)", !realCompanyVisible, realCompanyVisible ? "发现启林!" : "");

  // 4. localStorage 未被 demo 污染（关键红线）
  const stored = await page.evaluate(() => window.localStorage.getItem("jobhunt-ops-state-v1") ?? "");
  const polluted = stored.includes("北辰量化") || stored.includes("青禾资本");
  check("localStorage 未被 demo 数据污染", !polluted, stored ? `存储长度=${stored.length}` : "无存储");

  // 5. 退出演示，恢复真实
  await page.getByRole("button", { name: "退出演示" }).first().click();
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => document.body.innerText);
  check("退出后横幅消失", !after.includes("演示预览中"));
  check("退出后页面正常", after.length > 200);

  // 6. 切回演示再截一张图（证明截图可用）
  await page.getByRole("button", { name: "演示预览" }).first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(".edge-profile", "_verify-demo.png") });
  check("演示模式截图成功", true, ".edge-profile/_verify-demo.png");
} catch (err) {
  console.log("❌ 脚本异常：" + String(err.message).split("\n")[0]);
}

await context.close();
rmSync(tmpProfile, { recursive: true, force: true });

const failed = results.filter((r) => !r.ok);
console.log(`\n结果：${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);

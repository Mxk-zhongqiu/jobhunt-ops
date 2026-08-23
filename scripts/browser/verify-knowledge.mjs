/* global console, process */
// 知识页验证：渲染统计、展开主题、勾选知识点、增删知识点、搜索过滤、旧数据回填
// 用法：node scripts/browser/verify-knowledge.mjs [baseUrl]
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchEdge } from "./edge-launcher.mjs";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4173";
const url = `${baseUrl}/knowledge`;
const STORAGE_KEY = "jobhunt-ops-state-v1";

const profileDir = mkdtempSync(join(tmpdir(), "dsh-knowledge-check-"));
const context = await launchEdge({ headless: true, profileDir });
const page = context.pages()[0] ?? (await context.newPage());
const errors = [];
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
page.on("console", (msg) => {
  // 忽略 favicon 等静态资源 404
  if (msg.type() === "error" && !msg.text().includes("404")) errors.push(`console: ${msg.text()}`);
});
// 统一接管 confirm 对话框（accept 让删除生效）
page.on("dialog", (dialog) => dialog.accept());

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`[verify] ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`); };

// ─── 场景 1：全新种子数据（清空 localStorage 后重载） ───
console.log("[verify] 场景1：全新种子数据");
await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".stat-card", { timeout: 10_000 });

const statTexts = await page.$$eval(".stat-card", (els) => els.map((el) => el.innerText.replace(/\s+/g, " ").trim()));
console.log("[verify] 统计条：", statTexts.join(" | "));
check("主题总数=24（真实种子）", statTexts[0].startsWith("主题总数 24"), statTexts[0]);
check("知识点总数=3（示例）", statTexts[1].startsWith("知识点总数 3"), statTexts[1]);

// 展开「概率论」
await page.locator(".topic-item", { hasText: "概率论" }).locator(".topic-row").click();
await page.waitForSelector(".topic-item.open .topic-detail", { timeout: 5_000 });
const pointCount = await page.locator(".topic-item.open .point-row:not(.point-edit)").count();
check("概率论展开后有 3 个知识点", pointCount === 3, `实际 ${pointCount}`);

// 勾选第一个知识点 → 统计更新
const firstToggle = page.locator(".topic-item.open .point-row:not(.point-edit) .bank-toggle").first();
await firstToggle.click();
await page.waitForTimeout(300);
const mastered = await page.locator(".topic-item.open .point-row.mastered").count();
check("勾选后 mastered 行=1", mastered === 1, `实际 ${mastered}`);
// 还原
await firstToggle.click();
await page.waitForTimeout(300);

// 新增一个测试知识点
await page.locator(".topic-tools button", { hasText: "添加知识点" }).first().click();
await page.waitForSelector(".add-point-form", { timeout: 5_000 });
await page.locator(".add-point-form input").first().fill("验证测试点");
await page.locator(".add-point-form textarea").first().fill("自动化验证临时写入的要点。");
await page.locator(".add-point-form button", { hasText: "添加" }).click();
await page.waitForTimeout(300);
const withNew = await page.locator(".topic-item.open .point-row:not(.point-edit)").count();
check("新增后知识点=4", withNew === 4, `实际 ${withNew}`);

// 删除该测试点
const testRow = page.locator(".topic-item.open .point-row", { hasText: "验证测试点" });
await testRow.locator("button[aria-label='删除']").click();
await page.waitForTimeout(500);
const afterDelete = await page.locator(".topic-item.open .point-row:not(.point-edit)").count();
check("删除后知识点恢复=3", afterDelete === 3, `实际 ${afterDelete}`);

// 编辑测试：改第一个知识点标题
const firstPointTitle = page.locator(".topic-item.open .point-row:not(.point-edit) .point-title").first();
await firstPointTitle.locator("xpath=ancestor::div[contains(@class,'point-row')]").locator("button[aria-label='编辑']").click();
await page.waitForSelector(".point-edit", { timeout: 5_000 });
const titleInput = page.locator(".point-edit input").first();
await titleInput.fill("条件概率与全概率公式（已编辑）");
await page.locator(".point-edit button", { hasText: "保存" }).click();
await page.waitForTimeout(300);
const editedTitle = await page.locator(".topic-item.open .point-row:not(.point-edit) .point-title").first().innerText();
check("知识点编辑生效", editedTitle.includes("已编辑"), editedTitle);

// 搜索过滤
await page.locator(".knowledge-search input").fill("贝叶斯");
await page.waitForTimeout(300);
const searchTopics = await page.locator(".topic-item").count();
check("搜索「贝叶斯」只显示 1 个主题", searchTopics === 1, `实际 ${searchTopics}`);
await page.locator(".knowledge-search input").fill("");

// 状态筛选：先把第一个主题改为「学习中」，再筛选
await page.locator(".topic-item .topic-row select").first().selectOption("学习中");
await page.waitForTimeout(300);
await page.locator(".bank-tabs button", { hasText: "学习中" }).click();
await page.waitForTimeout(300);
const learningCount = await page.locator(".topic-item").count();
check("状态筛选「学习中」=1", learningCount === 1, `实际 ${learningCount}`);
await page.locator(".bank-tabs button", { hasText: "全部" }).click();

// 导出按钮
check("导出 Markdown 按钮存在", (await page.locator("button", { hasText: "导出 Markdown" }).count()) === 1);

// ─── 场景 2：旧数据回填（无 points 字段的旧格式 localStorage） ───
console.log("[verify] 场景2：旧数据回填");
await page.evaluate((key) => {
  const old = {
    applications: [], interviews: [], weeklyPlans: [], projects: [],
    knowledge: [
      { id: "k-prob", category: "数学/统计", name: "概率论：条件概率/期望/随机游走/鞅", priority: "高频", status: "未开始" },
      { id: "k-test", category: "数学/统计", name: "假设检验", priority: "必考", status: "未开始" },
      { id: "user-custom", category: "自定义", name: "用户自建主题", priority: "加分", status: "未开始" },
    ],
    settings: { targetName: "求职者", startDate: "2026-08-18", dailySubmitTarget: 5, totalTarget: 100, aiProvider: "mock" },
  };
  localStorage.setItem(key, JSON.stringify(old));
}, STORAGE_KEY);
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".stat-card", { timeout: 10_000 });

await page.locator(".topic-item", { hasText: "概率论" }).locator(".topic-row").click();
await page.waitForSelector(".topic-item.open .topic-detail", { timeout: 5_000 });
const backfilled = await page.locator(".topic-item.open .point-row:not(.point-edit)").count();
check("旧主题 k-prob 回填示例知识点=3", backfilled === 3, `实际 ${backfilled}`);

const customPoints = await page.locator(".topic-item", { hasText: "用户自建主题" }).locator(".point-row").count();
check("种子外主题不回填（空数组）", customPoints === 0, `实际 ${customPoints}`);

const shot = ".edge-profile/knowledge-check.png";
await page.screenshot({ path: shot });
console.log(`[verify] 截图：${shot}`);

await context.close();

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.log(`[verify] ${failed.length} 项失败：`);
  for (const f of failed) console.log(`  - ${f.name}（${f.detail}）`);
}
if (errors.length) {
  console.log("[verify] 页面错误：", errors.join("\n"));
}
console.log(`[verify] 完成：${results.length - failed.length}/${results.length} 通过${failed.length ? " ❌" : " ✅"}`);
process.exit(failed.length || errors.length ? 1 : 0);

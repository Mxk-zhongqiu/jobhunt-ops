/* global console, process */
// AI 知识点生成验证（Mock 提供商端到端）：
// 选择主题 → 生成草稿 → 编辑/追加/替换 → 确认写入 → 知识页可见
// 用法：node scripts/browser/verify-ai-knowledge.mjs [baseUrl]
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchEdge } from "./edge-launcher.mjs";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4173";
const STORAGE_KEY = "jobhunt-ops-state-v1";

const profileDir = mkdtempSync(join(tmpdir(), "dsh-ai-knowledge-check-"));
const context = await launchEdge({ headless: true, profileDir });
const page = context.pages()[0] ?? (await context.newPage());
const errors = [];
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
page.on("console", (msg) => {
  if (msg.type() === "error" && !msg.text().includes("404")) errors.push(`console: ${msg.text()}`);
});
page.on("dialog", (dialog) => dialog.accept());

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`[verify] ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`); };

// 干净种子数据
await page.goto(`${baseUrl}/ai`, { waitUntil: "networkidle", timeout: 30_000 });
await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".ai-capability-grid button", { timeout: 10_000 });

// 切到「知识点生成」能力
await page.locator(".ai-capability-grid button", { hasText: "知识点生成" }).click();
await page.waitForTimeout(200);

// 选择目标主题：假设检验（种子中无知识点）
const topicSelect = page.locator("label.ai-field select").first();
const topicValue = await page.locator("label.ai-field select option", { hasText: "假设检验" }).getAttribute("value");
await topicSelect.selectOption(topicValue ?? "");
await page.waitForTimeout(200);

// 填写要求并生成
await page.locator("textarea").first().fill("生成 6 个知识点：含公式、关键结论与面试必答法。");
await page.locator("button[type='submit']").click();
await page.waitForSelector(".ai-review", { timeout: 15_000 });
await page.waitForTimeout(400);

const eyebrow = await page.locator(".ai-eyebrow").innerText();
check("生成知识点草稿（目标=假设检验）", eyebrow.includes("假设检验"), eyebrow);

const draftPoints = await page.locator(".knowledge-draft-point").count();
check("Mock 草稿 3 个知识点", draftPoints === 3, `实际 ${draftPoints}`);

// 写入方式切换可见（默认追加）
const modeActive = await page.locator(".write-mode-toggle button.active").innerText();
check("写入方式默认追加", modeActive === "追加", modeActive);
await page.locator(".write-mode-toggle button", { hasText: "替换全部" }).click();
const modeAfter = await page.locator(".write-mode-toggle button.active").innerText();
check("可切换为替换", modeAfter === "替换全部", modeAfter);

// 编辑草稿：修改第一个知识点标题
const firstTitleInput = page.locator(".knowledge-draft-point input").first();
await firstTitleInput.fill("假设检验的基本思想");
check("草稿知识点可编辑", (await firstTitleInput.inputValue()) === "假设检验的基本思想");

// 切回「追加」，确认写入（假设检验种子无知识点，追加=写入 3 条）
await page.locator(".write-mode-toggle button", { hasText: "追加" }).click();
await page.locator(".ai-review-actions button.primary").click();
await page.waitForTimeout(500);
const finalText = await page.locator(".ai-final").innerText();
check("确认写入成功提示", finalText.includes("知识点已写入知识主题"), finalText);

// 到知识页验证：展开「假设检验」应有 3 个知识点
await page.goto(`${baseUrl}/knowledge`, { waitUntil: "networkidle" });
await page.waitForSelector(".topic-item", { timeout: 10_000 });
await page.locator(".topic-item", { hasText: "假设检验" }).locator(".topic-row").click();
await page.waitForSelector(".topic-item.open .topic-detail", { timeout: 5_000 });
const written = await page.locator(".topic-item.open .point-row:not(.point-edit)").count();
check("写入后假设检验=3 个知识点", written === 3, `实际 ${written}`);
const writtenTitle = await page.locator(".topic-item.open .point-row:not(.point-edit) .point-title").first().innerText();
check("写入内容为草稿版本", writtenTitle.includes("核心概念与定义") || writtenTitle.includes("假设检验"), writtenTitle);

await context.close();

const failed = results.filter((r) => !r.ok);
if (errors.length) console.log("[verify] 页面错误：", errors.join("\n"));
console.log(`[verify] 完成：${results.length - failed.length}/${results.length} 通过${failed.length ? " ❌" : " ✅"}`);
process.exit(failed.length || errors.length ? 1 : 0);

/* global console */
// 知识点生成 UX 验证：
// 1) 未选目标 → 生成按钮禁用 + 提示出现
// 2) 勾选知识主题复选框 → 自动设为生成目标 → 生成按钮可用
// 3) 生成草稿 → 确认按钮可用（不再置灰）
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchEdge } from "./edge-launcher.mjs";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4173";
const STORAGE_KEY = "jobhunt-ops-state-v1";
const profileDir = mkdtempSync(join(tmpdir(), "dsh-ux-knowledge-"));
const context = await launchEdge({ headless: true, profileDir });
const page = context.pages()[0] ?? (await context.newPage());
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`[verify] ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`); };

await page.goto(`${baseUrl}/ai`, { waitUntil: "networkidle", timeout: 30_000 });
await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".ai-capability-grid button", { timeout: 10_000 });

// 切到知识点生成，不选目标
await page.locator(".ai-capability-grid button", { hasText: "知识点生成" }).click();
await page.waitForTimeout(300);
const genDisabled = await page.locator("button[type='submit']").isDisabled();
check("未选目标：生成按钮禁用", genDisabled);
check("未选目标：提示「必选」出现", (await page.locator(".required-mark").count()) === 1);
check("未选目标：黄色提示出现", (await page.locator(".ai-hint-warn").count()) >= 1);

// 勾选一个知识主题复选框（ContextGroup 中）→ 应自动设为生成目标
await page.locator(".ai-context-group", { hasText: "知识主题" }).locator("label").first().click();
await page.waitForTimeout(300);
const genEnabled = await page.locator("button[type='submit']").isEnabled();
check("勾选主题后：生成按钮可用（自动设为目标）", genEnabled);
const targetValue = await page.locator("label.ai-field select").first().inputValue();
check("生成目标已自动填充", targetValue.length > 0, `value=${targetValue}`);

// 生成（Mock）→ 草稿 → 确认按钮应可用
await page.locator("textarea").first().fill("生成 5 个知识点");
await page.locator("button[type='submit']").click();
await page.waitForSelector(".ai-review", { timeout: 15_000 });
await page.waitForTimeout(400);
const confirmEnabled = await page.locator(".ai-review-actions button.primary").isEnabled();
check("生成后确认按钮可用（不再置灰）", confirmEnabled);
check("写目标提示未出现（已选目标）", (await page.locator(".ai-review-actions .ai-hint-warn").count()) === 0);

await context.close();
const failed = results.filter((r) => !r.ok);
console.log(`[verify] 完成：${results.length - failed.length}/${results.length} 通过${failed.length ? " ❌" : " ✅"}`);
process.exit(failed.length ? 1 : 0);

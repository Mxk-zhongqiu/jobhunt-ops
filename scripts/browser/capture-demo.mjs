/* global console, process */
// 截图素材库：用浏览器自动化给 demo 版各页面截图（3:4 竖图，适配小红书）
// 前置：已运行 npm run build:demo 且本地预览服务已启动（npm run preview，默认 8788）
// 用法：node scripts/browser/capture-demo.mjs [baseUrl]
// 输出：.edge-profile/demo-screens/<路由名>.png
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { launchEdge } from "./edge-launcher.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:8788";

const PAGES = [
  { key: "overview",       name: "作战总览",     path: "/" },
  { key: "applications",   name: "投递追踪",     path: "/applications" },
  { key: "plan",           name: "周计划",       path: "/plan" },
  { key: "projects",       name: "项目",         path: "/projects" },
  { key: "knowledge",      name: "知识",         path: "/knowledge" },
  { key: "interviews",     name: "面试记录",     path: "/interviews" },
  { key: "question-bank",  name: "面试题库",     path: "/question-bank" },
  { key: "ai",             name: "AI 助手",      path: "/ai" },
  { key: "data",           name: "数据管理",     path: "/data" },
];

const outDir = resolve(".edge-profile", "demo-screens");
mkdirSync(outDir, { recursive: true });

const context = await launchEdge({ headless: true, width: 750, height: 1000 });
let ok = 0;
for (const p of PAGES) {
  try {
    const page = await context.newPage();
    await page.goto(BASE + p.path, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1200);
    const shot = resolve(outDir, `${p.key}.png`);
    await page.screenshot({ path: shot });
    console.log(`✅ ${p.name.padEnd(6)} → ${shot}`);
    ok++;
    await page.close();
  } catch (err) {
    console.log(`❌ ${p.name}: ${String(err.message).split("\n")[0]}`);
  }
}
await context.close();
console.log(`\n完成：${ok}/${PAGES.length} 张截图 → ${outDir}`);

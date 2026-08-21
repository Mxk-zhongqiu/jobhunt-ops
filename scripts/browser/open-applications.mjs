/* global console, process */
// 批量打开投递链接（配合已持久化的 Edge 登录态）
//
// 背景：.edge-profile 已保存牛客/智联等招聘网站登录态，
//       本脚本用真实 Edge 逐个打开投递清单里的链接，供你远程桌面上逐家填表提交。
//
// 用法：
//   node scripts/browser/open-applications.mjs                    # 读 投递清单.csv
//   node scripts/browser/open-applications.mjs --list mylist.csv  # 指定清单文件
//   node scripts/browser/open-applications.mjs --urls "https://a.com" "https://b.com"
//   node scripts/browser/open-applications.mjs --headless         # 无头（不推荐，投递需人工填）
//
// CSV 格式（首行表头）：company,url,position,channel,note
//   例如：启林投资,https://www.xxx.com/job/1,量化研究员,官网,冲刺层
//
// 行为：打开所有链接为标签页后保持浏览器窗口运行，直到你按 Ctrl+C 结束。
import { readFileSync, existsSync } from "node:fs";
import { launchEdge } from "./edge-launcher.mjs";

const args = process.argv.slice(2);
const headless = args.includes("--headless");

function getArg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

let urls = [];
const listFile = getArg("--list") ?? "投递清单.csv";
if (existsSync(listFile)) {
  const lines = readFileSync(listFile, "utf8").split(/\r?\n/).filter(Boolean);
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    if (cols[1] && cols[1].startsWith("http")) urls.push({ company: cols[0], url: cols[1], note: cols.slice(4).join(",") });
  }
}
if (!urls.length) {
  const i = args.indexOf("--urls");
  if (i >= 0) urls = args.slice(i + 1).map((u) => ({ url: u, company: "", note: "" }));
}
if (!urls.length) {
  console.error("未找到投递清单：请准备 投递清单.csv（company,url,position,channel,note），或使用 --urls 传链接");
  process.exit(1);
}

console.log(`[open-applications] 共 ${urls.length} 个链接，headless=${headless}`);
const context = await launchEdge({ headless });
const page = await context.newPage();

for (const [i, item] of urls.entries()) {
  console.log(`\n[${i + 1}/${urls.length}] ${item.company || item.url}`);
  try {
    await page.goto(item.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);
    console.log(`  标题：${await page.title()}`);
    if (item.note) console.log(`  备注：${item.note}`);
    await context.newPage(); // 为下一个链接预留新标签
  } catch (err) {
    console.log(`  ❌ ${String(err.message).split("\n")[0]}`);
  }
}

console.log("\n[open-applications] 所有链接已打开（最后停留在一个页面）。浏览器保持运行，请自行操作填表提交。");
console.log("[open-applications] 完成后按 Ctrl+C 关闭脚本（浏览器窗口需手动关闭或等脚本退出后自动关闭）。");
await new Promise(() => {}); // 保持运行

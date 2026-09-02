/* global console, process */
// BOSS直聘 / 猎聘 反爬与 DOM 能力探测（CDP 自动化视角，spike）
// 用法：
//   node scripts/browser/dom-probe.mjs [url...]
// 默认探测：BOSS 搜索页 + 猎聘搜索页；可追加 URL（会自动点第一个职位卡片尝试进入详情页再探一次）。
// 输出：每页一个 JSON 摘要行（finalUrl/title/blank/验证码标记/关键容器/候选选择器/输入框/iframe/shadowDOM）。
import { launchEdge } from "./edge-launcher.mjs";

const DEFAULT_URLS = [
  "https://www.zhipin.com/web/geek/job?query=%E9%87%8F%E5%8C%96&city=101020100",
  "https://www.liepin.com/zhaopin/?key=%E9%87%8F%E5%8C%96",
];

const MARKER_PATTERN = /安全验证|访问频繁|验证码|滑动验证|请完成验证|人机验证|触发风控|robot|verify|captcha/i;

async function probePage(page, url) {
  const report = { url, step: "open" };
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(5000); // 等 JS 渲染 / 反爬判定
    report.finalUrl = page.url();
    report.title = await page.title();
    report.htmlLen = (await page.content()).length;
    const dom = await page.evaluate(() => {
      const text = document.body ? document.body.innerText || "" : "";
      const marker = /安全验证|访问频繁|验证码|滑动验证|请完成验证|人机验证|触发风控/i.test(text);
      const selectors = {
        ".job-title": document.querySelectorAll(".job-title").length,
        "[class*='job-title']": document.querySelectorAll('[class*="job-title"]').length,
        ".company-name": document.querySelectorAll(".company-name").length,
        "[class*='company-name']": document.querySelectorAll('[class*="company-name"]').length,
        ".job-sec-text": document.querySelectorAll(".job-sec-text").length,
        "[class*='job-sec']": document.querySelectorAll('[class*="job-sec"]').length,
        textarea: document.querySelectorAll("textarea").length,
        contenteditable: document.querySelectorAll('[contenteditable="true"], [contenteditable=""]').length,
        "input[type=text]": document.querySelectorAll('input[type="text"]').length,
      };
      const app = document.querySelector("#app");
      const mainInfo = {
        bodyInnerTextLen: text.length,
        bodyBlank: text.trim().length === 0,
        appChildren: app ? app.children.length : -1,
        appTextSample: app ? app.innerText.replace(/\s+/g, " ").slice(0, 120) : "",
        iframes: [...document.querySelectorAll("iframe")].map((f) => f.src).slice(0, 3),
        openShadowOnApp: app && app.shadowRoot ? "yes" : "no",
        ldJsonCount: document.querySelectorAll('script[type="application/ld+json"]').length,
      };
      return { marker, selectors, mainInfo };
    });
    report.body = dom;
  } catch (error) {
    report.error = String(error && error.message ? error.message : error).slice(0, 200);
  }
  return report;
}

const urls = process.argv.slice(2).filter((a) => a.startsWith("http")).length
  ? process.argv.slice(2).filter((a) => a.startsWith("http"))
  : DEFAULT_URLS;

console.log(`[dom-probe] 启动 Edge（headless=${process.env.PROBE_HEADFUL !== "1"}，持久化 profile .edge-profile/）…`);
const context = await launchEdge({ headless: process.env.PROBE_HEADFUL !== "1" });
const page = context.pages()[0] ?? (await context.newPage());

for (const url of urls) {
  const r = await probePage(page, url);
  console.log("PROBE_RESULT " + JSON.stringify(r));
  // 搜索页命中职位卡片 → 尝试进入第一个职位详情再探一次
  if (!r.error && !r.body?.marker && r.body?.mainInfo?.appChildren > 0) {
    try {
      const clicked = await page.evaluate(() => {
        const link =
          document.querySelector('a[href*="job_detail"], .job-card-wrapper a, [class*="job-card"] a, .job-list-box a') ||
          document.querySelector('a[href*="job"]');
        if (!link) return false;
        link.click();
        return true;
      });
      if (clicked) {
        await page.waitForTimeout(4000);
        const detail = await probePage(page, page.url());
        console.log("PROBE_RESULT " + JSON.stringify(detail));
      }
    } catch (error) {
      console.log("PROBE_RESULT " + JSON.stringify({ url, step: "detail-click-error", error: String(error).slice(0, 120) }));
    }
  }
}

await context.close();
console.log("[dom-probe] 完成");

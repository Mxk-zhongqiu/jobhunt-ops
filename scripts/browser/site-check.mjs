/* global console, process */
// 网站连通性 + 登录态检测（BOSS直聘 / 牛客 / 智联 / 猎聘 / 拉勾）
//
// 用法：
//   node scripts/browser/site-check.mjs                 # 全部站点，每站停留 8 秒
//   node scripts/browser/site-check.mjs --dwell 180     # 每站停留 180 秒（留时间手动登录）
//   node scripts/browser/site-check.mjs --sites boss,nowcoder   # 只测指定站点
//   node scripts/browser/site-check.mjs --headless      # 无头模式
//
// 输出：每站的标题 / 最终 URL / 登录相关 Cookie / 页面文本中的登录信号 / 截图
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { launchEdge } from "./edge-launcher.mjs";

const SITES = [
  { key: "boss",     name: "BOSS直聘", url: "https://www.zhipin.com/" },
  { key: "nowcoder", name: "牛客",     url: "https://www.nowcoder.com/" },
  { key: "zhaopin",  name: "智联招聘", url: "https://www.zhaopin.com/" },
  { key: "liepin",   name: "猎聘",     url: "https://www.liepin.com/" },
  { key: "lagou",    name: "拉勾",     url: "https://www.lagou.com/" },
];

// 各站登录后通常会出现的 Cookie 名（按前缀/关键字匹配，作为登录态参考）
const COOKIE_HINTS = {
  boss:     ["__zp_stoken__", "wt2", "zp_sessid", "zp_stoken"],
  nowcoder: ["NTOKEN", "nowcoder", "gr_user_id"],
  zhaopin:  ["zp_", "zhaopin", "ssxmod"],
  liepin:   ["liepin", "gr_user_id"],
  lagou:    ["lagou", "user_trace_token", "JSESSIONID"],
};

// 页面文本里的登录信号（模糊判断，仅作参考）
const LOGGED_IN_HINTS = ["退出登录", "个人主页", "个人中心", "我的简历", "账号设置", "安全中心", "我的投递", "创作中心", "我的求职"];
const GUEST_HINTS = ["立即登录", "请先登录", "扫码登录", "登录/注册", "登录 / 注册"];

function parseArgs(argv) {
  const out = { dwell: 8, headless: false, sites: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dwell") out.dwell = Number(argv[++i]) || 8;
    else if (a === "--headless") out.headless = true;
    else if (a === "--sites") out.sites = argv[++i].split(",").map((s) => s.trim().toLowerCase());
  }
  return out;
}

async function inspect(page, site, dwellMs) {
  const result = { key: site.key, name: site.name, url: site.url };
  try {
    await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(2500); // 等动态渲染

    result.title = await page.title();
    result.finalUrl = page.url();

    // 登录相关 Cookie（只看名字，不打印值）
    const cookies = await page.context().cookies(site.url);
    const hintMatches = [];
    for (const hint of COOKIE_HINTS[site.key] ?? []) {
      const found = cookies.filter((c) => c.name.includes(hint)).map((c) => c.name);
      hintMatches.push(...found);
    }
    result.loginCookies = [...new Set(hintMatches)];
    result.cookieCount = cookies.length;

    // 页面文本登录信号
    const bodyText = await page.evaluate(() => (document.body ? document.body.innerText : ""));
    const sample = bodyText.slice(0, 6000);
    result.loggedInHits = LOGGED_IN_HINTS.filter((h) => sample.includes(h));
    result.guestHits = GUEST_HINTS.filter((h) => sample.includes(h));

    // 截图
    const dir = resolve(".edge-profile", "sites");
    mkdirSync(dir, { recursive: true });
    const shot = resolve(dir, `${site.key}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    result.screenshot = shot;

    // 停留（给手动登录/过验证码留时间）
    if (dwellMs > 0) await page.waitForTimeout(dwellMs);
  } catch (err) {
    result.error = String(err.message).split("\n")[0];
  }
  return result;
}

function print(results) {
  for (const r of results) {
    console.log(`\n===== ${r.name} (${r.key}) =====`);
    if (r.error) {
      console.log(`  ❌ 失败：${r.error}`);
      continue;
    }
    console.log(`  标题：${r.title}`);
    console.log(`  最终 URL：${r.finalUrl}`);
    console.log(`  Cookie 数：${r.cookieCount}，登录相关：${r.loginCookies.length ? r.loginCookies.join(", ") : "（无）"}`);
    const signals = [];
    if (r.loggedInHits.length) signals.push(`已登录信号:${r.loggedInHits.join("/")}`);
    if (r.guestHits.length) signals.push(`游客信号:${r.guestHits.join("/")}`);
    console.log(`  登录态判断：${signals.length ? signals.join("；") : "（无明显信号）"}`);
    console.log(`  截图：${r.screenshot}`);
  }
}

const opts = parseArgs(process.argv.slice(2));
const sites = SITES.filter((s) => !opts.sites || opts.sites.includes(s.key));
if (!sites.length) {
  console.error("未匹配到任何站点，可用 key：" + SITES.map((s) => s.key).join(", "));
  process.exit(1);
}

console.log(`[site-check] 共 ${sites.length} 个站点，每站停留 ${opts.dwell}s，headless=${opts.headless}`);
const context = await launchEdge({ headless: opts.headless });

const results = [];
for (const site of sites) {
  const page = await context.newPage();
  results.push(await inspect(page, site, opts.dwell * 1000));
  await page.close();
}

await context.close();
print(results);

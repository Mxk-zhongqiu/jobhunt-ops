/* global process */
// 浏览器自动化启动器：用 Playwright 驱动本机安装的 Microsoft Edge（优先 Edge Dev）
//
// 用法：
//   import { launchEdge, findEdgeExecutable, defaultProfileDir } from "./edge-launcher.mjs";
//   const context = await launchEdge({ headless: false });
//   const page = await context.newPage();
//   await page.goto("https://...");
//
// 要点：
//   - 使用「持久化用户目录」(.edge-profile/)，招聘网站的登录态、Cookie 刷新后依然保留；
//   - 可用环境变量 EDGE_PATH 指定 Edge 可执行文件路径（优先级最高）；
//   - headless 传 true 时无窗口运行，适合后台定时任务。
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";

// 项目根目录（本文件位于 scripts/browser/ 下，向上两级）
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// 常见 Edge 安装位置（依次探测，取第一个存在的）
const EDGE_CANDIDATES = [
  process.env.EDGE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge Dev\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge Beta\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge Canary\\Application\\msedge.exe",
].filter(Boolean);

/** 探测本机 Edge 可执行文件路径，找不到返回 null */
export function findEdgeExecutable() {
  for (const p of EDGE_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  return null;
}

/** 默认持久化用户目录：项目根目录/.edge-profile（已被 .gitignore 忽略） */
export function defaultProfileDir() {
  return resolve(PROJECT_ROOT, ".edge-profile");
}

/**
 * 启动 Edge（持久化上下文）。
 * @param {object} options
 * @param {boolean} [options.headless=false] 无头模式（不弹窗口）
 * @param {string}  [options.profileDir]      用户数据目录，默认 .edge-profile/
 * @param {string[]} [options.args]           额外 Chromium 启动参数
 * @param {number}   [options.width=1440]     视口宽
 * @param {number}   [options.height=900]     视口高
 * @returns {Promise<import("playwright").BrowserContext>}
 */
export async function launchEdge({
  headless = false,
  profileDir = defaultProfileDir(),
  args = [],
  width = 1440,
  height = 900,
} = {}) {
  const executablePath = findEdgeExecutable();
  if (!executablePath) {
    throw new Error("未找到 Microsoft Edge，请安装 Edge 或设置环境变量 EDGE_PATH 指定 msedge.exe 路径");
  }

  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath,
    headless,
    viewport: { width, height },
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    // 只删除容易暴露自动化身份的默认参数（保留 remote-debugging-pipe 等连接必需项），
    // 让 Edge 指纹更接近真实用户浏览器，减少被招聘网站反爬识别
    ignoreDefaultArgs: [
      "--enable-automation",
      "--disable-background-networking",
      "--metrics-recording-only",
      "--disable-sync",
      "--no-service-autorun",
      "--disable-breakpad",
      "--disable-component-extensions-with-background-pages",
    ],
    args: [
      "--disable-blink-features=AutomationControlled", // 降低被网站识别为自动化工具的概率
      "--no-first-run",
      "--no-default-browser-check",
      ...args,
    ],
  });

  // 反自动化检测：隐藏 navigator.webdriver 标志，减少被招聘网站拦下的概率
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  return context;
}

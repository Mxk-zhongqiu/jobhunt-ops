# 浏览器自动化 · 用 Playwright 控制本机 Edge

> 给程序（或你自己）一条「控制真实浏览器」的通道：自动打开投递链接、抓取招聘页面、自动填写表单、定时检查笔试/面试入口等。驱动的是**本机已安装的 Microsoft Edge**（优先 Edge Dev），无需额外下载浏览器。

## 快速验证

```bash
npm run browser:smoke          # 弹窗打开 example.com，打印标题并截图
node scripts/browser/smoke-test.mjs https://www.example.com --headless
```

看到 `[browser] 冒烟测试通过 ✅` 即表示通道可用。

## 在自己的脚本里使用

```js
import { launchEdge } from "./edge-launcher.mjs";

const context = await launchEdge({ headless: false }); // true = 无窗口后台运行
const page = await context.newPage();
await page.goto("https://www.boss直聘.com");
await page.getByPlaceholder("搜索职位").fill("量化研究员");
await page.keyboard.press("Enter");
// …你的自动化逻辑…
await context.close();
```

- 启动器：`scripts/browser/edge-launcher.mjs`
- 冒烟测试示例：`scripts/browser/smoke-test.mjs`

## 关键设计

| 项目 | 说明 |
|---|---|
| 持久化用户目录 | `.edge-profile/`（已 gitignore）。**招聘网站的登录态、Cookie 永久保留**，第一次手动登录一次，之后所有自动化脚本都带着登录态 |
| 浏览器探测 | 依次找 Edge Dev → 标准版 Edge → Beta/Canary；也可用环境变量 `EDGE_PATH` 指定 msedge.exe |
| 反检测 | 默认带 `--disable-blink-features=AutomationControlled`，降低被网站识别为自动化的概率 |
| 无头模式 | `launchEdge({ headless: true })`，适合后台任务；有头模式适合调试和需要人工过验证码的场景 |

## 环境变量

| 变量 | 作用 |
|---|---|
| `EDGE_PATH` | 指定 Edge 可执行文件路径（优先级最高） |

## 常见的秋招自动化场景（按需开发）

1. **打开投递链接**：从本应用「投递追踪」导出 CSV/JSON，批量用 Edge 打开每家公司的投递链接，人工或半自动填写；
2. **抓取岗位状态**：登录 BOSS 直聘 / 牛客 / 招聘官网，抓取「已投递 → 已查看 → 约面」状态，回写本应用的 Application 状态机；
3. **定时任务**：无头模式每天检查笔试/面试入口是否放出，有变化就提示；
4. **面试复盘资料**：自动抓取牛客面经、LeetCode 题目页，沉淀到「知识」模块。

> ⚠️ 注意：自动化操作第三方网站请遵守其用户协议与频率限制，避免高频请求导致账号异常。

## 实测结果（2026-08-19，Edge Dev + Playwright 1.62）

| 网站 | 自动化打开 | 自动登录 | 登录态持久化 | 说明 |
|---|---|---|---|---|
| **牛客** `nowcoder.com` | ✅ | ✅（窗口内手动扫码/手机号） | ✅ 重启后仍是登录态（导航栏含"退出登录/个人主页/我的简历"） | 最友好，题库/面经可自动化抓取 |
| **智联招聘** `zhaopin.com` | ✅ | ✅ | ✅ 重启后仍显示"个人中心" | 可自动化投递 |
| **BOSS直聘** `zhipin.com` | ❌ 页面被反爬清空为 about:blank | — | — | 会探测调试端口 + 指纹检测，Playwright/CDP 方案均被识别；建议**手动使用** |
| **猎聘** `liepin.com` | ❌ 同上 | — | — | 同上 |
| **拉勾** `lagou.com` | ⚠️ 弹滑动验证 | 未完成（验证页超时/窗口关闭） | — | 反爬中等但验证繁琐，对量化秋招价值有限，暂不投入；确需用时请手动浏览器操作 |

**实测结论**：登录态通过 `.edge-profile/` 持久化目录真实生效——牛客、智联登录后关闭浏览器再重启，登录状态仍在。以后自动化脚本（抓状态、填表单）默认就是登录态运行。BOSS直聘/猎聘因主动反爬无法自动化，请用真实浏览器手动操作这两个站。

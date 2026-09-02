// 求职作战台 · 内容脚本（运行于 Boss直聘 / 猎聘 页面）
// 职责：收到 popup 的提取请求时，从当前页面尽力提取 { 平台 / 公司 / 岗位 / JD 摘要 }。
// 定位为"半自动"：提取结果由用户在 popup 里确认/修改后才可保存，绝不自动写入。

(() => {
  "use strict";
  if (window.__jobhuntExtractInstalled__) return;
  window.__jobhuntExtractInstalled__ = true;

  const clean = (text) => (text || "").replace(/\s+/g, " ").trim();

  function platformByHost() {
    const host = location.hostname;
    if (host.includes("zhipin")) return "Boss直聘";
    if (host.includes("liepin")) return "猎聘";
    return "其他平台";
  }

  function pickText(selectors) {
    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el && el.textContent && clean(el.textContent)) return clean(el.textContent);
      } catch (_) {
        /* 个别非法选择器忽略 */
      }
    }
    return "";
  }

  // 1) JSON-LD（schema.org JobPosting）优先
  function fromJsonLd() {
    let found = null;
    const walk = (node) => {
      if (found) return;
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      const type = node["@type"];
      const isJob = Array.isArray(type) ? type.includes("JobPosting") : type === "JobPosting";
      if (isJob) {
        found = {
          position: typeof node.title === "string" ? node.title : "",
          company: node.hiringOrganization && typeof node.hiringOrganization === "object" ? node.hiringOrganization.name : "",
          jd: typeof node.description === "string" ? node.description : "",
        };
        return;
      }
      for (const key of Object.keys(node)) walk(node[key]);
    };
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        walk(JSON.parse(script.textContent || "null"));
      } catch (_) {
        /* 忽略坏 JSON */
      }
      if (found) break;
    }
    return found;
  }

  // 2) DOM 常见选择器兜底
  function fromDom() {
    const position = pickText([
      ".job-title",
      '[class*="job-title"]',
      '[class*="jobTitle"]',
      '[class*="position-name"]',
      '[class*="positionName"]',
      "h1",
    ]);
    const company = pickText([
      ".company-name",
      '[class*="company-name"]',
      '[class*="companyName"]',
      '[class*="boss-name"]',
      '[class*="company-info"] a',
      '[class*="name"]',
    ]);
    const jd = pickText([
      ".job-sec-text",
      '[class*="job-sec"]',
      '[class*="job-detail"]',
      '[class*="jobDetail"]',
      '[class*="jobDesc"]',
      '[class*="description-text"]',
      '[class*="jd-detail"]',
    ]);
    return { position, company, jd };
  }

  // 3) 页面标题正则兜底
  function fromTitle() {
    const title = clean(document.title);
    let position = "";
    let company = "";
    if (title.includes("猎聘")) {
      const m = title.match(/^(.+?)\s*[-_]\s*(.+?)(?:-?\s*Liepin|招聘信息|_招聘)/i);
      if (m) {
        position = m[1];
        company = m[2];
      }
    } else if (title.includes("Boss直聘") || title.includes("boss直聘")) {
      const m = title.match(/^(.+?)\s*[-_]\s*(.+?)(?:招聘信息|_招聘|Boss直聘|BOSS直聘)/i);
      if (m) {
        position = m[1];
        company = m[2];
      }
    }
    const meta = document.querySelector('meta[name="description"]');
    if (!company && meta && meta.content) {
      const mm = meta.content.match(/([\u4e00-\u9fa5A-Za-z0-9（）()·\s]{2,20})公司/);
      if (mm) company = mm[0].replace(/公司$/, "") + "公司";
    }
    return { position, company };
  }

  function extractPage() {
    const result = {
      url: location.href,
      platform: platformByHost(),
      position: "",
      company: "",
      jd: "",
      from: "none",
    };
    const ld = fromJsonLd();
    if (ld && (ld.position || ld.company || ld.jd)) {
      result.position = clean(ld.position);
      result.company = clean(ld.company);
      result.jd = clean(ld.jd).slice(0, 500);
      result.from = "jsonld";
      return result;
    }
    const dom = fromDom();
    const titleGuess = fromTitle();
    result.position = clean(dom.position || titleGuess.position);
    result.company = clean(dom.company || titleGuess.company);
    result.jd = clean(dom.jd).slice(0, 500);
    result.from = result.company || result.position ? "dom" : "none";
    return result;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === "jobhunt-extract") {
      try {
        sendResponse({ ok: true, data: extractPage() });
      } catch (err) {
        sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
      }
    }
  });

  window.__jobhuntExtractPage__ = extractPage;
})();

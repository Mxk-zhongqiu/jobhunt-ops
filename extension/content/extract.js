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

  // ─── DOM 能力探测（P1 spike：确认 BOSS/猎聘 页面上哪些数据可读、输入框可否注入）───
  // 只读探测：统计关键候选选择器/消息类容器/输入框是否存在于真实页面 DOM；
  // 注入测试（writeTest=true，仅建议在会话页跑）：向输入框写入探针文本→回读→立即清空，
  // 不按回车、不点发送，验证"自动化输入"是否可行。
  const PROBE_CHAT_SELECTORS = [
    '[class*="message"]',
    '[class*="chat"]',
    '[class*="bubble"]',
    '[class*="msg"]',
    '[class*="conversation"]',
  ];
  const PROBE_INPUT_SELECTORS = ["textarea", 'input[type="text"]', '[contenteditable="true"]', '[contenteditable=""]'];

  function visibleText(el) {
    if (!el) return "";
    return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  }

  function testFillTarget(target, probeText) {
    const tag = target.tagName;
    const kind = tag === "TEXTAREA" || tag === "INPUT" ? "field" : target.isContentEditable ? "contenteditable" : "other";
    let setOk = false;
    let readBack = "";
    if (kind === "field") {
      const proto = tag === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(target, probeText);
      target.dispatchEvent(new Event("input", { bubbles: true }));
      readBack = target.value;
      setOk = readBack === probeText;
    } else if (kind === "contenteditable") {
      target.textContent = probeText;
      target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: probeText }));
      readBack = (target.innerText || target.textContent || "").trim();
      setOk = readBack === probeText;
    }
    return { tag, kind, setOk, readBack: readBack.slice(0, 30) };
  }

  function clearTarget(target) {
    try {
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
        const proto = target.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
        setter.call(target, "");
        target.dispatchEvent(new Event("input", { bubbles: true }));
      } else if (target.isContentEditable) {
        target.textContent = "";
        target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
      }
    } catch (_) {
      /* 忽略清空失败 */
    }
  }

  // 正文可见性：在疑似 JD/详情/描述的容器里找文本最长者（判断岗位 JD 正文是否真实渲染在 DOM）
  function longestKeywordText(keywords) {
    let best = { len: 0, sample: "" };
    const all = document.querySelectorAll("div,section,article");
    for (const el of all) {
      const raw = el.className;
      const cls = typeof raw === "string" ? raw : raw && raw.baseVal !== undefined ? raw.baseVal : "";
      if (!keywords.some((keyword) => cls.includes(keyword))) continue;
      const text = visibleText(el);
      if (text.length > best.len) best = { len: text.length, sample: text.slice(0, 160) };
    }
    return best;
  }

  function runDomProbe(writeTest) {
    const count = (selector) => {
      try {
        return document.querySelectorAll(selector).length;
      } catch (_) {
        return -1;
      }
    };
    const inputs = PROBE_INPUT_SELECTORS.map((selector) => ({ selector, count: count(selector) }));
    const chatLike = [];
    for (const selector of PROBE_CHAT_SELECTORS) {
      try {
        const nodes = document.querySelectorAll(selector);
        let last = "";
        for (const node of nodes) {
          const text = visibleText(node);
          if (text.length >= 2) last = text;
        }
        if (nodes.length > 0) chatLike.push({ selector, count: nodes.length, lastSnippet: last.slice(-80) });
      } catch (_) {
        chatLike.push({ selector, count: -1 });
      }
    }
    const app = document.querySelector("#app");
    const bodyText = document.body ? document.body.innerText || "" : "";
    const marker = /安全验证|访问频繁|验证码|滑动验证|请完成验证|人机验证|触发风控/i.test(bodyText);

    let writeTestResult = { skipped: !writeTest };
    if (writeTest) {
      // 找一个可见输入框（会话输入区通常在本页唯一的 textarea / contenteditable）
      let target = null;
      for (const selector of PROBE_INPUT_SELECTORS) {
        try {
          const el = document.querySelector(selector);
          if (el && (el.tagName === "TEXTAREA" || el.isContentEditable)) {
            target = el;
            break;
          }
        } catch (_) {
          /* 忽略 */
        }
      }
      if (target) {
        const probeText = `__jh_probe_${Date.now()}__`;
        writeTestResult = { skipped: false, ...testFillTarget(target, probeText), clearedAfter: true };
        clearTarget(target);
      } else {
        writeTestResult = { skipped: false, error: "未找到可注入的输入框（textarea/contenteditable）" };
      }
    }

    return {
      url: location.href,
      platform: platformByHost(),
      title: clean(document.title),
      page: {
        bodyTextLen: bodyText.length,
        bodyBlank: bodyText.trim().length === 0,
        appChildren: app ? app.children.length : -1,
        appTextSample: app ? clean(app.innerText).slice(0, 80) : "",
        iframes: [...document.querySelectorAll("iframe")].map((f) => f.src).slice(0, 3),
        openShadowOnApp: Boolean(app && app.shadowRoot),
        ldJsonCount: count('script[type="application/ld+json"]'),
        marker,
      },
      jdAreaText: longestKeywordText([
        "job-sec",
        "job-detail",
        "job-desc",
        "jobDesc",
        "job-intro",
        "description-text",
        "desc",
        "detail",
        "introduce",
      ]),
      extraction: {
        company: extractPage().company || "",
        position: extractPage().position || "",
        jdLength: extractPage().jd.length,
      },
      chatLike,
      inputs,
      writeTest: writeTestResult,
    };
  }

  window.__jobhuntRunDomProbe__ = runDomProbe;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === "jobhunt-extract") {
      try {
        sendResponse({ ok: true, data: extractPage() });
      } catch (err) {
        sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
      }
    }
    if (message && message.type === "jobhunt-dom-probe") {
      try {
        sendResponse({ ok: true, data: runDomProbe(Boolean(message.writeTest)) });
      } catch (err) {
        sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
      }
    }
  });

  window.__jobhuntExtractPage__ = extractPage;
})();

// 求职作战台 · 内容脚本（运行于 Boss直聘 / 猎聘 页面）
// 职责：收到 popup 的提取请求时，从当前页面尽力提取 { 平台 / 公司 / 岗位 / JD 摘要 }。
// 定位为"半自动"：提取结果由用户在 popup 里确认/修改后才可保存，绝不自动写入。

(() => {
  "use strict";
  if (window.__jobhuntExtractInstalled__) return;
  window.__jobhuntExtractInstalled__ = true;

  const clean = (text) => (text || "").replace(/\s+/g, " ").trim();

  // JD/详情类容器关键字（采集与探测共用）
  const JD_KEYWORDS = ["job-sec", "job-detail", "job-desc", "jobDesc", "job-intro", "description-text", "desc", "detail", "introduce"];

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

  // 会话页：尽力抓取最后一条"对方消息"文本（过滤工具条/时间；抓不到由用户手动粘贴）
  function captureChatMessage() {
    const root = document.querySelector('[class*="conversation"]') || document.body;
    let last = "";
    try {
      const nodes = root.querySelectorAll('[class*="message"],[class*="msg"],[class*="bubble"],[class*="chat-msg"]');
      for (const node of nodes) {
        const text = clean(node.innerText || node.textContent || "");
        if (text.length < 6 || text.length > 800) continue;
        if (globalThis.JH && globalThis.JH.isToolbarText(text)) continue;
        if (/^\d{1,2}:\d{2}$/.test(text)) continue;
        last = text;
      }
    } catch (_) {
      /* 忽略 */
    }
    return last;
  }

  // job_detail 页：岗位/公司（公司以标题为准，防 DOM 脱敏「某基金公司」）+ JD 正文/关键词分离采集
  function captureJobDetail() {
    const JH = globalThis.JH || {};
    const parsed = JH.parseTitleJob ? JH.parseTitleJob(document.title) : { position: "", company: "" };
    const dom = fromDom();
    const domCompany = dom.company && (!JH.isMaskedCompany || !JH.isMaskedCompany(dom.company)) ? dom.company : "";
    const position = clean(parsed.position || dom.position);
    const company = clean(parsed.company || domCompany);
    const cutText = (value, max) => (JH.cut ? JH.cut(value, max) : String(value || "").slice(0, max));

    const area = longestKeywordArea(JD_KEYWORDS);
    let jdText = "";
    let jdKeywords = "";
    if (area.el) {
      const skipNonBody = (node) =>
        node.nodeName === "STYLE" ||
        node.nodeName === "SCRIPT" ||
        node.nodeName === "NOSCRIPT" ||
        isTagClass(node) ||
        computedHidden(node);
      // 关键词：正文容器内的可见 tag/chip 元素
      const tags = [...area.el.querySelectorAll("span,div,em,i,a")].filter(
        (node) => !computedHidden(node) && isTagClass(node),
      );
      const keywordParts = [];
      for (const node of tags) {
        const text = clean(node.innerText || node.textContent || "");
        if (text && text.length <= 40 && !keywordParts.includes(text)) keywordParts.push(text);
      }
      jdKeywords = keywordParts.join(" ");
      jdText = collectVisibleTextSkipping(area.el, skipNonBody);
      jdText = JH.cleanJdText ? JH.cleanJdText(jdText) : jdText;
      // 正文末尾若夹带公司介绍（同容器内），在此截断
      const companyIndex = jdText.indexOf("公司介绍");
      if (companyIndex > 0) jdText = jdText.slice(0, companyIndex);
    } else {
      jdText = JH.cleanJdText ? JH.cleanJdText(area.text) : area.text;
    }
    // 关键词兜底：容器内没有 → 页面级 chip 扫描 → 最后文本拆分
    if (!jdKeywords) {
      const pageKeywords = collectPageKeywords(jdText);
      if (pageKeywords) {
        jdKeywords = pageKeywords;
      } else if (JH.splitJdKeywords) {
        const split = JH.splitJdKeywords(jdText);
        if (split.keywords) {
          jdKeywords = split.keywords;
          jdText = split.body || jdText;
        }
      }
    }
    return {
      position: cutText(position, 80),
      company: cutText(company, 40),
      companyFromTitle: cutText(parsed.company || "", 40),
      jdText: cutText(jdText, 3000),
      jdKeywords: cutText(jdKeywords, 800),
    };
  }

  function extractPage() {
    const JH = globalThis.JH || {};
    const pageType = JH.classifyPage
      ? JH.classifyPage(location.href, document.title)
      : location.href.includes("job_detail")
        ? "job_detail"
        : location.href.includes("chat")
          ? "chat"
          : "other";
    const result = {
      url: location.href,
      platform: platformByHost(),
      pageType,
      position: "",
      company: "",
      jd: "",
      from: "none",
      capture: { position: "", company: "", companyFromTitle: "", jdText: "", jdKeywords: "" },
      message: { text: "", source: "none" },
    };
    if (pageType === "job_detail") {
      result.capture = captureJobDetail();
      result.position = result.capture.position;
      result.company = result.capture.company;
      result.jd = result.capture.jdText;
      result.from = result.capture.position || result.capture.jdText ? "typed" : "none";
      return result;
    }
    if (pageType === "chat") {
      const dom = fromDom();
      const parsed = JH.parseTitleJob ? JH.parseTitleJob(document.title) : fromTitle();
      const msg = captureChatMessage();
      result.message = { text: msg ? (JH.cut ? JH.cut(msg, 800) : msg.slice(0, 800)) : "", source: msg ? "auto" : "none" };
      result.position = JH.cut ? JH.cut(clean(parsed.position || dom.position), 80) : clean(parsed.position || dom.position).slice(0, 80);
      result.from = parsed.position ? "title" : "none";
      return result;
    }
    // other：保留原兜底（JSON-LD / DOM / 标题）
    const ld = fromJsonLd();
    const dom = fromDom();
    const parsed = JH.parseTitleJob ? JH.parseTitleJob(document.title) : fromTitle();
    if (ld && (ld.position || ld.company || ld.jd)) {
      result.position = clean(ld.position);
      result.company = clean(ld.company);
      result.jd = clean(ld.jd).slice(0, 3000);
      result.from = "jsonld";
      return result;
    }
    const domCompany = dom.company && (!JH.isMaskedCompany || !JH.isMaskedCompany(dom.company)) ? dom.company : "";
    result.position = clean(dom.position || parsed.position);
    result.company = clean(parsed.company || domCompany);
    result.jd = clean(dom.jd).slice(0, 3000);
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

  // 正文选择：候选元素里“最像 JD 正文”者。
  // 排除公司介绍/侧栏类容器；按 JD 段落标记（职位描述/岗位职责/任职要求…）计分，公司话术（成立于/是一家…）扣分；
  // 同分取文本更小的（更贴近正文而非整页）。文本量下限放宽到 150 字，避免过短 JD 被漏。
  const JD_AREA_SPECIFIC = [
    /job-sec/, /job-desc/, /jobDesc/, /jobDetail/, /job-detail/, /job-intro/, /jd-detail/, /description-text/, /desc-info/,
  ];
  const JD_SECTION_HINTS = [
    "职位描述", "岗位职责", "任职要求", "职位要求", "岗位要求", "工作职责", "工作内容",
    "你要解决", "你将负责", "你将参与", "我们希望你是", "任职资格", "职责", "加分项",
  ];
  const JD_COMPANY_SIGNALS = [
    "公司介绍", "公司简介", "是一家", "成立于", "我们相信", "投研团队", "创始人",
    "使命", "愿景", "在招职位", "热招", "了解更多",
  ];
  function containerScore(text) {
    let score = 0;
    for (const hint of JD_SECTION_HINTS) if (text.includes(hint)) score += 2;
    for (const signal of JD_COMPANY_SIGNALS) if (text.includes(signal)) score -= 3;
    return score;
  }
  function isCompanySideContainer(node) {
    const c = clsOf(node);
    return /company|corp-info|introduce|company-intro|side|aside|banner/i.test(String(c));
  }
  function clsOf(node) {
    const raw = node && node.className;
    return typeof raw === "string" ? raw : raw && raw.baseVal !== undefined ? raw.baseVal : "";
  }
  function isTagClass(node) {
    const c = clsOf(node);
    if (!c || String(c).length > 60) return false;
    return /tag|chip|keyword|tags/i.test(String(c));
  }
  function computedHidden(node) {
    if (!(node instanceof Element)) return false;
    try {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return true;
      if (parseFloat(style.fontSize) === 0) return true;
      if (node.getClientRects && node.getClientRects().length === 0 && node.tagName !== "BR") return true;
      return false;
    } catch (_) {
      return false;
    }
  }
  function longestKeywordArea(keywords) {
    const candidates = [];
    for (const el of document.querySelectorAll("div,section,article")) {
      const c = clsOf(el);
      if (!keywords.some((keyword) => c.includes(keyword))) continue;
      if (isCompanySideContainer(el)) continue;
      const text = visibleText(el);
      if (text.length < 150) continue;
      candidates.push({ el, len: text.length, text, score: containerScore(text) });
    }
    const scored = candidates.filter((candidate) => candidate.score > 0);
    const pool = scored.length ? scored : candidates;
    if (!pool.length) return { el: null, len: 0, text: "" };
    pool.sort((a, b) => (b.score - a.score) || (a.len - b.len));
    return pool[0];
  }

  function longestKeywordText(keywords) {
    const area = longestKeywordArea(keywords);
    return { len: area.len, text: area.text };
  }

  // 页面级兜底：从整页收集可见技能标签（正文容器外也可能有 tag/chip），供关键词区使用
  function collectPageKeywords(skipText) {
    const seen = [];
    const noise = /全职|实习|应届|经验|学历|本科|硕士|博士|校招|社招|关注|分享|收藏/i;
    for (const node of document.querySelectorAll('span,a,em,i,div')) {
      if (computedHidden(node)) continue;
      if (isCompanySideContainer(node)) continue;
      if (!isTagClass(node)) continue;
      const text = clean(node.innerText || node.textContent || "");
      if (text.length < 2 || text.length > 40) continue;
      if (noise.test(text)) continue;
      if (seen.includes(text)) continue;
      seen.push(text);
      if (seen.length >= 12) break;
    }
    return seen.join(" ");
  }

  // 活 DOM 上按“可见性”收集文本：跳过 style/script、隐藏/零字号反爬文本、tag 元素，避免克隆节点 innerText 退化带出 CSS 与隐藏内容
  function collectVisibleTextSkipping(root, skipFn) {
    const parts = [];
    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          for (let el = node.parentElement; el && el !== root; el = el.parentElement) {
            if (skipFn(el)) return NodeFilter.FILTER_REJECT;
          }
          if (skipFn(root)) return NodeFilter.FILTER_REJECT;
          const value = (node.nodeValue || "").trim();
          if (value) parts.push(value);
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      while (walker.nextNode()) {
        /* 遍历推进 */
      }
    } catch (_) {
      /* 忽略 */
    }
    return clean(parts.join(" "));
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
      jdAreaText: (() => {
        const area = longestKeywordText(JD_KEYWORDS);
        return { len: area.len, sample: area.text.slice(0, 160) };
      })(),
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

  // 写入直聊输入框（只填不发送；contenteditable 用 execCommand 触发 React，textarea 走原生 setter）
  function fillChatInput(text) {
    if (!text) return { filled: false, reason: "空文本" };
    let target = null;
    for (const selector of ['[contenteditable="true"]', "textarea"]) {
      try {
        const el = document.querySelector(selector);
        if (el && (el.isContentEditable || el.tagName === "TEXTAREA")) {
          target = el;
          break;
        }
      } catch (_) {
        /* 忽略 */
      }
    }
    if (!target) return { filled: false, reason: "未找到可用的输入框（textarea/contenteditable）" };
    try {
      target.focus();
      if (target.isContentEditable) {
        const range = document.createRange();
        range.selectNodeContents(target);
        range.deleteContents();
        const inserted = document.execCommand("insertText", false, text);
        const readBack = clean(target.innerText || target.textContent || "");
        const ok = Boolean(readBack.includes(text) && inserted !== false);
        return { filled: ok, tag: "DIV", reason: ok ? "" : "写入后未读到文本，请改用「复制」后手动粘贴" };
      }
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      setter.call(target, text);
      target.dispatchEvent(new Event("input", { bubbles: true }));
      const ok = Boolean((target.value || "").includes(text));
      return { filled: ok, tag: "TEXTAREA", reason: ok ? "" : "写入后未读到文本，请改用「复制」" };
    } catch (err) {
      return { filled: false, reason: String(err && err.message ? err.message : err) };
    }
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
    if (message && message.type === "jobhunt-fill") {
      try {
        sendResponse({ ok: true, ...fillChatInput(String(message.text || "")) });
      } catch (err) {
        sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
      }
    }
  });

  window.__jobhuntExtractPage__ = extractPage;
})();

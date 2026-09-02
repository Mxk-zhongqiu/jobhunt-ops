// 求职作战台 · P1 纯函数库（无 DOM / 无网络，node 与浏览器双端可测）
// 注入顺序要求：content script 数组里本文件在 content/extract.js 之前；
// background 在 config.js 之后 importScripts("lib/parsers.js")。
// 测试：scripts/test/parsers.test.mjs 用 node:vm 沙箱加载（不依赖 DOM）。
(() => {
  "use strict";

  const CATEGORY_LABEL = {
    basic: "基本信息",
    jobIntent: "求职意向",
    education: "教育背景",
    experience: "实习经历",
    project: "项目经历",
    leadership: "任职经历",
    skill: "核心技能",
    honor: "奖励证书",
    selfIntro: "自我评价",
  };
  const CATEGORY_ORDER = ["basic", "education", "experience", "project", "leadership", "skill", "honor", "selfIntro"];

  /** 折叠空白并去首尾 */
  function norm(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  /** 截断到 max 字符 */
  function cut(text, max) {
    const value = String(text || "");
    return value.length > max ? value.slice(0, max) : value;
  }

  /** 从页面标题解析 岗位/公司（实测样例：「量化研究实习生（北京）招聘」_微观博易招聘-BOSS直聘） */
  function parseTitleJob(title) {
    let t = norm(title);
    let company = "";
    // 剥离站点尾缀
    t = t.replace(/-?\s*(BOSS直聘|Liepin招聘|Boss直聘|boss直聘|拉勾网|招聘)$/i, "").trim();
    if (!t) return { position: "", company: "" };
    // 形态 A：「岗位招聘」_公司招聘
    const m = t.match(/^「(.+?)」\s*[_-]\s*(.+?)(?:招聘)?$/);
    if (m) {
      const tail = norm(m[2]).replace(/(招聘|招聘信息|招聘网)$/, "");
      return { position: norm(m[1]).replace(/(招聘|招聘信息|招聘网)$/, ""), company: tail };
    }
    // 形态 B：岗位_公司（招聘）
    const parts = t.split(/[_-]/).map((s) => norm(s)).filter(Boolean);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1].replace(/(招聘|招聘信息|招聘网)$/, "");
      const maybeCompany = norm(last);
      if (maybeCompany.includes("公司") || maybeCompany.includes("资管") || maybeCompany.includes("基金") || maybeCompany.includes("投资") || maybeCompany.includes("资本")) {
        company = maybeCompany;
        return { position: norm(parts.slice(0, -1).join(" ")), company };
      }
      return { position: norm(parts.join(" ")), company: "" };
    }
    return { position: t.replace(/招聘$/, "").trim(), company: "" };
  }

  /** 页面类型识别（所有自动抓取的前置） */
  function classifyPage(url, title) {
    const href = String(url || "");
    const t = String(title || "");
    if (/job_detail/i.test(href)) return "job_detail";
    if (/\/chat/i.test(href)) return "chat";
    if (/job/i.test(href) && t.includes("招聘")) return "job_detail";
    if (t.includes("「") && t.includes("招聘")) return "job_detail";
    return "other";
  }

  /** 工具条/提示/系统文案过滤（消息候选需剔除） */
  function isToolbarText(text) {
    return /发简历|换电话|换微信|按Enter|微信扫码|安全验证|访问频繁|人机验证|请完成验证|你已屏蔽|对方已屏蔽/i.test(String(text || ""));
  }

  /** 版本推荐：职位/JD 文本 vs 版本 targetRole+positions 的关键词包含评分 */
  function suggestVersion(jobText, versions) {
    const hay = norm(String(jobText || ""));
    const list = Array.isArray(versions) ? versions : [];
    if (!hay || !list.length) return { versionId: undefined, reason: "缺少职位文本或简历版本" };
    let best = { versionId: undefined, score: 0, hits: [] };
    for (const version of list) {
      const needle = norm(
        `${version.targetRole || ""} ${version.jobIntentPositions || ""} ${version.name || ""}`,
      );
      const tokens = (needle.match(/[A-Za-z0-9\u4e00-\u9fa5]+/g) || []).filter((token) => token.length >= 2);
      let score = 0;
      const hits = [];
      for (const token of tokens) {
        if (hay.includes(token)) {
          score += token.length;
          if (hits.length < 3 && !hits.includes(token)) hits.push(token);
        }
      }
      if (score > best.score) best = { versionId: version.id, score, hits };
    }
    if (!best.versionId) return { versionId: undefined, reason: "未匹配到版本，请手动选择" };
    return { versionId: best.versionId, reason: `命中：${best.hits.join("、")}` };
  }

  /** 版本 → 简历摘要文本（materials 需已应用 override；≤6000 字符） */
  function buildVersionDigest(version, materials) {
    if (!version || !Array.isArray(materials)) return "";
    const byId = new Map(materials.map((item) => [item.id, item]));
    const blocks = (version.blocks || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const sections = [];
    const intent = version.jobIntent || {};
    const intentLines = [];
    const push = (label, value) => {
      const v = norm(value);
      if (v) intentLines.push(`${label}：${v}`);
    };
    push("目标岗位", intent.positions);
    push("期望城市", intent.city);
    push("期望薪资", intent.expectSalary);
    push("到岗时间", intent.availability);
    push("技能标签", intent.tags);
    if (intentLines.length) sections.push(`【求职意向】\n${intentLines.join("\n")}`);

    const grouped = new Map();
    for (const block of blocks) {
      const material = byId.get(block.materialId);
      if (!material) continue;
      const category = material.category && material.category !== "jobIntent" ? material.category : "basic";
      if (!grouped.has(category)) grouped.set(category, []);
      grouped.get(category).push(material);
    }
    for (const category of CATEGORY_ORDER) {
      const group = grouped.get(category);
      if (!group || !group.length) continue;
      const lines = [`【${CATEGORY_LABEL[category] || category}】`];
      for (const material of group) {
        lines.push(`# ${norm(material.title)}`);
        if (material.subtitle) lines.push(norm(material.subtitle));
        for (const point of Array.isArray(material.content) ? material.content : []) {
          const line = norm(point);
          if (line) lines.push(`· ${line}`);
        }
      }
      sections.push(lines.join("\n"));
    }
    return cut(sections.join("\n\n"), 6000);
  }

  /** 公司名脱敏检测（实测：job_detail DOM 里公司显示为「某基金公司」） */
  function isMaskedCompany(text) {
    return /某(?:基金|知名|大型|中小|外资)?公司|某证券|某资管|知名企业/i.test(String(text || ""));
  }

  globalThis.JH = {
    norm,
    cut,
    parseTitleJob,
    classifyPage,
    isToolbarText,
    suggestVersion,
    buildVersionDigest,
    isMaskedCompany,
  };
})();

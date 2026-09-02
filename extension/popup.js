// 求职作战台 · popup 逻辑（经典脚本，无模块）
// 交互：登录 → 从当前页提取（Boss直聘/猎聘 半自动）→ 确认/修改 → 新增投递；或从云端记录里选一条更新状态。
// 原则：所有字段可改、所有写入都由用户点按钮触发；后台只写本人 uid 的 states 文档。

"use strict";

const STATUSES = ["计划投递", "已投递", "笔试", "一面", "二面", "终面", "Offer", "已拒绝", "放弃"];
const TIERS = ["冲刺", "主攻", "保底"];
const PLATFORMS = ["Boss直聘", "猎聘", "官网", "牛客", "应届生", "学校就业网", "内推", "实习转正", "其他平台"];

const $ = (id) => document.getElementById(id);
const elements = {
  sessionChip: $("sessionChip"),
  authSection: $("authSection"),
  workspace: $("workspace"),
  loginForm: $("loginForm"),
  loginEmail: $("loginEmail"),
  loginPassword: $("loginPassword"),
  loginBtn: $("loginBtn"),
  authedBar: $("authedBar"),
  authedText: $("authedText"),
  signOutBtn: $("signOutBtn"),
  authError: $("authError"),
  extractBtn: $("extractBtn"),
  addForm: $("addForm"),
  fCompany: $("fCompany"),
  fPlatform: $("fPlatform"),
  fPosition: $("fPosition"),
  fTier: $("fTier"),
  fStatus: $("fStatus"),
  fJd: $("fJd"),
  jdChars: $("jdChars"),
  fDeadline: $("fDeadline"),
  fUrl: $("fUrl"),
  addBtn: $("addBtn"),
  refreshListBtn: $("refreshListBtn"),
  candidateSel: $("candidateSel"),
  nextStatusSel: $("nextStatusSel"),
  applyStatusBtn: $("applyStatusBtn"),
  probeRunBtn: $("probeRunBtn"),
  probeWriteCb: $("probeWriteCb"),
  probeOut: $("probeOut"),
  aiExtractBtn: $("aiExtractBtn"),
  aiMode: $("aiMode"),
  aiTone: $("aiTone"),
  aiPosition: $("aiPosition"),
  aiCompany: $("aiCompany"),
  aiVersion: $("aiVersion"),
  aiJdBlock: $("aiJdBlock"),
  aiJd: $("aiJd"),
  aiHrBlock: $("aiHrBlock"),
  aiHr: $("aiHr"),
  aiGenBtn: $("aiGenBtn"),
  aiNote: $("aiNote"),
  aiDraftList: $("aiDraftList"),
  result: $("result"),
};

// ─── 基础 ───

function fillSelect(select, options, selected) {
  select.innerHTML = "";
  for (const value of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    if (value === selected) option.selected = true;
    select.appendChild(option);
  }
}

function showResult(kind, text) {
  elements.result.hidden = false;
  elements.result.className = "result " + kind;
  elements.result.textContent = text;
}

function callBackground(type, payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        resolve({ ok: false, code: "NO_BACKGROUND", error: lastError.message });
        return;
      }
      resolve(response || { ok: false, code: "EMPTY_RESPONSE", error: "后台无响应（请重载扩展后重试）" });
    });
  });
}

// ─── 登录状态 ───

async function refreshSessionUi() {
  const res = await callBackground("getSession", {});
  if (res.ok && res.loggedIn) {
    elements.sessionChip.textContent = "已登录";
    elements.sessionChip.className = "chip chip-ok";
    elements.authedText.textContent = `${res.email}`;
    elements.authSection.querySelector("#loginForm").hidden = true;
    elements.authedBar.hidden = false;
    elements.workspace.hidden = false;
    elements.authError.hidden = true;
    await loadCandidates("");
  } else {
    elements.sessionChip.textContent = "未登录";
    elements.sessionChip.className = "chip chip-muted";
    elements.authSection.querySelector("#loginForm").hidden = false;
    elements.authedBar.hidden = true;
    elements.workspace.hidden = true;
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const email = elements.loginEmail.value.trim();
  const password = elements.loginPassword.value;
  elements.loginBtn.disabled = true;
  elements.loginBtn.textContent = "登录中…";
  elements.authError.hidden = true;
  const res = await callBackground("signIn", { email, password });
  elements.loginBtn.disabled = false;
  elements.loginBtn.textContent = "登录作战台账号";
  if (res.ok) {
    elements.loginPassword.value = "";
    await refreshSessionUi();
  } else {
    elements.authError.hidden = false;
    elements.authError.textContent = "登录失败：" + (res.error || "未知错误");
  }
}

async function handleSignOut() {
  await callBackground("signOut", {});
  await refreshSessionUi();
}

// ─── 页面提取（Boss直聘 / 猎聘）───

// 内容脚本不可用时（非支持域名等）的兜底提取：以函数形式注入当前标签页执行
function fallbackExtract() {
  const clean = (t) => (t || "").replace(/\s+/g, " ").trim();
  const pick = (selectors) => {
    for (const s of selectors) {
      try {
        const el = document.querySelector(s);
        if (el && el.textContent && clean(el.textContent)) return clean(el.textContent);
      } catch (_) {}
    }
    return "";
  };
  let position = pick([".job-title", '[class*="job-title"]', '[class*="position-name"]', "h1"]);
  let company = pick([
    ".company-name",
    '[class*="company-name"]',
    '[class*="companyName"]',
    '[class*="boss-name"]',
    '[class*="company-info"] a',
    '[class*="name"]',
  ]);
  const jd = pick([
    ".job-sec-text",
    '[class*="job-sec"]',
    '[class*="job-detail"]',
    '[class*="jobDesc"]',
    '[class*="description-text"]',
  ]).slice(0, 500);
  const title = clean(document.title);
  if (!position || !company) {
    const m = title.match(/^(.+?)\s*[-_]\s*(.+?)(?:招聘信息|_招聘|-?\s*Liepin|Boss直聘)/i);
    if (m) {
      if (!position) position = m[1];
      if (!company) company = m[2];
    }
  }
  const host = location.hostname;
  return {
    url: location.href,
    platform: host.includes("zhipin") ? "Boss直聘" : host.includes("liepin") ? "猎聘" : "其他平台",
    company,
    position,
    jd,
  };
}

async function extractFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    showResult("err", "找不到当前标签页");
    return null;
  }
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "jobhunt-extract" });
    if (res && res.ok) return res.data;
    throw new Error(res && res.error ? res.error : "提取失败");
  } catch (_) {
    // 无内容脚本（非支持域名 / 页面未加载完）→ 注入兜底函数
    try {
      const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: fallbackExtract });
      const data = results && results[0] && results[0].result;
      if (data) return data;
    } catch (err) {
      showResult("err", "无法读取该页面（" + (err && err.message ? err.message : "未知错误") + "），请手动填写");
      return null;
    }
  }
  return null;
}

async function handleExtract() {
  elements.extractBtn.disabled = true;
  elements.extractBtn.textContent = "提取中…";
  try {
    const data = await extractFromActiveTab();
    if (!data) return;
    const found = Boolean(data.company || data.position || data.jd);
    elements.fCompany.value = data.company || "";
    elements.fPosition.value = data.position || "";
    if (data.platform && PLATFORMS.includes(data.platform)) elements.fPlatform.value = data.platform;
    if (data.url) elements.fUrl.value = data.url;
    if (data.jd) {
      elements.fJd.value = data.jd.slice(0, 500);
      elements.jdChars.textContent = String(elements.fJd.value.length);
    }
    showResult(found ? "ok" : "err", found ? "已从当前页提取，请核对后再保存。" : "未能从当前页识别岗位信息（仅支持 Boss直聘 / 猎聘 页面），请手动填写后保存。");
  } finally {
    elements.extractBtn.disabled = false;
    elements.extractBtn.textContent = "从当前页提取";
  }
}

// ─── 新增投递 ───

async function handleAdd(event) {
  event.preventDefault();
  const company = elements.fCompany.value.trim();
  if (!company) {
    showResult("err", "请填写公司名称");
    return;
  }
  elements.addBtn.disabled = true;
  elements.addBtn.textContent = "写入中…";
  const payload = {
    company,
    platform: elements.fPlatform.value,
    position: elements.fPosition.value.trim(),
    tier: elements.fTier.value,
    status: elements.fStatus.value,
    jdSummary: elements.fJd.value.trim(),
    deadline: elements.fDeadline.value || undefined,
    url: elements.fUrl.value.trim(),
  };
  const res = await callBackground("upsertApplication", payload);
  elements.addBtn.disabled = false;
  elements.addBtn.textContent = "保存到作战台";
  if (res.ok) {
    showResult("ok", res.message || "已保存");
    await loadCandidates("");
  } else {
    showResult("err", "写入失败：" + (res.error || "未知错误"));
    if (res.code === "AUTH_REQUIRED") await refreshSessionUi();
    if (res.code === "CLOUD_EMPTY") showResult("err", res.error);
  }
}

// ─── 更新状态 ───

async function loadCandidates(filterText) {
  const res = await callBackground("listCandidates", { company: filterText || "" });
  if (!res.ok) {
    elements.candidateSel.innerHTML = '<option value="">（未登录或读取失败）</option>';
    return;
  }
  if (res.emptyCloud) {
    elements.candidateSel.innerHTML =
      '<option value="">云端还没有数据：请先在 obs.jobhunt.top 登录一次</option>';
    return;
  }
  const candidates = res.candidates || [];
  const select = elements.candidateSel;
  select.innerHTML = "";
  if (!candidates.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "（云端暂无投递记录）";
    select.appendChild(option);
    return;
  }
  for (const item of candidates) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `${item.company} · ${item.position || "—"}（${item.status}${item.platform ? " · " + item.platform : ""}）`;
    select.appendChild(option);
  }
}

async function handleApplyStatus() {
  const id = elements.candidateSel.value;
  if (!id) {
    showResult("err", "请先在列表中选择一条投递记录（如为空请点「刷新」）");
    return;
  }
  const status = elements.nextStatusSel.value;
  elements.applyStatusBtn.disabled = true;
  const res = await callBackground("setStatus", { id, status });
  elements.applyStatusBtn.disabled = false;
  if (res.ok) {
    showResult("ok", res.message || "已更新");
    await loadCandidates("");
  } else {
    showResult("err", "更新失败：" + (res.error || "未知错误"));
    if (res.code === "AUTH_REQUIRED") await refreshSessionUi();
    if (res.code === "CLOUD_EMPTY") showResult("err", res.error);
  }
}

// ─── DOM 能力探测（P1 spike）───

async function runDomProbe() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  elements.probeOut.value = "";
  if (!tab || !tab.id) {
    showResult("err", "找不到当前标签页");
    return;
  }
  const writeTest = elements.probeWriteCb.checked;
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "jobhunt-dom-probe", writeTest });
    if (!res || !res.ok) {
      throw new Error(res && res.error ? res.error : "无响应（请确认当前是 BOSS直聘/猎聘 页面，且扩展已重新加载）");
    }
    const json = JSON.stringify(res.data, null, 2);
    elements.probeOut.value = json;
    try {
      await navigator.clipboard.writeText(json);
      showResult("ok", "探测完成：结果已复制到剪贴板，直接粘贴回对话即可");
    } catch (_) {
      showResult("ok", "探测完成：未能自动复制，请手动全选下方文本后复制");
    }
  } catch (err) {
    elements.probeOut.value = "";
    showResult("err", "探测失败：" + (err && err.message ? err.message : err));
  }
}

// ─── ④ AI 写手 ───

let aiExtractData = null;
let aiVersions = [];

function showAiNote(text) {
  elements.aiNote.hidden = !text;
  elements.aiNote.textContent = text || "";
}

function syncAiModeUi() {
  const mode = elements.aiMode.value;
  elements.aiJdBlock.hidden = mode !== "greeting";
  elements.aiHrBlock.hidden = mode !== "reply";
}

async function ensureAiVersions(hintText) {
  const res = await callBackground("suggestResumeVersion", { hint: (hintText || "").slice(0, 120) });
  const select = elements.aiVersion;
  if (!res.ok) {
    select.innerHTML = '<option value="">（读取失败）</option>';
    showAiNote(res.code === "AUTH_REQUIRED" ? "请先在顶部登录作战台账号" : res.error || "读取简历版本失败");
    return false;
  }
  const versions = res.versions || [];
  aiVersions = versions;
  select.innerHTML = "";
  if (res.empty || !versions.length) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "（云端暂无简历版本）";
    select.appendChild(o);
    showAiNote("云端还没有简历：请先在 obs.jobhunt.top 登录并保存简历后再用 AI 写手");
    return false;
  }
  for (const v of versions) {
    const o = document.createElement("option");
    o.value = v.id;
    o.textContent = v.name + (v.id === res.versionId ? "（推荐）" : "");
    select.appendChild(o);
  }
  select.value = res.versionId || versions[0].id || "";
  showAiNote(res.versionId && res.reason ? `版本推荐：${res.reason}` : "未自动匹配到版本，请手动选择");
  return true;
}

async function aiExtractForDrafts() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    showResult("err", "找不到当前标签页");
    return;
  }
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "jobhunt-extract" });
    if (!res || !res.ok) throw new Error(res && res.error ? res.error : "无响应：请确认在 BOSS直聘/猎聘 页面");
    const d = res.data || {};
    aiExtractData = d;
    const capture = d.capture || {};
    const position = d.pageType === "job_detail" ? capture.position : d.position || capture.position;
    if (position) elements.aiPosition.value = position;
    if (capture.company) elements.aiCompany.value = capture.company;
    if (d.pageType === "job_detail" && capture.jdText) elements.aiJd.value = capture.jdText;
    if (d.pageType === "chat" && d.message && d.message.text && !elements.aiHr.value.trim()) {
      elements.aiHr.value = d.message.text;
    }
    const bits = [];
    if (d.pageType === "job_detail") {
      bits.push("已抓取岗位/JD");
      if (capture.companyFromTitle) bits.push("公司按页面标题：" + capture.companyFromTitle);
      else if (!capture.company) bits.push("未识别公司，请手填");
    } else if (d.pageType === "chat") {
      bits.push(d.message && d.message.source === "auto" ? "已抓取最后一条 HR 消息" : "未能自动抓取 HR 消息，请手动粘贴");
      if (d.position) bits.push("岗位：" + d.position);
    } else {
      bits.push("当前页不是岗位/会话页，请手动填写");
    }
    showAiNote(bits.join("；"));
    if (!aiVersions.length || elements.aiVersion.options.length <= 1) {
      await ensureAiVersions(position + " " + (capture.jdText || d.jd || ""));
    }
  } catch (err) {
    showAiNote("抓取失败：" + (err && err.message ? err.message : err));
  }
}

async function aiGenerateDrafts() {
  const mode = elements.aiMode.value;
  const position = elements.aiPosition.value.trim();
  const company = elements.aiCompany.value.trim();
  const jdText = elements.aiJd.value.trim();
  const hrMessage = elements.aiHr.value.trim();
  if (mode === "greeting" && !position && !jdText) {
    showResult("err", "打招呼需要岗位或 JD（点「从当前页抓取」或手填）");
    return;
  }
  if (mode === "reply" && !hrMessage) {
    showResult("err", "回复建议需要 HR 消息文本（自动抓不到就手动粘贴）");
    return;
  }
  elements.aiGenBtn.disabled = true;
  elements.aiGenBtn.textContent = "生成中…";
  showAiNote("正在生成 3 版草稿（约 5–15 秒）…");
  const res = await callBackground("aiGenerate", {
    mode,
    jd: { position, company, jdText },
    hrMessage,
    versionId: elements.aiVersion.value || undefined,
    tone: elements.aiTone.value,
  });
  elements.aiGenBtn.disabled = false;
  elements.aiGenBtn.textContent = "生成 3 版草稿";
  if (!res.ok) {
    showResult("err", res.error || "生成失败");
    if (res.code === "AUTH_REQUIRED") await refreshSessionUi();
    if (res.code === "RESUME_EMPTY") await ensureAiVersions(position);
    return;
  }
  renderAiDrafts(res.drafts || [], res.notes || "");
}

function renderAiDrafts(drafts, notes) {
  const box = elements.aiDraftList;
  box.innerHTML = "";
  showAiNote(notes || "");
  drafts.forEach((draft, index) => {
    const row = document.createElement("div");
    row.className = "ai-draft";
    const head = document.createElement("div");
    head.className = "ai-draft-head";
    const label = document.createElement("span");
    label.textContent = `草稿 ${index + 1}`;
    const buttons = document.createElement("span");
    buttons.className = "ai-draft-btns";
    const fillBtn = document.createElement("button");
    fillBtn.type = "button";
    fillBtn.className = "btn primary small";
    fillBtn.textContent = "填入输入框";
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn ghost small";
    copyBtn.textContent = "复制";
    buttons.append(fillBtn, copyBtn);
    head.append(label, buttons);
    const textarea = document.createElement("textarea");
    textarea.className = "ai-draft-text";
    textarea.rows = 4;
    textarea.value = draft;
    fillBtn.addEventListener("click", () => aiFillIntoPage(textarea.value));
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(textarea.value);
        showAiNote("已复制草稿 " + (index + 1) + "，发送前请人工核对");
      } catch (_) {
        showResult("err", "复制失败，请手动选择文本复制");
      }
    });
    row.append(head, textarea);
    box.appendChild(row);
  });
  showResult("ok", `已生成 ${drafts.length} 版草稿——均为建议，核对后由你发送`);
}

async function aiFillIntoPage(text) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    showResult("err", "找不到当前标签页");
    return;
  }
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "jobhunt-fill", text });
    if (!res || !res.ok) throw new Error(res && res.error ? res.error : "无响应：请在 BOSS直聘 会话页使用");
    if (res.filled) {
      showResult("ok", "已填入输入框——请人工核对后按 Enter 发送（扩展不会替你发送）");
    } else {
      try {
        await navigator.clipboard.writeText(text);
        showAiNote("未能自动填入（" + (res.reason || "未知原因") + "），已复制：请手动粘贴后发送");
      } catch (_) {
        showAiNote("未能自动填入（" + (res.reason || "未知原因") + "），请手动复制粘贴");
      }
    }
  } catch (err) {
    showAiNote("填入失败：" + (err && err.message ? err.message : err));
  }
}

// ─── 事件绑定与初始化 ───

function init() {
  fillSelect(elements.fPlatform, PLATFORMS, "Boss直聘");
  fillSelect(elements.fTier, TIERS, "主攻");
  fillSelect(elements.fStatus, ["计划投递", "已投递"], "已投递");
  fillSelect(elements.nextStatusSel, STATUSES, "已投递");

  elements.loginForm.addEventListener("submit", handleLogin);
  elements.signOutBtn.addEventListener("click", handleSignOut);
  elements.extractBtn.addEventListener("click", handleExtract);
  elements.addForm.addEventListener("submit", handleAdd);
  elements.refreshListBtn.addEventListener("click", () => loadCandidates(""));
  elements.applyStatusBtn.addEventListener("click", handleApplyStatus);
  elements.probeRunBtn.addEventListener("click", runDomProbe);
  elements.aiMode.addEventListener("change", syncAiModeUi);
  elements.aiExtractBtn.addEventListener("click", aiExtractForDrafts);
  elements.aiGenBtn.addEventListener("click", aiGenerateDrafts);
  syncAiModeUi();
  elements.fJd.addEventListener("input", () => {
    elements.jdChars.textContent = String(elements.fJd.value.length);
  });
  refreshSessionUi();
}

document.addEventListener("DOMContentLoaded", init);

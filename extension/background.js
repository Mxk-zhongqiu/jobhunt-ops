// 求职作战台 · 投递同步助手 —— 后台 Service Worker（Manifest V3，经典脚本）
// 职责：
//   1) Firebase 邮箱密码登录 / 刷新令牌（REST，不带 SDK，体积小）；
//   2) 经 Firestore REST 只读写「当前登录账号」自己的文档 states/{uid}；
//   3) 新增投递（去重合并）与状态更新（与网页端同一语义：状态变化自动追加 statusHistory 时间线）。
// 红线：
//   - 不含任何服务端密钥（凭据仅 Firebase Web 公网配置，与网站生产构建一致）；
//   - 只操作本账号 uid 的文档，Firestore 规则仍按 uid 隔离兜底；
//   - 所有写入均由用户在 popup 确认后发起，本文件不做任何"自动"写入。

importScripts("config.js");
importScripts("lib/parsers.js");

const CFG = globalThis.EXT_CONFIG || {};
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${CFG.projectId}/databases/(default)/documents`;
const authUrl = (action) =>
  `https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${encodeURIComponent(CFG.apiKey)}`;
const TOKEN_URL = `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(CFG.apiKey)}`;
const SESSION_KEY = "extSession";
const EXPIRY_SLACK_MS = 60_000; // 令牌到期前 1 分钟视为过期

const STATUSES = ["计划投递", "已投递", "笔试", "一面", "二面", "终面", "Offer", "已拒绝", "放弃"];
const TIERS = ["冲刺", "主攻", "保底"];
const PLATFORMS = ["Boss直聘", "猎聘", "官网", "牛客", "应届生", "学校就业网", "内推", "实习转正", "其他平台"];

// ─── 工具 ───

const normalize = (s) => (s || "").trim().toLowerCase();
const todayStr = () => new Date().toISOString().slice(0, 10);

function isWebPublicConfigReady() {
  return Boolean(CFG.apiKey && CFG.projectId);
}

function authError() {
  const err = new Error("尚未登录：请先在插件里用作战台账号（邮箱）登录");
  err.code = "AUTH_REQUIRED";
  return err;
}

function cloudEmptyError() {
  const err = new Error("云端还没有你的数据文档：请先在 https://obs.jobhunt.top 登录一次（触发云端初始化），再回来同步");
  err.code = "CLOUD_EMPTY";
  return err;
}

async function requestJson(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (err) {
    throw new Error(`网络请求失败：${err && err.message ? err.message : err}`);
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }
  if (!res.ok) {
    const msg =
      json && json.error && json.error.message
        ? json.error.message
        : json && json.error
          ? String(json.error)
          : `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return json;
}

// ─── 会话（登录 / 刷新 / 登出）───

async function getSession() {
  const stored = await chrome.storage.local.get(SESSION_KEY);
  return stored[SESSION_KEY] || null;
}

async function saveSession(session) {
  await chrome.storage.local.set({ [SESSION_KEY]: session });
}

async function signIn(email, password) {
  if (!isWebPublicConfigReady()) throw new Error("缺少 Firebase 公网配置：请先生成 extension/config.js（npm run ext:config）");
  if (!email || !password) throw new Error("请输入邮箱和密码");
  const json = await requestJson(authUrl("signInWithPassword"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password, returnSecureToken: true }),
  });
  const session = {
    email: email.trim().toLowerCase(),
    uid: json.localId,
    idToken: json.idToken,
    refreshToken: json.refreshToken,
    expiry: Date.now() + Number(json.expiresIn || 3600) * 1000,
  };
  await saveSession(session);
  return { email: session.email, uid: session.uid };
}

async function refreshToken() {
  const session = await getSession();
  if (!session || !session.refreshToken) throw authError();
  const json = await requestJson(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "refresh_token", refresh_token: session.refreshToken }),
  });
  const updated = {
    ...session,
    idToken: json.id_token,
    expiry: Date.now() + (Number(json.expires_in) || 3600) * 1000,
  };
  await saveSession(updated);
  return updated;
}

/** 返回一个带有效 idToken 的会话；过期则自动刷新 */
async function ensureToken() {
  let session = await getSession();
  if (!session || !session.refreshToken) throw authError();
  if (session.idToken && session.expiry && Date.now() < session.expiry - EXPIRY_SLACK_MS) return session;
  return refreshToken();
}

async function signOut() {
  await chrome.storage.local.remove(SESSION_KEY);
  return { signedOut: true };
}

// ─── Firestore REST：编解码 ───

function encodeField(value) {
  if (value === null || value === undefined) return { nullValue: null };
  const t = typeof value;
  if (t === "string") return { stringValue: value };
  if (t === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (t === "boolean") return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeField) } };
  if (t === "object") {
    const fields = {};
    for (const key of Object.keys(value)) fields[key] = encodeField(value[key]);
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

function decodeField(field) {
  if (!field) return null;
  if ("stringValue" in field) return field.stringValue;
  if ("integerValue" in field) return Number(field.integerValue);
  if ("doubleValue" in field) return field.doubleValue;
  if ("booleanValue" in field) return field.booleanValue;
  if ("nullValue" in field) return null;
  if ("timestampValue" in field) return field.timestampValue;
  if ("arrayValue" in field) return (field.arrayValue.values || []).map(decodeField);
  if ("mapValue" in field) {
    const out = {};
    const fields = (field.mapValue && field.mapValue.fields) || {};
    for (const key of Object.keys(fields)) out[key] = decodeField(fields[key]);
    return out;
  }
  return null;
}

async function docRequest(collection, pathSuffix, init) {
  const session = await ensureToken();
  const url = `${FS_BASE}/${collection}/${encodeURIComponent(session.uid)}${pathSuffix}`;
  const headers = { Authorization: `Bearer ${session.idToken}`, ...(init && init.headers) };
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }
  if (!res.ok) {
    if (res.status === 404) return null;
    const msg =
      json && json.error && json.error.message ? json.error.message : json && json.error ? String(json.error) : `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return json;
}

/** 读取本人 states/{uid} 的 data 字段；云端还没有文档时返回 null */
async function readState() {
  const json = await docRequest("states", "?mask.fieldPaths=data&mask.fieldPaths=updatedAt");
  if (!json || !json.fields || !json.fields.data) return null;
  return decodeField(json.fields.data);
}

/** 整份写回本人 states/{uid}.data（与网页端同一文档模型：{ data, updatedAt }） */
async function writeState(appState) {
  const patch = "?updateMask.fieldPaths=data&updateMask.fieldPaths=updatedAt";
  await docRequest("states", patch, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: { data: encodeField(appState), updatedAt: { timestampValue: new Date().toISOString() } },
    }),
  });
  return true;
}

/** 仅当云端还没有任何文档时的兜底空壳（不会真正写出，只用于列表展示为空） */
function emptyState() {
  return {
    applications: [],
    interviews: [],
    weeklyPlans: [],
    projects: [],
    knowledge: [],
    questionBankMastered: [],
    settings: {
      targetName: "",
      startDate: "2026-08-18",
      dailySubmitTarget: 3,
      totalTarget: 100,
      aiProvider: "mock",
    },
  };
}

// ─── P1 · AI 写手：简历读取 / 版本推荐 / 摘要投影 / aiGenerate ───

const JH = globalThis.JH || {};
const cutS = (value, max) => (JH.cut ? JH.cut(value, max) : String(value || "").slice(0, max));

function codeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function aiErrorMessage(code) {
  const map = {
    AUTH_REQUIRED: "请先在插件里登录作战台账号",
    RESUME_EMPTY: "云端还没有简历：请先在 obs.jobhunt.top 登录并保存简历",
    AI_NOT_CONFIGURED: "AI 代理未配置/未部署：请确认 Worker 已部署且已运行 npm run ext:config",
    AI_NOT_CONFIGURED_CLOUD: "AI 代理未配置（Worker 未部署或未配置密钥）",
    INSUFFICIENT_BALANCE: "DeepSeek 余额不足，请充值后再试",
    RATE_LIMITED: "请求过于频繁，请稍后重试",
    TIMEOUT: "AI 响应超时，请重试",
    OUTPUT_TRUNCATED: "AI 输出被截断，请重试",
    INVALID_PROVIDER_RESPONSE: "AI 返回格式异常，请重试",
    DEEPSEEK_REQUEST_FAILED: "网络请求失败，请检查网络与 AI 代理地址",
  };
  return map[code] || `生成失败（${code || "未知错误"}），请确认 Worker 已部署新版本后重试`;
}

/** 读取本人 resumes/{uid}.data（{ materials, versions }）；空态返回 empty */
async function readResumeState() {
  const json = await docRequest("resumes", "?mask.fieldPaths=data&mask.fieldPaths=updatedAt");
  if (!json || !json.fields || !json.fields.data) return { empty: true, resumeState: null };
  const resumeState = decodeField(json.fields.data);
  const empty = !resumeState || !Array.isArray(resumeState.versions) || resumeState.versions.length === 0;
  return { empty, resumeState };
}

function summarizeVersions(resumeState) {
  const versions = (resumeState && Array.isArray(resumeState.versions) ? resumeState.versions : []).map((v) => ({
    id: v.id,
    name: v.name || "",
    targetRole: v.targetRole || "",
    jobIntentPositions: (v.jobIntent && v.jobIntent.positions) || "",
  }));
  return versions;
}

/** 版本内素材应用 override 后的解析列表（供 JH.buildVersionDigest 使用） */
function resolveMaterialsForVersion(resumeState, version) {
  const byId = new Map((resumeState.materials || []).map((m) => [m.id, m]));
  return (version.blocks || [])
    .map((block) => {
      const m = byId.get(block.materialId);
      if (!m) return null;
      const override = block.override || {};
      return {
        id: m.id,
        category: m.category,
        title: override.title ?? m.title,
        subtitle: override.subtitle ?? m.subtitle,
        content: override.content ?? m.content,
      };
    })
    .filter(Boolean);
}

function parseDraftPayload(content, mode) {
  let value;
  try {
    value = JSON.parse(content);
  } catch (_) {
    throw codeError("INVALID_PROVIDER_RESPONSE", "AI 返回格式异常");
  }
  if (!value || value.kind !== mode || !Array.isArray(value.drafts)) throw codeError("INVALID_PROVIDER_RESPONSE", "AI 返回格式异常");
  const drafts = value.drafts
    .filter((item) => typeof item === "string" && item.trim().length > 0)
    .slice(0, 3)
    .map((item) => item.trim());
  if (drafts.length === 0) throw codeError("INVALID_PROVIDER_RESPONSE", "AI 未返回有效话术");
  return { drafts, notes: typeof value.notes === "string" ? value.notes : "" };
}

async function callCloudAi(session, body) {
  if (!CFG.aiProxyUrl) throw codeError("AI_NOT_CONFIGURED", aiErrorMessage("AI_NOT_CONFIGURED"));
  let response;
  try {
    response = await fetch(`${CFG.aiProxyUrl}/deepseek`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.idToken}` },
      body: JSON.stringify(body),
    });
  } catch (_) {
    throw codeError("DEEPSEEK_REQUEST_FAILED", aiErrorMessage("DEEPSEEK_REQUEST_FAILED"));
  }
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }
  if (!response.ok) {
    const code = (json && json.code) || "DEEPSEEK_REQUEST_FAILED";
    throw codeError(code, aiErrorMessage(code));
  }
  const content = json && json.content;
  if (!content) throw codeError("EMPTY_RESPONSE", aiErrorMessage("EMPTY_RESPONSE"));
  const parsed = parseDraftPayload(content, body.request.capability);
  return { drafts: parsed.drafts, notes: parsed.notes, model: json.model || "" };
}

async function aiGenerate(payload) {
  const mode = payload.mode === "reply" ? "reply" : "greeting";
  const session = await ensureToken();
  const { empty, resumeState } = await readResumeState();
  if (empty || !resumeState) throw codeError("RESUME_EMPTY", aiErrorMessage("RESUME_EMPTY"));

  const versions = summarizeVersions(resumeState);
  const picked =
    versions.find((v) => v.id === payload.versionId) ||
    (payload.versionId ? null : versions[0]) ||
    versions[0];
  if (!picked) throw codeError("RESUME_EMPTY", aiErrorMessage("RESUME_EMPTY"));
  const versionObj = (resumeState.versions || []).find((v) => v.id === picked.id);
  const materials = resolveMaterialsForVersion(resumeState, versionObj);
  const resumeDigest = JH.buildVersionDigest ? JH.buildVersionDigest(versionObj, materials) : "";

  const jd = {
    position: cutS(payload.jd && payload.jd.position, 80),
    company: cutS(payload.jd && payload.jd.company, 40),
    jdText: cutS(payload.jd && payload.jd.jdText, 1500),
  };
  const hrMessage = cutS(payload.hrMessage, 800);
  const tone = payload.tone || "quant";

  const userInstruction =
    mode === "greeting"
      ? `${jd.jdText ? `目标 JD：${jd.jdText}` : `目标岗位：${jd.position}${jd.company ? `（${jd.company}）` : ""}`}。结合上面的简历摘要，生成 3 版向招聘方打招呼的开场语。`
      : `${hrMessage ? `HR 最新消息：${hrMessage}` : "（未提供 HR 消息文本）"}。结合简历摘要，生成 3 版得体回复（可先判断 HR 意图，再给出下一步）。`;

  const body = {
    request: { capability: mode, userInstruction },
    authorizedContext: { mode, jd, hrMessage, resumeDigest, tone },
  };
  const result = await callCloudAi(session, body);
  return {
    mode,
    versionId: picked.id,
    versionName: picked.name,
    drafts: result.drafts,
    notes: result.notes,
    model: result.model,
  };
}

// ─── 业务：新增投递 / 更新状态 ───

function buildNewApplication(input) {
  const now = new Date().toISOString();
  const status = STATUSES.includes(input.status) ? input.status : "已投递";
  const platform = PLATFORMS.includes(input.platform) ? input.platform : undefined;
  const tier = TIERS.includes(input.tier) ? input.tier : "主攻";
  return {
    id: `ext-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    company: (input.company || "").trim(),
    tier,
    platform,
    position: (input.position || "").trim() || "量化研究员（2026 届）",
    positionKind: input.positionKind || "其他",
    status,
    appliedAt: status === "已投递" ? todayStr() : undefined,
    deadline: input.deadline || undefined,
    url: (input.url || "").trim() || undefined,
    jdSummary: (input.jdSummary || "").trim().slice(0, 500) || undefined,
    createdAt: now,
    updatedAt: now,
    statusHistory: [{ status, at: now }],
  };
}

/** 状态时间线追加（与网页端 store 同规则：旧数据缺时间线 → 用 createdAt 初始化；同状态不重复记录） */
function appendStatusChange(application, status, at) {
  const history =
    application.statusHistory && application.statusHistory.length > 0
      ? application.statusHistory
      : [{ status: application.status, at: application.createdAt }];
  const last = history[history.length - 1];
  if (last.status === status) return application;
  return { ...application, statusHistory: [...history, { status, at }] };
}

async function upsertApplication(input) {
  const state = await readState();
  if (!state) throw cloudEmptyError();
  const applications = state.applications || [];
  const company = normalize(input.company);
  if (!company) throw new Error("公司不能为空");
  const url = normalize(input.url);
  const platform = PLATFORMS.includes(input.platform) ? input.platform : undefined;

  // 去重：同 URL，或 同名公司且平台判定为同一投递（平台都为空 或 平台一致）
  const duplicate = applications.find((app) => {
    if (url && app.url && normalize(app.url) === url) return true;
    if (normalize(app.company) !== company) return false;
    if (platform && app.platform && app.platform !== platform) return false; // 不同平台的同名公司允许分开记录
    if (!platform && app.platform) return false;
    return true;
  });

  if (duplicate) {
    return {
      duplicate: true,
      application: duplicate,
      message: `已存在「${duplicate.company}」的投递记录，未重复添加；如需推进状态请用下方「更新状态」。`,
    };
  }

  const created = buildNewApplication(input);
  const nextState = { ...state, applications: [created, ...applications] };
  await writeState(nextState);
  return { duplicate: false, application: created, message: `已写入作战台：${created.company}（${created.status}）` };
}

async function setStatus(payload) {
  const { id, status } = payload || {};
  if (!id) throw new Error("缺少投递记录 id");
  if (!STATUSES.includes(status)) throw new Error("无效的状态：" + status);
  const state = await readState();
  if (!state) throw cloudEmptyError();
  const applications = state.applications || [];
  const index = applications.findIndex((app) => app.id === id);
  if (index < 0) throw new Error("云端没有找到该投递记录（可能已在网页端删除），请刷新列表后重试");
  const prev = applications[index];
  if (prev.status === status) {
    return { unchanged: true, application: prev, message: `${prev.company} 已经是「${status}」，无需更新` };
  }
  const now = new Date().toISOString();
  let merged = { ...prev, status, updatedAt: now };
  if (status === "已投递" && !merged.appliedAt) merged.appliedAt = todayStr();
  merged = appendStatusChange(merged, status, now);
  const nextApplications = applications.slice();
  nextApplications[index] = merged;
  await writeState({ ...state, applications: nextApplications });
  return { unchanged: false, application: merged, message: `已更新：${merged.company} → ${status}` };
}

async function listCandidates(filter) {
  const state = await readState();
  if (!state) {
    return { emptyCloud: true, candidates: [] };
  }
  const applications = state.applications || [];
  const companyFilter = normalize(filter && filter.company);
  const platformFilter = filter && filter.platform;
  const urlFilter = normalize(filter && filter.url);
  const matched = applications.filter((app) => {
    if (urlFilter && app.url && normalize(app.url) === urlFilter) return true;
    if (companyFilter) return normalize(app.company).includes(companyFilter) || companyFilter.includes(normalize(app.company));
    if (platformFilter) return app.platform === platformFilter;
    return true;
  });
  const candidates = matched
    .map((app) => ({
      id: app.id,
      company: app.company,
      position: app.position,
      status: app.status,
      platform: app.platform || "",
      url: app.url || "",
      updatedAt: app.updatedAt,
    }))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return { emptyCloud: false, candidates };
}

// ─── 消息路由（popup → background）───

const handlers = {
  signIn: (payload) => signIn(payload.email, payload.password),
  signOut: () => signOut(),
  getSession: async () => {
    const session = await getSession();
    if (!session) return { loggedIn: false };
    try {
      const fresh = await ensureToken();
      return { loggedIn: true, email: fresh.email, uid: fresh.uid };
    } catch (_) {
      return { loggedIn: false };
    }
  },
  upsertApplication: (payload) => upsertApplication(payload || {}),
  setStatus: (payload) => setStatus(payload || {}),
  listCandidates: (payload) => listCandidates(payload || {}),
  listResumeVersions: async () => {
    const { empty, resumeState } = await readResumeState();
    return { empty, versions: summarizeVersions(resumeState) };
  },
  suggestResumeVersion: async (payload) => {
    const { empty, resumeState } = await readResumeState();
    const versions = summarizeVersions(resumeState);
    const hint = (payload && payload.hint) || "";
    const suggestion = JH.suggestVersion ? JH.suggestVersion(hint, versions) : { versionId: undefined, reason: "" };
    return { empty, versions, versionId: suggestion.versionId, reason: suggestion.reason };
  },
  aiGenerate: (payload) => aiGenerate(payload || {}),
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (!message || !message.type) throw new Error("未知消息");
      const handler = handlers[message.type];
      if (!handler) throw new Error("不支持的操作：" + message.type);
      const result = await handler(message.payload || {});
      sendResponse({ ok: true, ...result });
    } catch (err) {
      sendResponse({ ok: false, code: err && err.code, error: String(err && err.message ? err.message : err) });
    }
  })();
  return true; // 保持消息通道，等待异步 sendResponse
});

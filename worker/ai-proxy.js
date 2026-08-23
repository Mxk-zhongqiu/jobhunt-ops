// 求职作战台 · DeepSeek AI 代理（Cloudflare Worker，免费计划 10 万次/天）
// 替代方案：Firebase Cloud Functions 需要 Blaze 付费计划，本 Worker 免费即可托管 AI。
//
// 安全模型（scripts/verify-ai.mjs 会逐项检查，勿破坏）：
//  - 密钥 DEEPSEEK_API_KEY 只存在于 Worker 环境变量（控制台 → 设置 → 变量，或 wrangler secret put），
//    浏览器永远接触不到；
//  - 只有登录用户能调用（校验 Firebase ID Token，防止他人刷你的 DeepSeek 额度）：
//    客户端把当前用户的 ID Token 放在 Authorization: Bearer，Worker 用
//    identitytoolkit.googleapis.com 的 accounts:lookup 校验（无需 Admin SDK）；
//  - 只接收显式勾选的最小上下文（客户端已裁剪），并限制上下文/输出规模、超时与有限重试；
//  - 结构化草稿启用 JSON Output + 中文 JSON 指令；不记录上下文正文。

const maxTokens = 4000;
const timeoutMs = 45000;
const maxContextCharacters = 24000;

function json(responseInit, status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function schemaInstruction(capability) {
  const shared = "只输出一个合法 json 对象，不要使用 Markdown。所有建议都是待用户确认的草稿。";
  if (capability === "review") {
    return `${shared} 格式：{"kind":"review","company":"...","round":"笔试|一面|二面|终面|HR 面","summary":"复盘总结","strengths":["..."],"weaknesses":["..."],"nextActions":["..."]}`;
  }
  if (capability === "resume") {
    return `${shared} 格式：{"kind":"resume","original":"原文","translated":"量化岗语言改写","keywords":["时序建模","状态估计","组合优化"...]}`;
  }
  if (capability === "knowledge") {
    return `${shared} 格式：{"kind":"knowledge","topicName":"目标主题名","points":[{"title":"知识点名","summary":"核心要点，≤2 句（含公式/结论/面试答法）","depth":"基础或进阶，可不填"}]}；生成 6–12 个知识点，覆盖该主题核心考点，结合授权上下文中的已有知识点避免重复；summary 务必精简，控制总输出长度。`;
  }
  return `${shared} 格式：{"kind":"answer","content":"..."}`;
}

function safeErrorCode(status) {
  if (status === 401) return "AUTHENTICATION_FAILED";
  if (status === 402) return "INSUFFICIENT_BALANCE";
  if (status === 429) return "RATE_LIMITED";
  if (status === 400 || status === 422) return "INVALID_REQUEST";
  if (status >= 500) return "PROVIDER_UNAVAILABLE";
  return "PROVIDER_ERROR";
}

// 校验 Firebase ID Token：调用 accounts:lookup，token 无效/过期即失败
async function verifyIdToken(idToken, env) {
  if (!idToken) return null;
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      },
    );
    if (!response.ok) return null;
    const data = await response.json();
    const user = Array.isArray(data.users) ? data.users[0] : undefined;
    return user ? { uid: user.localId ?? "unknown", email: user.email ?? "" } : null;
  } catch {
    return null;
  }
}

// 邮箱白名单：env.AI_ALLOWED_EMAILS（逗号分隔）。配置后仅列表内账号可用 AI，
// 防止公网任意注册用户消耗 DeepSeek 额度；未配置则允许所有登录用户（默认）。
function isAllowedUser(user, env) {
  const raw = (env.AI_ALLOWED_EMAILS || "").trim();
  if (!raw) return true;
  const allowed = raw.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  return allowed.includes((user.email || "").toLowerCase());
}

async function callDeepSeek(payload, env) {
  const contextText = JSON.stringify(payload.authorizedContext ?? {});
  if (contextText.length > maxContextCharacters) return { code: "CONTEXT_TOO_LARGE" };
  const requestBody = {
    model: env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    messages: [
      {
        role: "system",
        content: `你是“求职作战台”的求职辅助助手，服务于 2026 届量化秋招。只能依据用户本次授权的上下文回答；不得声称已修改系统；不提供投资或法律决策；面试复盘只做结构化总结，不做主观评价定性。${schemaInstruction(payload.request?.capability)}`,
      },
      {
        role: "user",
        content: `任务类型：${payload.request?.capability}\n用户要求：${payload.request?.userInstruction || "请基于授权信息生成最小草稿"}\n本次授权上下文 JSON：${contextText}`,
      },
    ],
    response_format: { type: "json_object" },
    thinking: { type: "disabled" },
    max_tokens: maxTokens,
    temperature: 0.2,
    stream: false,
    user_id: payload.uid || "jobhunt-ops",
  };

  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      if (!response.ok) {
        const code = safeErrorCode(response.status);
        if (![429, 500, 503].includes(response.status) || attempt === 1) return { code };
        lastError = { code };
      } else {
        return await response.json();
      }
    } catch (error) {
      if (error.name === "AbortError") return { code: "TIMEOUT" };
      lastError = error;
      if (attempt === 1) return { code: "PROVIDER_ERROR" };
    } finally {
      clearTimeout(timeout);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 450));
  }
  return lastError || { code: "PROVIDER_ERROR" };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 浏览器跨域预检
    // ⚠️ 204 响应不允许带 body：旧版预检实现会被 Worker 运行时抛错（500），
    //    导致浏览器 POST /deepseek 的 OPTIONS 预检失败 → fetch 报 DEEPSEEK_REQUEST_FAILED。
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // 状态检查（无需登录，只暴露"是否已配置"这类无害信息）
    if (request.method === "GET" && url.pathname === "/status") {
      return json(null, 200, {
        configured: Boolean(env.DEEPSEEK_API_KEY),
        providerId: "deepseek",
        model: env.DEEPSEEK_MODEL || "deepseek-v4-flash",
        maxTokens,
        timeoutMs,
      });
    }

    // 生成草稿（必须登录）
    if (request.method === "POST" && url.pathname === "/deepseek") {
      const authorization = request.headers.get("Authorization") || "";
      const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      const user = await verifyIdToken(idToken, env);
      if (!user) return json(null, 401, { code: "AUTH_REQUIRED", message: "请先登录后再使用真实 DeepSeek。" });
      if (!isAllowedUser(user, env)) return json(null, 403, { code: "FORBIDDEN", message: "该账号未获授权使用 AI。" });
      if (!env.DEEPSEEK_API_KEY) return json(null, 503, { code: "AI_NOT_CONFIGURED", message: "DeepSeek API key is not configured on the cloud worker." });

      let payload;
      try {
        payload = await request.json();
      } catch {
        return json(null, 400, { code: "INVALID_REQUEST" });
      }
      if (!payload.request || !payload.authorizedContext) return json(null, 400, { code: "INVALID_REQUEST" });

      const startedAt = Date.now();
      const result = await callDeepSeek({ ...payload, uid: user.uid }, env);
      if (result.code) return json(null, 502, { code: result.code });
      const choice = result.choices?.[0];
      const content = choice?.message?.content;
      if (!content) return json(null, 502, { code: "EMPTY_RESPONSE" });
      // 输出达到 max_tokens 上限被截断：JSON 必然不完整，直接报明确错误
      if (choice?.finish_reason === "length") return json(null, 502, { code: "OUTPUT_TRUNCATED" });
      return json(null, 200, {
        requestId: `deepseek-cloud-${startedAt}`,
        content,
        model: result.model || env.DEEPSEEK_MODEL || "deepseek-v4-flash",
        durationMs: Date.now() - startedAt,
        usage: result.usage
          ? {
              promptTokens: result.usage.prompt_tokens,
              completionTokens: result.usage.completion_tokens,
              totalTokens: result.usage.total_tokens,
            }
          : undefined,
      });
    }

    return json(null, 404, { code: "NOT_FOUND" });
  },
};

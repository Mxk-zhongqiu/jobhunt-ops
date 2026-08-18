/* global AbortController, URL, clearTimeout, fetch, process, setTimeout */
// 求职作战台 · DeepSeek 云函数（第二阶段，移植自 server/deepseek-proxy.mjs）
//
// 安全模型（与本地代理一致，勿破坏——scripts/verify-ai.mjs 会逐项检查）：
//  - 密钥 DEEPSEEK_API_KEY 只存在于 Firebase Functions 环境变量
//    （部署：firebase functions:secrets:set DEEPSEEK_API_KEY），浏览器永远接触不到；
//  - 只有登录用户能调用（request.auth 校验），防止他人滥用你的 DeepSeek 额度；
//  - 只接收显式勾选的最小上下文（客户端已裁剪），并限制上下文/输出规模、超时与有限重试；
//  - 结构化草稿启用 JSON Output + 中文 JSON 指令；不记录上下文正文。

const { onCall, HttpsError } = require("firebase-functions/v2/https");

const apiKey = process.env.DEEPSEEK_API_KEY || "";
const apiBase = process.env.DEEPSEEK_API_BASE || "https://api.deepseek.com";
const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const maxTokens = Math.min(Math.max(Number(process.env.DEEPSEEK_MAX_TOKENS || 1500), 200), 4000);
const timeoutMs = Math.min(Math.max(Number(process.env.DEEPSEEK_TIMEOUT_MS || 45000), 5000), 120000);
const maxContextCharacters = 24_000;

function schemaInstruction(capability) {
  const shared = "只输出一个合法 json 对象，不要使用 Markdown。所有建议都是待用户确认的草稿。";
  if (capability === "review") {
    return `${shared} 格式：{"kind":"review","company":"...","round":"笔试|一面|二面|终面|HR 面","summary":"复盘总结","strengths":["..."],"weaknesses":["..."],"nextActions":["..."]}`;
  }
  if (capability === "resume") {
    return `${shared} 格式：{"kind":"resume","original":"原文","translated":"量化岗语言改写","keywords":["时序建模","状态估计","组合优化"...]}`;
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

async function callDeepSeek(payload) {
  const contextText = JSON.stringify(payload.authorizedContext ?? {});
  if (contextText.length > maxContextCharacters) throw new HttpsError("invalid-argument", "CONTEXT_TOO_LARGE");
  const requestBody = {
    model,
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
    user_id: payload.uid,
  };

  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(new URL("/chat/completions", apiBase), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      if (!response.ok) {
        const code = safeErrorCode(response.status);
        if (![429, 500, 503].includes(response.status) || attempt === 1) {
          throw new HttpsError(response.status === 401 ? "unauthenticated" : "internal", code);
        }
        lastError = new HttpsError("internal", code);
      } else {
        return await response.json();
      }
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      if (error.name === "AbortError") throw new HttpsError("deadline-exceeded", "TIMEOUT");
      lastError = error;
      if (attempt === 1) throw new HttpsError("internal", "PROVIDER_ERROR");
    } finally {
      clearTimeout(timeout);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 450));
  }
  throw lastError || new HttpsError("internal", "PROVIDER_ERROR");
}

// 生产 AI 入口：生成草稿（登录用户可用；密钥在云端）
exports.deepseekProxy = onCall({ region: "asia-east1", timeoutSeconds: 60, secrets: ["DEEPSEEK_API_KEY"] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "AUTH_REQUIRED");
  const { request: aiRequest, authorizedContext } = request.data ?? {};
  if (!aiRequest || !authorizedContext) throw new HttpsError("invalid-argument", "INVALID_REQUEST");
  if (!apiKey) throw new HttpsError("unavailable", "AI_NOT_CONFIGURED");

  const startedAt = Date.now();
  const result = await callDeepSeek({ request: aiRequest, authorizedContext, uid: request.auth.uid });
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new HttpsError("internal", "EMPTY_RESPONSE");
  return {
    content,
    model: result.model || model,
    durationMs: Date.now() - startedAt,
    usage: result.usage
      ? {
          promptTokens: result.usage.prompt_tokens,
          completionTokens: result.usage.completion_tokens,
          totalTokens: result.usage.total_tokens,
        }
      : undefined,
  };
});

// 生产 AI 状态检查：密钥是否已配置（登录用户可用）
exports.deepseekStatus = onCall({ region: "asia-east1", secrets: ["DEEPSEEK_API_KEY"] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "AUTH_REQUIRED");
  return { configured: Boolean(apiKey), providerId: "deepseek", model, maxTokens, timeoutMs };
});

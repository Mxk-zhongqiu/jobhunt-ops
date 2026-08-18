/* global AbortController, Buffer, URL, clearTimeout, console, fetch, process, setTimeout */
// 求职作战台 · DeepSeek 本地安全代理
// 复用自 F:\MyWorld\server\deepseek-proxy.mjs，能力按求职场景重新定义。
// 密钥只存在于本机服务环境；浏览器只向本代理发送本次勾选的最小上下文。

import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadLocalEnv() {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const clean = line.trim();
    if (!clean || clean.startsWith("#")) continue;
    const separator = clean.indexOf("=");
    if (separator < 1) continue;
    const key = clean.slice(0, separator).trim();
    const value = clean.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadLocalEnv();

const port = Number(process.env.AI_PROXY_PORT || 8787);
const apiKey = process.env.DEEPSEEK_API_KEY || "";
const apiBase = process.env.DEEPSEEK_API_BASE || "https://api.deepseek.com";
const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const maxTokens = Math.min(Math.max(Number(process.env.DEEPSEEK_MAX_TOKENS || 1500), 200), 4000);
const timeoutMs = Math.min(Math.max(Number(process.env.DEEPSEEK_TIMEOUT_MS || 45000), 5000), 120000);
const maxBodyBytes = 80_000;
const maxContextCharacters = 24_000;
const callLogs = [];

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

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

function pushLog(log) {
  callLogs.unshift(log);
  if (callLogs.length > 50) callLogs.length = 50;
}

async function callDeepSeek(payload) {
  const contextText = JSON.stringify(payload.authorizedContext ?? {});
  if (contextText.length > maxContextCharacters) {
    const error = new Error("CONTEXT_TOO_LARGE");
    error.status = 413;
    throw error;
  }
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
    user_id: "jobhunt-ops-local",
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
        const error = new Error(safeErrorCode(response.status));
        error.status = response.status;
        if (![429, 500, 503].includes(response.status) || attempt === 1) throw error;
        lastError = error;
      } else {
        return await response.json();
      }
    } catch (error) {
      lastError = error;
      if (attempt === 1 || (error.status && ![429, 500, 503].includes(error.status))) throw error;
    } finally {
      clearTimeout(timeout);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 450));
  }
  throw lastError;
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/api/ai/status") {
    return sendJson(response, 200, { configured: Boolean(apiKey), providerId: "deepseek", model, maxTokens, timeoutMs });
  }
  if (request.method === "GET" && request.url === "/api/ai/logs") {
    return sendJson(response, 200, { logs: callLogs });
  }
  if (request.method !== "POST" || request.url !== "/api/ai/deepseek") {
    return sendJson(response, 404, { code: "NOT_FOUND" });
  }
  if (!apiKey) return sendJson(response, 503, { code: "AI_NOT_CONFIGURED", message: "DeepSeek API key is not configured on the local server." });

  const startedAt = Date.now();
  const requestId = `deepseek-local-${startedAt}`;
  let capability = "unknown";
  try {
    const payload = await readJson(request);
    capability = payload.request?.capability ?? "unknown";
    if (!payload.request || !payload.authorizedContext) return sendJson(response, 400, { code: "INVALID_REQUEST" });
    const result = await callDeepSeek(payload);
    const content = result.choices?.[0]?.message?.content;
    if (!content) throw new Error("EMPTY_RESPONSE");
    const log = {
      requestId, createdAt: new Date().toISOString(), providerId: "deepseek", model: result.model || model,
      capability, status: "success", durationMs: Date.now() - startedAt,
      usage: result.usage ? { promptTokens: result.usage.prompt_tokens, completionTokens: result.usage.completion_tokens, totalTokens: result.usage.total_tokens } : undefined,
    };
    pushLog(log);
    return sendJson(response, 200, { requestId, content, model: result.model || model, usage: log.usage, durationMs: log.durationMs });
  } catch (error) {
    const code = error.name === "AbortError" ? "TIMEOUT" : error.message || "PROVIDER_ERROR";
    const status = error.status === 413 ? 413 : 502;
    pushLog({ requestId, createdAt: new Date().toISOString(), providerId: "deepseek", model, capability, status: "error", code, durationMs: Date.now() - startedAt });
    return sendJson(response, status, { code, message: "DeepSeek request failed. No formal data was changed." });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[AI proxy] http://127.0.0.1:${port} · DeepSeek ${apiKey ? "configured" : "not configured"} · ${model}`);
});

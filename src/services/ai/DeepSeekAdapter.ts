// DeepSeekAdapter：开发环境优先调用本机安全代理（127.0.0.1:8787），
// 本地代理未配置密钥或未启动时自动回退 Cloudflare Worker 代理（生产环境始终走 Worker）。
// 两种路径下浏览器都不接触 API 密钥（本地密钥在服务端进程，云端密钥在 Worker 环境变量）。
// 只把用户显式勾选的最小上下文发送出去；响应经过本地类型校验后才成为草稿。

import type { AppState } from "../../types/domain";
import type { AIProposal, AIProposalPayload, AIProviderStatus, AIRequest, AIService } from "../../types/ai";
import { auth, firebaseEnabled } from "../firebase";
import { buildAIContextSummary } from "./context";

type ProxyResult = { content?: string; model?: string; requestId?: string; usage?: AIProposal["usage"]; durationMs?: number };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 12) : [];
}

function parsePayload(content: string, request: AIRequest): AIProposalPayload {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    // 模型输出不是合法 JSON（如被截断）→ 统一映射为可读错误，不把底层 SyntaxError 透出
    throw new Error("INVALID_PROVIDER_RESPONSE");
  }
  if (!isObject(value) || typeof value.kind !== "string") throw new Error("INVALID_PROVIDER_RESPONSE");
  const expected: Record<AIRequest["capability"], AIProposalPayload["kind"]> = {
    ask: "answer",
    review: "review",
    resume: "resume",
    knowledge: "knowledge",
  };
  if (value.kind !== expected[request.capability]) throw new Error("UNEXPECTED_DRAFT_TYPE");

  if (value.kind === "answer" && typeof value.content === "string") {
    return { kind: "answer", content: value.content.slice(0, 8000) };
  }
  if (
    value.kind === "review" &&
    typeof value.company === "string" &&
    typeof value.round === "string" &&
    typeof value.summary === "string"
  ) {
    return {
      kind: "review",
      company: value.company.slice(0, 80),
      round: value.round.slice(0, 20),
      summary: value.summary.slice(0, 2000),
      strengths: strings(value.strengths),
      weaknesses: strings(value.weaknesses),
      nextActions: strings(value.nextActions),
    };
  }
  if (value.kind === "resume" && typeof value.original === "string" && typeof value.translated === "string") {
    return {
      kind: "resume",
      original: value.original.slice(0, 2000),
      translated: value.translated.slice(0, 4000),
      keywords: strings(value.keywords),
    };
  }
  if (value.kind === "knowledge" && Array.isArray(value.points)) {
    const points = value.points
      .filter((item): item is Record<string, unknown> => isObject(item) && typeof item.title === "string" && typeof item.summary === "string")
      .map((item) => ({
        title: (item.title as string).slice(0, 60),
        summary: (item.summary as string).slice(0, 600),
        depth: item.depth === "基础" || item.depth === "进阶" ? (item.depth as "基础" | "进阶") : undefined,
      }))
      .slice(0, 15);
    if (!points.length) throw new Error("INVALID_PROVIDER_RESPONSE");
    return {
      kind: "knowledge",
      topicName: typeof value.topicName === "string" ? value.topicName.slice(0, 80) : "",
      points,
    };
  }
  throw new Error("INVALID_PROVIDER_RESPONSE");
}

/** 只裁剪显式勾选的对象，且只带最小字段 */
function authorizedContext(request: AIRequest, state: AppState) {
  const selected = request.context;
  return {
    interviews: state.interviews
      .filter((item) => selected.interviewIds.includes(item.id))
      .map((item) => ({ company: item.company, round: item.round, date: item.date, questions: item.questions, review: item.review })),
    applications: state.applications
      .filter((item) => selected.applicationIds.includes(item.id))
      .map((item) => ({ company: item.company, tier: item.tier, position: item.position, status: item.status, deadline: item.deadline })),
    topics: state.knowledge
      .filter((item) => selected.topicIds.includes(item.id))
      .map((item) => ({
        name: item.name,
        priority: item.priority,
        status: item.status,
        // 预防上下文超限：每主题最多 12 个知识点、每条要点截断到 120 字（代理上限 24000 字符）
        points: (item.points ?? []).slice(0, 12).map((point) => ({
          title: point.title,
          summary: point.summary.slice(0, 120),
          mastered: point.mastered,
        })),
      })),
    projects: state.projects
      .filter((item) => selected.projectIds.includes(item.id))
      .map((item) => ({ name: item.name, status: item.status, milestones: item.milestones.map((m) => m.title) })),
  };
}

/** 本地代理是否可用（运行中且已配置密钥） */
async function isLocalProxyUsable(): Promise<boolean> {
  try {
    const response = await fetch("/api/ai/status", { headers: { Accept: "application/json" } });
    if (!response.ok) return false;
    const status = (await response.json()) as { configured?: boolean };
    return status.configured === true;
  } catch {
    return false;
  }
}

/** 调用本地安全代理（127.0.0.1:8787，经 vite /api 转发） */
async function callLocalProxy(body: unknown): Promise<ProxyResult> {
  const response = await fetch("/api/ai/deepseek", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await response.json()) as ProxyResult & { code?: string };
  if (!response.ok || !parsed.content) throw new Error(parsed.code ?? "DEEPSEEK_REQUEST_FAILED");
  return parsed;
}

/** 调用 Cloudflare Worker 代理（密钥在 Worker 环境变量）；需登录（携带 Firebase ID Token） */
async function callCloudProxy(body: unknown): Promise<ProxyResult> {
  const base = import.meta.env.VITE_AI_PROXY_URL as string | undefined;
  if (!firebaseEnabled || !base) throw new Error("AI_NOT_CONFIGURED_CLOUD");
  if (!auth?.currentUser) throw new Error("AUTH_REQUIRED");
  const idToken = await auth.currentUser.getIdToken();
  let response: Response;
  try {
    response = await fetch(`${base}/deepseek`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("DEEPSEEK_REQUEST_FAILED");
  }
  const parsed = (await response.json().catch(() => null)) as (ProxyResult & { code?: string }) | null;
  if (!response.ok || !parsed?.content) throw new Error(parsed?.code ?? "DEEPSEEK_REQUEST_FAILED");
  return parsed;
}

export class DeepSeekAdapter implements AIService {
  constructor(private readonly state: AppState) {}

  async generate(request: AIRequest): Promise<AIProposal> {
    const body = { request, authorizedContext: authorizedContext(request, this.state) };
    let result: ProxyResult;

    if (import.meta.env.DEV) {
      // 本地开发：本地代理可用（已配置密钥）走本地；否则自动回退云端 Worker
      if (await isLocalProxyUsable()) {
        result = await callLocalProxy(body);
      } else {
        result = await callCloudProxy(body);
      }
    } else {
      // 生产：始终走 Cloudflare Worker
      result = await callCloudProxy(body);
    }

    // 两种路径统一兜底：没有正文一律按失败处理
    if (!result.content) throw new Error("DEEPSEEK_REQUEST_FAILED");

    return {
      id: `ai-proposal-${Date.now()}`,
      providerId: "deepseek",
      modelId: result.model ?? "deepseek-v4-flash",
      generatedAt: new Date().toISOString(),
      contextSummary: buildAIContextSummary(request.context, this.state),
      confidence: 0.78,
      requestId: result.requestId,
      usage: result.usage,
      durationMs: result.durationMs,
      payload: parsePayload(result.content, request),
      status: "draft",
    };
  }
}

export async function getDeepSeekStatus(): Promise<AIProviderStatus> {
  if (import.meta.env.DEV) {
    let local: AIProviderStatus | null = null;
    try {
      const response = await fetch("/api/ai/status", { headers: { Accept: "application/json" } });
      if (response.ok) local = (await response.json()) as AIProviderStatus;
    } catch {
      // 本地代理未启动
    }
    if (local?.configured) return { ...local, source: "local" };
    // 本地未配置/未启动 → 云端 Worker 可用（需 .env 配置 + Firebase 公网配置）即视为已配置
    const base = import.meta.env.VITE_AI_PROXY_URL as string | undefined;
    if (firebaseEnabled && base) {
      return {
        configured: true,
        providerId: "deepseek",
        model: local?.model ?? "deepseek-v4-flash",
        maxTokens: local?.maxTokens ?? 1500,
        timeoutMs: local?.timeoutMs ?? 45000,
        source: "cloud",
      };
    }
    if (local) return local;
    throw new Error("AI_PROXY_UNAVAILABLE");
  }
  const base = import.meta.env.VITE_AI_PROXY_URL as string | undefined;
  if (!firebaseEnabled || !base) throw new Error("AI_NOT_CONFIGURED_CLOUD");
  const response = await fetch(`${base}/status`).catch(() => null);
  if (!response || !response.ok) throw new Error("AI_PROXY_UNAVAILABLE");
  return { ...((await response.json()) as AIProviderStatus), source: "cloud" };
}

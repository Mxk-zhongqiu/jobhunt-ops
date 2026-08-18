// DeepSeekAdapter：开发环境只调用本机安全代理（127.0.0.1:8787），生产环境调用 Cloudflare Worker 代理。
// 两种路径下浏览器都不接触 API 密钥（本地密钥在服务端进程，云端密钥在 Worker 环境变量）。
// 只把用户显式勾选的最小上下文发送出去；响应经过本地类型校验后才成为草稿。

import type { AppState } from "../../types/domain";
import type { AIProposal, AIProposalPayload, AIProviderStatus, AIRequest, AIService } from "../../types/ai";
import { auth, firebaseEnabled } from "../firebase";
import { buildAIContextSummary } from "./context";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 12) : [];
}

function parsePayload(content: string, request: AIRequest): AIProposalPayload {
  const value: unknown = JSON.parse(content);
  if (!isObject(value) || typeof value.kind !== "string") throw new Error("INVALID_PROVIDER_RESPONSE");
  const expected: Record<AIRequest["capability"], AIProposalPayload["kind"]> = {
    ask: "answer",
    review: "review",
    resume: "resume",
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
      .map((item) => ({ name: item.name, priority: item.priority, status: item.status })),
    projects: state.projects
      .filter((item) => selected.projectIds.includes(item.id))
      .map((item) => ({ name: item.name, status: item.status, milestones: item.milestones.map((m) => m.title) })),
  };
}

export class DeepSeekAdapter implements AIService {
  constructor(private readonly state: AppState) {}

  async generate(request: AIRequest): Promise<AIProposal> {
    const body = { request, authorizedContext: authorizedContext(request, this.state) };
    let result: { content?: string; model?: string; requestId?: string; usage?: AIProposal["usage"]; durationMs?: number };

    if (import.meta.env.DEV) {
      // 本地开发：走本机安全代理（npm run dev:full）
      const response = await fetch("/api/ai/deepseek", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const parsed = (await response.json()) as {
        code?: string;
        content?: string;
        model?: string;
        requestId?: string;
        usage?: AIProposal["usage"];
        durationMs?: number;
      };
      if (!response.ok || !parsed.content) throw new Error(parsed.code ?? "DEEPSEEK_REQUEST_FAILED");
      result = parsed;
    } else {
      // 生产：走 Cloudflare Worker 代理（密钥在 Worker 环境变量）；需登录（携带 Firebase ID Token）
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
      const parsed = (await response.json().catch(() => null)) as {
        code?: string;
        content?: string;
        model?: string;
        requestId?: string;
        usage?: AIProposal["usage"];
        durationMs?: number;
      } | null;
      if (!response.ok || !parsed?.content) throw new Error(parsed?.code ?? "DEEPSEEK_REQUEST_FAILED");
      result = parsed;
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
    const response = await fetch("/api/ai/status", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("AI_PROXY_UNAVAILABLE");
    return (await response.json()) as AIProviderStatus;
  }
  const base = import.meta.env.VITE_AI_PROXY_URL as string | undefined;
  if (!firebaseEnabled || !base) throw new Error("AI_NOT_CONFIGURED_CLOUD");
  const response = await fetch(`${base}/status`).catch(() => null);
  if (!response || !response.ok) throw new Error("AI_PROXY_UNAVAILABLE");
  return (await response.json()) as AIProviderStatus;
}

// 统一 AI 服务类型：业务层只认识"能力 + 草稿"，不认识具体提供商。
// 复用自旧项目（F:\MyWorld）的 AIService 模式，能力按求职场景重新定义。

export type AICapability =
  | "ask"       // 知识问答：基于授权上下文回答，不写入
  | "review"    // 面试复盘草稿：生成可确认写入面试记录的复盘
  | "resume";   // 简历要点翻译：把经历翻译成量化岗语言（不写入，可复制）

export interface AIContextSelection {
  interviewIds: string[];
  applicationIds: string[];
  topicIds: string[];
  projectIds: string[];
}

export interface AIRequest {
  capability: AICapability;
  context: AIContextSelection;
  userInstruction: string;
}

export type AIProposalPayload =
  | { kind: "answer"; content: string }
  | {
      kind: "review";
      company: string;
      round: string;
      summary: string;
      strengths: string[];
      weaknesses: string[];
      nextActions: string[];
    }
  | { kind: "resume"; original: string; translated: string; keywords: string[] };

export interface AIProposal {
  id: string;
  providerId: string;
  modelId: string;
  generatedAt: string;
  contextSummary: string[];
  confidence?: number;
  requestId?: string;
  durationMs?: number;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  payload: AIProposalPayload;
  status: "draft" | "accepted" | "rejected";
}

export type AIProviderId = "mock" | "deepseek";

export interface AIProviderStatus {
  configured: boolean;
  providerId: AIProviderId;
  model: string;
  maxTokens: number;
  timeoutMs: number;
}

export interface AIService {
  generate(request: AIRequest): Promise<AIProposal>;
}

// MockAdapter：本地规则，不访问网络。保证 AI 关闭或未配置密钥时全部能力可用。

import type { AppState } from "../../types/domain";
import type { AIProposal, AIRequest, AIService, KnowledgeDraftPoint } from "../../types/ai";
import { buildAIContextSummary } from "./context";

export class MockAdapter implements AIService {
  constructor(private readonly state: AppState) {}

  async generate(request: AIRequest): Promise<AIProposal> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const payload = this.buildPayload(request);
    return {
      id: `ai-proposal-${Date.now()}`,
      providerId: "mock",
      modelId: "local-rules-v1",
      generatedAt: new Date().toISOString(),
      contextSummary: buildAIContextSummary(request.context, this.state),
      confidence: 0.5,
      payload,
      status: "draft",
    };
  }

  private buildPayload(request: AIRequest) {
    const selectedInterview = this.state.interviews.find((item) => request.context.interviewIds.includes(item.id));
    const selectedTopics = this.state.knowledge.filter((item) => request.context.topicIds.includes(item.id));

    if (request.capability === "review") {
      return {
        kind: "review" as const,
        company: selectedInterview?.company ?? "（请补充公司）",
        round: selectedInterview?.round ?? "一面",
        summary: selectedInterview ? `已记录 ${selectedInterview.questions.split(/\n/).filter(Boolean).length} 个问题，复盘结论待补充。` : "复盘对象未选择，草稿为空。",
        strengths: ["对控制背景（状态估计/优化）的表达是加分点"],
        weaknesses: ["未答问题需要在本周内整理成题库"],
        nextActions: ["把未答问题加入高频面试题文档", "针对薄弱点安排一次针对性练习"],
      };
    }

    if (request.capability === "resume") {
      return {
        kind: "resume" as const,
        original: request.userInstruction,
        translated: "量化岗语言版本：将控制/信号/优化背景翻译为「时序建模 / 状态估计 / 组合优化」；示例改写待真实提供商生成。",
        keywords: ["时序建模", "状态估计", "组合优化"],
      };
    }

    if (request.capability === "knowledge") {
      const selectedTopic = this.state.knowledge.find((item) => request.context.topicIds.includes(item.id));
      const points: KnowledgeDraftPoint[] = [
        { title: "核心概念与定义", summary: "（Mock 示例）本主题最常考的定义、公式与适用前提。配置 DEEPSEEK_API_KEY 后将生成真实内容。", depth: "基础" },
        { title: "关键结论与易错点", summary: "（Mock 示例）面试高频结论与常见陷阱，如边界条件、假设失效场景。", depth: "基础" },
        { title: "面试延伸与加分项", summary: "（Mock 示例）进阶考点与可结合项目讲述的延伸问题。", depth: "进阶" },
      ];
      return {
        kind: "knowledge" as const,
        topicName: selectedTopic?.name ?? "（请选择主题）",
        points,
      };
    }

    const topicText = selectedTopics.length
      ? `，重点结合你选择的主题：${selectedTopics.map((item) => {
          const points = item.points ?? [];
          return points.length ? `${item.name}（知识点 ${points.filter((p) => p.mastered).length}/${points.length} 已掌握）` : item.name;
        }).join("、")}`
      : "";
    return {
      kind: "answer" as const,
      content: `（Mock 本地规则）基于你授权的 ${request.context.interviewIds.length + request.context.topicIds.length + request.context.applicationIds.length} 项上下文${topicText}。配置 DEEPSEEK_API_KEY 并切换提供商后，将返回真实回答。要求：${request.userInstruction || "（无额外要求）"}`,
    };
  }
}

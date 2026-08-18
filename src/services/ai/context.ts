// 生成"本次将读取什么"的授权摘要，展示给用户确认

import type { AppState } from "../../types/domain";
import type { AIContextSelection } from "../../types/ai";

export function buildAIContextSummary(context: AIContextSelection, state: AppState): string[] {
  const lines: string[] = [];
  const interviews = state.interviews.filter((item) => context.interviewIds.includes(item.id));
  const applications = state.applications.filter((item) => context.applicationIds.includes(item.id));
  const topics = state.knowledge.filter((item) => context.topicIds.includes(item.id));
  const projects = state.projects.filter((item) => context.projectIds.includes(item.id));

  if (interviews.length) lines.push(`面试记录 ${interviews.length} 条（${interviews.map((item) => `${item.company}·${item.round}`).join("、")}）`);
  if (applications.length) lines.push(`投递 ${applications.length} 家（${applications.slice(0, 8).map((item) => item.company).join("、")}${applications.length > 8 ? "…" : ""}）`);
  if (topics.length) lines.push(`知识主题 ${topics.length} 个（${topics.slice(0, 6).map((item) => item.name).join("、")}${topics.length > 6 ? "…" : ""}）`);
  if (projects.length) lines.push(`项目 ${projects.length} 个（${projects.map((item) => item.name).join("、")}）`);
  if (!lines.length) lines.push("未选择任何上下文（仅基于你的要求回答）");
  return lines;
}

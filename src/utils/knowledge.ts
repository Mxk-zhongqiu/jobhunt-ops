// 知识模块派生工具：进度计算 + Markdown 导出（不修改任何状态）

import type { KnowledgePoint, KnowledgeTopic } from "../types/domain";

/** 主题下知识点总数（兼容旧数据缺 points） */
export function topicPointCount(topic: KnowledgeTopic): number {
  return topic.points?.length ?? 0;
}

/** 主题下已掌握知识点数 */
export function topicMasteredCount(topic: KnowledgeTopic): number {
  return (topic.points ?? []).filter((point) => point.mastered).length;
}

export interface KnowledgeStats {
  topics: number;
  points: number;
  mastered: number;
  /** 掌握率 0–100（无知识点时为 0） */
  rate: number;
}

/** 全局统计：主题 / 知识点 / 已掌握 / 掌握率 */
export function knowledgeStats(knowledge: KnowledgeTopic[]): KnowledgeStats {
  const topics = knowledge.length;
  const points = knowledge.reduce((sum, topic) => sum + topicPointCount(topic), 0);
  const mastered = knowledge.reduce((sum, topic) => sum + topicMasteredCount(topic), 0);
  return { topics, points, mastered, rate: points ? Math.round((mastered / points) * 100) : 0 };
}

function statusMark(mastered: boolean): string {
  return mastered ? "[x]" : "[ ]";
}

/** 知识点清单 → 可背诵的 Markdown 文档（导出用） */
export function knowledgeToMarkdown(knowledge: KnowledgeTopic[], options: { generatedAt: string }): string {
  const stats = knowledgeStats(knowledge);
  const masteredTopics = knowledge.filter((topic) => topic.status === "已掌握").length;

  const lines: string[] = [];
  lines.push("# 知识体系 · 导出", "");
  lines.push(
    `> 生成时间：${options.generatedAt} · ${stats.topics} 个主题（已掌握 ${masteredTopics}） · ${stats.points} 个知识点（已掌握 ${stats.mastered}，掌握率 ${stats.rate}%）`,
    "",
  );

  // 按分类分组，保持种子顺序
  const categories = new Map<string, KnowledgeTopic[]>();
  for (const topic of knowledge) {
    const list = categories.get(topic.category) ?? [];
    list.push(topic);
    categories.set(topic.category, list);
  }

  for (const [category, topics] of categories) {
    lines.push(`## ${category}`, "");
    for (const topic of topics) {
      const points = topic.points ?? [];
      const mastered = points.filter((point) => point.mastered).length;
      lines.push(`### ${topic.name}（${topic.priority} · ${topic.status}${points.length ? ` · 知识点 ${mastered}/${points.length}` : ""}）`, "");
      if (!points.length) {
        lines.push("_暂无知识点_", "");
        continue;
      }
      points.forEach((point, index) => {
        const mark = statusMark(point.mastered);
        const depth = point.depth ? `（${point.depth}）` : "";
        lines.push(`${index + 1}. ${mark} **${point.title}**${depth}`);
        if (point.summary.trim()) lines.push(`   - ${point.summary.trim().replace(/\n+/g, " ")}`);
        lines.push("");
      });
    }
  }
  return lines.join("\n");
}

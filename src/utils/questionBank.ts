// 高频面试题库：从面试记录（InterviewLog.questions，每题一行）自动汇总去重
// 纯派生逻辑：不修改任何状态，只从 interviews 计算；"已掌握"标记由 AppState.questionBankMastered 单独持久化。

import type { InterviewLog } from "../types/domain";

export interface QuestionSource {
  company: string;
  round: string;
  date: string;
}

export interface BankQuestion {
  /** 规范化文本（去重键，也是"已掌握"标记的稳定 id） */
  key: string;
  /** 首次出现的原始文本（仅去首尾空白，保留标点与大小写） */
  question: string;
  /** 被问到的次数（跨面试累加） */
  count: number;
  /** 问过该题的公司（去重，保序） */
  companies: string[];
  /** 出现的轮次（去重，保序） */
  rounds: string[];
  /** 每一次出现的来源 */
  sources: QuestionSource[];
}

/** 把问题文本按行拆分（每题一行），去首尾空白、过滤空行 */
export function splitQuestions(text: string): string[] {
  return text
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * 规范化题目文本作为去重键：
 * 折叠空白（含全角空格）→ 去掉句末标点 → 小写。
 * 保持保守：只做这三种变换，避免把不同题目误合并。
 */
export function normalizeQuestion(question: string): string {
  return question
    .trim()
    .replace(/[\s\u3000]+/g, " ")
    .replace(/[。！？!?；;…]+$/g, "")
    .toLowerCase();
}

/** 全部面试记录 → 去重后的题库，按出现次数降序（同次数按文本排序） */
export function buildQuestionBank(interviews: InterviewLog[]): BankQuestion[] {
  const map = new Map<string, BankQuestion>();
  for (const item of interviews) {
    for (const raw of splitQuestions(item.questions)) {
      const key = normalizeQuestion(raw);
      if (!key) continue;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        existing.sources.push({ company: item.company, round: item.round, date: item.date });
        if (!existing.companies.includes(item.company)) existing.companies.push(item.company);
        if (!existing.rounds.includes(item.round)) existing.rounds.push(item.round);
      } else {
        map.set(key, {
          key,
          question: raw,
          count: 1,
          companies: [item.company],
          rounds: [item.round],
          sources: [{ company: item.company, round: item.round, date: item.date }],
        });
      }
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, "zh-CN"));
}

/** 题库 → 可背诵的 Markdown 文档（导出用） */
export function questionBankToMarkdown(
  bank: BankQuestion[],
  options: { generatedAt: string; masteredKeys: string[] },
): string {
  const mastered = new Set(options.masteredKeys);
  const highFreqCount = bank.filter((q) => q.count >= 2).length;
  const companyCount = new Set(bank.flatMap((q) => q.companies)).size;
  const masteredCount = bank.filter((q) => mastered.has(q.key)).length;

  const lines: string[] = [];
  lines.push("# 高频面试题库 · 自动汇总", "");
  lines.push(
    `> 生成时间：${options.generatedAt} · 共 ${bank.length} 题（高频 ${highFreqCount} 题）· 来自 ${companyCount} 家公司 · 已掌握 ${masteredCount}/${bank.length}`,
    "",
  );
  lines.push("## 题目", "");
  bank.forEach((question, index) => {
    const freq = question.count >= 2 ? `[高频 ×${question.count}]` : `[×${question.count}]`;
    const mark = mastered.has(question.key) ? " [已掌握]" : "";
    lines.push(`${index + 1}. **${question.question}** ${freq}${mark}`);
    lines.push(
      `   - 来源：${question.sources.map((s) => `${s.company}（${s.round} · ${s.date}）`).join("、")}`,
      "",
    );
  });
  return lines.join("\n");
}

import { useMemo, useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import { useAppData } from "../store/appStore";
import { buildQuestionBank, questionBankToMarkdown } from "../utils/questionBank";
import { dateStamp, downloadText } from "../utils/io";

type BankFilter = "全部" | "高频" | "未掌握";

export function QuestionBankPage() {
  const { interviews, questionBankMastered, toggleQuestionMastered } = useAppData();
  const [filter, setFilter] = useState<BankFilter>("全部");

  // 题库是派生数据：每次都从面试记录实时汇总，改动立即生效
  const bank = useMemo(() => buildQuestionBank(interviews), [interviews]);
  const masteredSet = useMemo(() => new Set(questionBankMastered), [questionBankMastered]);
  const highFreqCount = bank.filter((q) => q.count >= 2).length;
  const companyCount = new Set(bank.flatMap((q) => q.companies)).size;
  const masteredCount = bank.filter((q) => masteredSet.has(q.key)).length;
  const progress = bank.length ? Math.round((masteredCount / bank.length) * 100) : 0;
  const hasQuestionData = interviews.some((item) => item.questions.trim() !== "");

  const visible = useMemo(
    () =>
      bank.filter((q) => {
        if (filter === "高频") return q.count >= 2;
        if (filter === "未掌握") return !masteredSet.has(q.key);
        return true;
      }),
    [bank, filter, masteredSet],
  );

  const exportMarkdown = () => {
    const markdown = questionBankToMarkdown(bank, { generatedAt: dateStamp(), masteredKeys: questionBankMastered });
    downloadText(`interview-question-bank-${dateStamp()}.md`, markdown, "text/markdown;charset=utf-8");
  };

  const resetMastered = () => {
    if (!window.confirm("清除全部「已掌握」标记？题库本身不受影响。")) return;
    for (const key of questionBankMastered) toggleQuestionMastered(key);
  };

  return (
    <div className="page">
      <section className="card">
        <div className="card-heading"><h2>题库概览</h2><span>从面试记录自动汇总去重 · 出现 ≥2 次视为高频</span></div>
        <div className="stat-strip">
          <div className="stat-card"><span>去重题目</span><strong>{bank.length}</strong><small>来自 {interviews.length} 条面试记录</small></div>
          <div className="stat-card"><span>高频题（≥2 次）</span><strong>{highFreqCount}</strong><small>优先背诵</small></div>
          <div className="stat-card"><span>来源公司</span><strong>{companyCount}</strong><small>覆盖 {companyCount} 家公司</small></div>
          <div className="stat-card"><span>背诵进度</span><strong>{masteredCount}/{bank.length}</strong><small>{progress}% 已掌握</small><div className="progress-line"><i style={{ width: `${progress}%` }} /></div></div>
        </div>
      </section>

      <section className="card">
        <div className="card-heading"><h2>筛选与导出</h2><span>导出 Markdown 可离线背诵 / 打印 / 导入笔记软件</span></div>
        <div className="bank-actions">
          <div className="bank-tabs">
            {(["全部", "高频", "未掌握"] as BankFilter[]).map((item) => (
              <button key={item} type="button" className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
                {item}
                <b>{item === "全部" ? bank.length : item === "高频" ? highFreqCount : bank.length - masteredCount}</b>
              </button>
            ))}
          </div>
          <div className="bank-toolbar-right">
            <button type="button" className="primary" onClick={exportMarkdown} disabled={!bank.length}><Download size={16} /> 导出 Markdown</button>
            <button type="button" className="soft" onClick={resetMastered} disabled={!masteredCount}><RotateCcw size={15} /> 重置进度</button>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-heading"><h2>题目清单</h2><span>按出现次数排序 · 点击左侧方块标记已掌握</span></div>
        {visible.length ? (
          <div className="bank-list">
            {visible.map((question) => {
              const mastered = masteredSet.has(question.key);
              return (
                <article key={question.key} className={`bank-row${mastered ? " mastered" : ""}`}>
                  <button
                    type="button"
                    className={`bank-toggle${mastered ? " done" : ""}`}
                    onClick={() => toggleQuestionMastered(question.key)}
                    aria-label={mastered ? "取消已掌握" : "标记已掌握"}
                  />
                  <div className="bank-main">
                    <strong className="bank-question">{question.question}</strong>
                    <div className="bank-meta">
                      {question.count >= 2
                        ? <span className="badge red">高频 ×{question.count}</span>
                        : <span className="badge muted">×{question.count}</span>}
                      <span className="bank-sources">
                        {question.sources.map((s) => `${s.company}（${s.round} · ${s.date}）`).join("、")}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty">
            {hasQuestionData
              ? (filter === "未掌握" ? "太棒了，当前筛选下没有未掌握的题目！" : "当前筛选下没有题目。")
              : "还没有面试问题。去「面试记录」页记录每场面试的问题（每题一行），这里会自动汇总去重。"}
          </div>
        )}
      </section>
    </div>
  );
}

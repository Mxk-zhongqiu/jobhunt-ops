import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useAppData } from "../store/appStore";

export function InterviewsPage() {
  const { interviews, addInterview, removeInterview } = useAppData();
  const [company, setCompany] = useState("");
  const [round, setRound] = useState("一面");
  const [date, setDate] = useState("");
  const [questions, setQuestions] = useState("");
  const [review, setReview] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = company.trim();
    if (!name) return;
    addInterview({
      company: name,
      round,
      date: date || new Date().toISOString().slice(0, 10),
      questions: questions.trim(),
      review: review.trim(),
    });
    setCompany("");
    setQuestions("");
    setReview("");
  };

  return (
    <div className="page">
      <section className="card">
        <div className="card-heading"><h2>记录一次笔试 / 面试</h2><span>复盘是迭代的原料</span></div>
        <form className="interview-form" onSubmit={submit}>
          <label>公司<input required value={company} onChange={(event) => setCompany(event.target.value)} placeholder="例如：启林投资" /></label>
          <label>轮次
            <select value={round} onChange={(event) => setRound(event.target.value)}>
              {["笔试", "一面", "二面", "终面", "HR 面"].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>日期<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label className="full">被问到的问题<textarea value={questions} onChange={(event) => setQuestions(event.target.value)} placeholder="每题一行，方便之后整理高频题库" /></label>
          <label className="full">复盘（好 / 不好 / 下次改进）<textarea value={review} onChange={(event) => setReview(event.target.value)} placeholder="问题→方案→结果→重来会怎样" /></label>
          <button className="primary" type="submit" disabled={!company.trim()}><Plus size={16} /> 保存记录</button>
        </form>
      </section>

      <section className="card">
        <div className="card-heading"><h2>记录清单</h2><span>共 {interviews.length} 条</span></div>
        {interviews.length ? (
          <div className="interview-list">
            {interviews.map((item) => (
              <article className="interview-card" key={item.id}>
                <header>
                  <div><strong>{item.company}</strong><span className="badge gold">{item.round}</span></div>
                  <time>{item.date}</time>
                  <button type="button" className="icon-btn" aria-label="删除" onClick={() => { if (window.confirm(`删除这条${item.round}记录？`)) removeInterview(item.id); }}><Trash2 size={15} /></button>
                </header>
                {item.questions ? <div><h4>问题</h4><pre>{item.questions}</pre></div> : null}
                {item.review ? <div><h4>复盘</h4><p>{item.review}</p></div> : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty">还没有记录。面试结束后 30 分钟内写下问题和复盘，遗忘最快。</div>
        )}
      </section>
    </div>
  );
}

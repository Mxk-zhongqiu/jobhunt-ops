import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { currentWeek, useAppData } from "../store/appStore";

export function PlanPage() {
  const { weeklyPlans, settings, togglePlanTask, addPlanTask, removePlanTask } = useAppData();
  const [week, setWeek] = useState(currentWeek(settings));
  const [text, setText] = useState("");
  const plan = weeklyPlans.find((item) => item.week === week);
  const done = plan?.tasks.filter((item) => item.done).length ?? 0;
  const total = plan?.tasks.length ?? 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value || !plan) return;
    addPlanTask(week, value);
    setText("");
  };

  return (
    <div className="page">
      <div className="week-tabs">
        {weeklyPlans.map((item) => (
          <button type="button" key={item.week} className={week === item.week ? "active" : ""} onClick={() => setWeek(item.week)}>
            <b>W{item.week}</b>
            <span>{item.label.split(" ")[0]}</span>
          </button>
        ))}
      </div>

      <section className="card">
        <div className="card-heading">
          <h2>{plan?.label ?? `第 ${week} 周`}</h2>
          <span>{done} / {total} 已完成</span>
        </div>
        <div className="progress-track big"><i style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>

        <ul className="check-list plan-list">
          {plan?.tasks.map((task) => (
            <li key={task.id} className={task.done ? "done" : ""}>
              <button type="button" className="check-box" aria-label="切换完成" onClick={() => togglePlanTask(week, task.id)} />
              <span>{task.text}</span>
              <button type="button" className="icon-btn" aria-label="删除" onClick={() => removePlanTask(week, task.id)}><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
        {!plan?.tasks.length ? <div className="empty">本周还没有任务</div> : null}

        <form className="inline-form" onSubmit={submit}>
          <input value={text} onChange={(event) => setText(event.target.value)} placeholder="添加本周行动项…" />
          <button className="primary" type="submit" disabled={!text.trim()}><Plus size={15} /> 添加</button>
        </form>
      </section>

      <section className="card note-card">
        <div className="card-heading"><h2>节奏提醒</h2></div>
        <ul className="note-list">
          <li>9 月前投递 50+ 家，之后每周 10 家，总计 100+：投递量就是概率。</li>
          <li>前两周的投递量决定 9 月能否有面试，项目是面试里唯一能证明你的东西。</li>
          <li>国庆窗口多数人放假，是弯道超车的机会（W7）。</li>
          <li>每天固定 1 小时概率题，不占用项目主线时间。</li>
        </ul>
      </section>
    </div>
  );
}

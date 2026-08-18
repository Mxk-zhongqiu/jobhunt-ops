import { Link } from "react-router-dom";
import { activeApplications, currentWeek, interviewApplications, projectProgress, useAppData } from "../store/appStore";
import type { Application } from "../types/domain";

const statusOrder: Application["status"][] = ["计划投递", "已投递", "笔试", "一面", "二面", "终面", "Offer", "已拒绝", "放弃"];

function daysUntil(isoDate?: string): number | null {
  if (!isoDate) return null;
  const target = new Date(`${isoDate}T23:59:59`).getTime();
  const diff = target - Date.now();
  return Math.ceil(diff / 86_400_000);
}

export function OverviewPage() {
  const { applications, weeklyPlans, projects, settings, togglePlanTask } = useAppData();
  const week = currentWeek(settings);
  const plan = weeklyPlans.find((item) => item.week === week);
  const pendingTasks = plan?.tasks.filter((item) => !item.done) ?? [];
  const doneCount = plan?.tasks.filter((item) => item.done).length ?? 0;
  const totalCount = plan?.tasks.length ?? 0;

  const submitted = applications.filter((item) => item.appliedAt).length;
  const active = activeApplications(applications).length;
  const interviews = interviewApplications(applications).length;
  const offers = applications.filter((item) => item.status === "Offer").length;

  const upcomingDeadlines = applications
    .map((item) => ({ item, days: daysUntil(item.deadline) }))
    .filter((entry) => entry.days !== null && entry.days >= 0 && entry.days <= 7 && !["Offer", "已拒绝", "放弃"].includes(entry.item.status))
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
    .slice(0, 5);

  const statusCounts = statusOrder.map((status) => ({ status, count: applications.filter((item) => item.status === status).length }));

  return (
    <div className="page">
      <section className="stat-strip">
        <StatCard label="已投出" value={String(submitted)} hint={`目标 ${settings.totalTarget} 家`} />
        <StatCard label="推进中" value={String(active)} hint="笔试与面试流程" />
        <StatCard label="进入面试" value={String(interviews)} hint="一面及以上" />
        <StatCard label="Offer" value={String(offers)} hint="最终目标" tone={offers > 0 ? "positive" : "default"} />
      </section>

      <section className="card funnel-card">
        <div className="card-heading">
          <h2>投递漏斗</h2>
          <span>共 {applications.length} 家 · 状态分布</span>
        </div>
        <div className="funnel">
          {statusCounts.map(({ status, count }) => (
            <div className="funnel-item" key={status}>
              <b>{count}</b>
              <span>{status}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-heading">
            <h2>本周重点（第 {week} 周）</h2>
            <span>{plan?.label ?? "暂无计划"}</span>
          </div>
          {pendingTasks.length ? (
            <ul className="check-list">
              {pendingTasks.map((task) => (
                <li key={task.id}>
                  <button type="button" className="check-box" aria-label="完成" onClick={() => togglePlanTask(week, task.id)} />
                  <span>{task.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">本周任务全部完成 🎉 <Link to="/plan">查看周计划</Link></div>
          )}
          <div className="progress-line"><i style={{ width: `${totalCount ? (doneCount / totalCount) * 100 : 0}%` }} /></div>
          <div className="card-footer"><span>{doneCount} / {totalCount} 已完成</span><Link to="/plan">打开周计划 →</Link></div>
        </section>

        <section className="card">
          <div className="card-heading">
            <h2>7 天内截止</h2>
            <Link to="/applications">全部投递 →</Link>
          </div>
          {upcomingDeadlines.length ? (
            <ul className="deadline-list">
              {upcomingDeadlines.map(({ item, days }) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.company}</strong>
                    <span>{item.position}</span>
                  </div>
                  <b className={days !== null && days <= 2 ? "urgent" : ""}>{days === 0 ? "今天" : `${days} 天`}</b>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">7 天内没有临近截止的投递</div>
          )}
        </section>
      </div>

      <section className="card">
        <div className="card-heading">
          <h2>项目推进</h2>
          <Link to="/projects">项目管理 →</Link>
        </div>
        <div className="project-stack">
          {projects.map((project) => {
            const progress = projectProgress(project);
            return (
              <div className="project-row" key={project.id}>
                <div>
                  <strong>{project.name}</strong>
                  <span>{project.status === "active" ? "推进中" : project.status === "paused" ? "暂停" : "已完成"}</span>
                </div>
                <b>{progress}%</b>
                <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, hint, tone = "default" }: { label: string; value: string; hint: string; tone?: "default" | "positive" }) {
  return (
    <div className={`stat-card ${tone === "positive" ? "positive" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}

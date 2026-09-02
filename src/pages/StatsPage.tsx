import { useMemo } from "react";
import { activeApplications, currentWeek, interviewApplications, useAppData } from "../store/appStore";
import type { Application, ApplicationPlatform, ApplicationStatus, CompanyTier } from "../types/domain";
import "../styles/stats.css";

/** 推进阶段序（用于判断"到达过某阶段"与相邻阶段耗时），已拒绝/放弃不计入阶段序 */
const STAGE_ORDER: Application["status"][] = ["计划投递", "已投递", "笔试", "一面", "二面", "终面", "Offer"];
/** 状态展示完整顺序（与投递页/总览一致） */
const STATUS_ORDER: Application["status"][] = ["计划投递", "已投递", "笔试", "一面", "二面", "终面", "Offer", "已拒绝", "放弃"];
const TIERS: CompanyTier[] = ["冲刺", "主攻", "保底"];
const PLATFORMS: ApplicationPlatform[] = ["Boss直聘", "猎聘", "官网", "牛客", "应届生", "学校就业网", "内推", "实习转正", "其他平台"];

/** 相邻阶段耗时统计的分组（含旧数据缺失中间状态时的别名键，如直接从计划投递进入笔试） */
const STAGE_GROUPS: { label: string; keys: string[] }[] = [
  { label: "投递 → 笔试", keys: ["计划投递→笔试", "已投递→笔试"] },
  { label: "笔试 → 一面", keys: ["笔试→一面"] },
  { label: "一面 → 二面", keys: ["一面→二面"] },
  { label: "二面 → 终面", keys: ["二面→终面"] },
  { label: "终面 → Offer", keys: ["终面→Offer"] },
];

const stageIndex = new Map(STAGE_ORDER.map((status, index) => [status, index]));

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function fmtDays(days: number): string {
  if (days < 1) return `${Math.round(days * 24)} 小时`;
  return `${days.toFixed(1)} 天`;
}

function badgeTone(status: ApplicationStatus): string {
  if (status === "Offer") return "green";
  if (status === "已拒绝") return "red";
  if (status === "放弃") return "muted";
  if (status === "终面" || status === "笔试") return "gold";
  if (status === "一面" || status === "二面") return "blue";
  return "muted";
}

function formatWhen(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  return date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** 把 yyyy-MM-dd 的 appliedAt 归到作战周（1–10），越界返回 0（前置）或 11（超出） */
function weekOf(appliedAt: string, startDate: string): number {
  const start = new Date(`${startDate}T00:00:00`).getTime();
  const day = new Date(`${appliedAt}T00:00:00`).getTime();
  if (Number.isNaN(start) || Number.isNaN(day)) return 0;
  const week = Math.floor((day - start) / 86_400_000 / 7) + 1;
  if (week < 1) return 0;
  if (week > 10) return 11;
  return week;
}

/** 统计每家公司在相邻推进阶段上的耗时（天），key 形如 "已投递→笔试" */
function collectStageDays(applications: Application[]): Map<string, number[]> {
  const agg = new Map<string, number[]>();
  for (const app of applications) {
    const history = (app.statusHistory ?? []).slice().sort((a, b) => (a.at < b.at ? -1 : 1));
    if (history.length < 2) continue;
    // 每个阶段取首次到达时间；已拒绝/放弃不参与推进耗时
    const firstByIndex = new Map<number, string>();
    for (const entry of history) {
      const index = stageIndex.get(entry.status);
      if (index === undefined) continue;
      if (!firstByIndex.has(index)) firstByIndex.set(index, entry.at);
    }
    const entries = [...firstByIndex.entries()].sort((a, b) => a[0] - b[0]);
    for (let k = 1; k < entries.length; k += 1) {
      const [prevIndex, prevAt] = entries[k - 1];
      const [curIndex, curAt] = entries[k];
      if (prevIndex === curIndex) continue;
      const key = `${STAGE_ORDER[prevIndex]}→${STAGE_ORDER[curIndex]}`;
      const days = (new Date(curAt).getTime() - new Date(prevAt).getTime()) / 86_400_000;
      if (Number.isNaN(days) || days < 0) continue;
      const bucket = agg.get(key) ?? [];
      bucket.push(days);
      agg.set(key, bucket);
    }
  }
  return agg;
}

export function StatsPage() {
  const { applications, settings } = useAppData();
  const week = currentWeek(settings);

  const stats = useMemo(() => {
    const applied = applications.filter((item) => item.status !== "计划投递");
    const active = activeApplications(applications).length;
    const interviews = interviewApplications(applications).length;
    const offers = applications.filter((item) => item.status === "Offer").length;
    const rejected = applications.filter((item) => item.status === "已拒绝" || item.status === "放弃").length;
    const submittedTotal = applied.length;

    const statusCounts = STATUS_ORDER.map((status) => ({
      status,
      count: applications.filter((item) => item.status === status).length,
    }));

    const countBy = <T,>(items: T[], key: (item: T) => string): Map<string, number> => {
      const map = new Map<string, number>();
      for (const item of items) {
        const k = key(item);
        map.set(k, (map.get(k) ?? 0) + 1);
      }
      return map;
    };

    const toRows = (keys: string[], map: Map<string, number>, othersLabel?: string) => {
      const rows = keys.map((key) => ({ name: key, count: map.get(key) ?? 0 }));
      const others = applications.length - keys.reduce((sum, key) => sum + (map.get(key) ?? 0), 0);
      if (others > 0 && othersLabel) rows.push({ name: othersLabel, count: others });
      return rows;
    };

    const tierRows = toRows(TIERS, countBy(applications, (a) => a.tier));
    const platformRows = toRows(PLATFORMS, countBy(applications, (a) => a.platform ?? "未标注"), "未标注");
    const total = Math.max(1, applications.length);

    const reached = (fromIndex: number) =>
      applications.filter((item) => {
        const index = stageIndex.get(item.status);
        return index !== undefined && index >= fromIndex;
      }).length;
    const writtenCount = reached(2); // 笔试及以后
    const interviewCount = reached(3); // 一面及以后
    const conversion = {
      submittedTotal,
      written: writtenCount,
      interview: interviewCount,
      offers,
      rejected,
    };

    const weekCounts = new Array<number>(12).fill(0);
    for (const item of applications) {
      if (!item.appliedAt) continue;
      const w = weekOf(item.appliedAt, settings.startDate);
      weekCounts[w] += 1;
    }
    const weeklyTarget = settings.dailySubmitTarget * 7;
    const weeklyPeak = Math.max(weeklyTarget, ...weekCounts.slice(0, 12));

    const stageDays = collectStageDays(applications);
    const stageRows = STAGE_GROUPS.map((group) => {
      const days: number[] = [];
      for (const key of group.keys) {
        const bucket = stageDays.get(key);
        if (bucket) days.push(...bucket);
      }
      const avg = days.length ? days.reduce((sum, d) => sum + d, 0) / days.length : null;
      return { label: group.label, sample: days.length, avg };
    });

    const recent = applications
      .flatMap((item) =>
        (item.statusHistory ?? []).map((entry) => ({ company: item.company, status: entry.status, at: entry.at })),
      )
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, 12);

    return {
      submittedTotal,
      active,
      interviews,
      offers,
      rejected,
      statusCounts,
      total,
      tierRows,
      platformRows,
      conversion,
      weekCounts,
      weeklyTarget,
      weeklyPeak,
      stageRows,
      recent,
      hasTimeline: applications.some((item) => (item.statusHistory?.length ?? 0) > 1),
    };
  }, [applications, settings]);

  const { conversion: c } = stats;

  return (
    <div className="page">
      <section className="stat-strip">
        <StatCard label="已投出" value={String(stats.submittedTotal)} hint={`总目标 ${settings.totalTarget} 家`} />
        <StatCard label="推进中" value={String(stats.active)} hint="笔试与面试流程" />
        <StatCard label="进入面试" value={String(stats.interviews)} hint="一面及以上" />
        <StatCard label="Offer" value={String(stats.offers)} hint="最终目标" tone={stats.offers > 0 ? "positive" : "default"} />
        <StatCard label="已拒绝/放弃" value={String(stats.rejected)} hint="沉淀复盘数据" />
      </section>

      <section className="card funnel-card">
        <div className="card-heading">
          <h2>状态分布</h2>
          <span>共 {applications.length} 家 · 全部状态计数</span>
        </div>
        <div className="funnel">
          {stats.statusCounts.map(({ status, count }) => (
            <div className="funnel-item" key={status}>
              <b>{count}</b>
              <span>{status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-heading">
          <h2>分层 / 来源平台分布</h2>
          <span>按当前全部投递计数（占比以总数 {applications.length} 计）</span>
        </div>
        <h3 className="stats-sub">按分层</h3>
        <Distribution rows={stats.tierRows} total={stats.total} tone="" />
        <h3 className="stats-sub">按来源平台</h3>
        <Distribution rows={stats.platformRows} total={stats.total} tone="blue" />
      </section>

      <section className="card">
        <div className="card-heading">
          <h2>转化率</h2>
          <span>分母 = 已投出 {c.submittedTotal} 家（不含计划投递）</span>
        </div>
        <div className="table-scroll">
          <table className="stats-table">
            <thead>
              <tr>
                <th>指标</th>
                <th>说明</th>
                <th>到达 / 已投</th>
                <th>转化率</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>笔试率</td>
                <td>到达 笔试 及以后</td>
                <td>{c.written} / {c.submittedTotal || 0}</td>
                <td><strong>{pct(c.written, c.submittedTotal)}%</strong></td>
              </tr>
              <tr>
                <td>面试率</td>
                <td>到达 一面 及以后</td>
                <td>{c.interview} / {c.submittedTotal || 0}</td>
                <td><strong>{pct(c.interview, c.submittedTotal)}%</strong></td>
              </tr>
              <tr>
                <td>Offer 率</td>
                <td>当前已有 Offer</td>
                <td>{c.offers} / {c.submittedTotal || 0}</td>
                <td><strong>{pct(c.offers, c.submittedTotal)}%</strong></td>
              </tr>
              <tr>
                <td>拒绝/放弃率</td>
                <td>已拒绝 + 放弃</td>
                <td>{c.rejected} / {c.submittedTotal || 0}</td>
                <td><strong>{pct(c.rejected, c.submittedTotal)}%</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="stats-note">每次把投递状态推进到下一阶段，漏斗数据就会更新；样本越多越能暴露卡点（如笔试→面试转化低就该复盘笔试）。</p>
      </section>

      <section className="card">
        <div className="card-heading">
          <h2>阶段耗时</h2>
          <span>基于状态时间线 statusHistory（状态每次变化自动记录）</span>
        </div>
        {stats.stageRows.some((row) => row.sample > 0) ? (
          <div className="table-scroll">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>阶段</th>
                  <th>样本数</th>
                  <th>平均耗时</th>
                </tr>
              </thead>
              <tbody>
                {stats.stageRows.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{row.sample}</td>
                    <td>{row.avg === null ? "—" : fmtDays(row.avg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            {stats.hasTimeline
              ? "时间线数据还不足以构成相邻阶段样本，继续推进状态后自动出现。"
              : "还没有可统计的阶段样本：公司状态每变化一次都会自动记入时间线，样本 ≥5 后再看均值更稳。"}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-heading">
          <h2>周投递节奏（第 {week} 周）</h2>
          <span>参考线：每日 {settings.dailySubmitTarget} 家 ≈ {stats.weeklyTarget} 家/周</span>
        </div>
        {applications.some((item) => item.appliedAt) ? (
          <div>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((w) => {
              const count = stats.weekCounts[w];
              if (w === 0 && count === 0) return null;
              if (w === 11 && count === 0) return null;
              const name = w === 0 ? "前置（开战前）" : w === 11 ? "超出（10 周后）" : `第 ${w} 周`;
              const width = count ? Math.max(2, Math.round((count / stats.weeklyPeak) * 100)) : 0;
              return (
                <div className="stats-row" key={w}>
                  <span className="stats-name">{name}</span>
                  <span className="stats-track accent"><i style={{ width: `${width}%` }} /></span>
                  <span className="stats-val">{count} 家</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty">还没有带「投递日期」的记录；投递后（含插件同步）自动呈现节奏曲线。</div>
        )}
      </section>

      <section className="card">
        <div className="card-heading">
          <h2>最近状态动态</h2>
          <span>时间线最新 12 条</span>
        </div>
        {stats.recent.length ? (
          <div>
            {stats.recent.map((entry, index) => (
              <div className="stats-event" key={`${entry.company}-${entry.at}-${index}`}>
                <span>
                  <strong>{entry.company}</strong>
                  <span className={`badge ${badgeTone(entry.status)}`}>{entry.status}</span>
                </span>
                <time>{formatWhen(entry.at)}</time>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">还没有状态变化记录：从投递追踪页或 Edge 插件推进状态后自动出现。</div>
        )}
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

function Distribution({ rows, total, tone }: { rows: { name: string; count: number }[]; total: number; tone: "" | "gold" | "blue" }) {
  return (
    <div>
      {rows.map((row) => {
        const ratio = total > 0 ? Math.round((row.count / total) * 100) : 0;
        return (
          <div className="stats-row" key={row.name}>
            <span className="stats-name">{row.name}</span>
            <span className={`stats-track ${tone || "accent"}`}><i style={{ width: `${ratio}%` }} /></span>
            <span className="stats-val">{row.count} · {ratio}%</span>
          </div>
        );
      })}
    </div>
  );
}

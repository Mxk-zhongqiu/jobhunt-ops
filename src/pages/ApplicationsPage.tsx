import { useMemo, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useAppData } from "../store/appStore";
import type { ApplicationChannel, ApplicationStatus, CompanyTier, PositionKind } from "../types/domain";

const tiers: CompanyTier[] = ["冲刺", "主攻", "保底"];
const channels: ApplicationChannel[] = ["官网", "牛客", "应届生", "学校就业网", "内推", "实习转正", "其他"];
const statuses: ApplicationStatus[] = ["计划投递", "已投递", "笔试", "一面", "二面", "终面", "Offer", "已拒绝", "放弃"];
const positionKinds: PositionKind[] = ["量化研究", "量化开发", "金融科技", "数据分析", "风控", "其他"];

export function ApplicationsPage() {
  const { applications, addApplication, updateApplication, removeApplication } = useAppData();
  const [statusFilter, setStatusFilter] = useState<"全部" | ApplicationStatus>("全部");
  const [tierFilter, setTierFilter] = useState<"全部" | CompanyTier>("全部");

  // 快速录入表单
  const [company, setCompany] = useState("");
  const [tier, setTier] = useState<CompanyTier>("主攻");
  const [channel, setChannel] = useState<ApplicationChannel>("官网");
  const [position, setPosition] = useState("");
  const [positionKind, setPositionKind] = useState<PositionKind>("量化研究");
  const [deadline, setDeadline] = useState("");
  const [url, setUrl] = useState("");

  const visible = useMemo(
    () =>
      applications.filter(
        (item) => (statusFilter === "全部" || item.status === statusFilter) && (tierFilter === "全部" || item.tier === tierFilter),
      ),
    [applications, statusFilter, tierFilter],
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = company.trim();
    if (!name) return;
    addApplication({
      company: name,
      tier,
      channel,
      position: position.trim() || "量化研究员（2026 届）",
      positionKind,
      deadline: deadline || undefined,
      url: url.trim() || undefined,
    });
    setCompany("");
    setPosition("");
    setDeadline("");
    setUrl("");
  };

  const markApplied = (id: string) => {
    const item = applications.find((entry) => entry.id === id);
    if (!item) return;
    if (item.status === "计划投递") {
      updateApplication(id, { status: "已投递", appliedAt: new Date().toISOString().slice(0, 10) });
    }
  };

  const activeCount = visible.filter((item) => !["Offer", "已拒绝", "放弃"].includes(item.status)).length;

  return (
    <div className="page">
      <section className="card">
        <div className="card-heading">
          <h2>快速录入</h2>
          <span>保存后默认状态为「计划投递」</span>
        </div>
        <form className="quick-form" onSubmit={submit}>
          <label>公司<input required value={company} onChange={(event) => setCompany(event.target.value)} placeholder="例如：启林投资" /></label>
          <label>分层<select value={tier} onChange={(event) => setTier(event.target.value as CompanyTier)}>{tiers.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label>渠道<select value={channel} onChange={(event) => setChannel(event.target.value as ApplicationChannel)}>{channels.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label>岗位<input value={position} onChange={(event) => setPosition(event.target.value)} placeholder="量化研究员（2026 届）" /></label>
          <label>类型<select value={positionKind} onChange={(event) => setPositionKind(event.target.value as PositionKind)}>{positionKinds.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label>截止日<input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
          <label className="span-2">投递链接<input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="官网 / 公众号投递地址" /></label>
          <button className="primary" type="submit" disabled={!company.trim()}><Plus size={16} /> 添加投递</button>
        </form>
      </section>

      <section className="card">
        <div className="card-heading">
          <h2>投递清单</h2>
          <span>共 {visible.length} 家 · 待推进 {activeCount} 家</span>
        </div>
        <div className="filter-bar">
          <label>状态
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="全部">全部</option>
              {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>分层
            <select value={tierFilter} onChange={(event) => setTierFilter(event.target.value as typeof tierFilter)}>
              <option value="全部">全部</option>
              {tiers.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>

        {visible.length ? (
          <div className="app-table">
            <div className="app-table-head">
              <span>公司</span><span>分层</span><span>岗位</span><span>渠道</span><span>截止</span><span>状态</span><span></span>
            </div>
            {visible.map((item) => (
              <div className="app-row" key={item.id}>
                <div className="app-company">
                  <strong>{item.company}</strong>
                  {item.appliedAt ? <small>已投 {item.appliedAt}</small> : item.status === "计划投递" ? <button type="button" className="link-btn" onClick={() => markApplied(item.id)}>标记已投</button> : null}
                  {item.url ? <a href={item.url} target="_blank" rel="noreferrer">链接</a> : null}
                </div>
                <span><Badge tone={item.tier === "冲刺" ? "red" : item.tier === "主攻" ? "gold" : "blue"}>{item.tier}</Badge></span>
                <span className="app-position">{item.position}<small>{item.positionKind}</small></span>
                <span className="muted">{item.channel}</span>
                <span className={isUrgent(item.deadline) ? "urgent-text" : "muted"}>{formatDeadline(item.deadline)}</span>
                <span>
                  <select value={item.status} onChange={(event) => updateApplication(item.id, { status: event.target.value as ApplicationStatus })}>
                    {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </span>
                <span><button type="button" className="icon-btn" aria-label="删除" onClick={() => { if (window.confirm(`删除投递「${item.company}」？`)) removeApplication(item.id); }}><Trash2 size={15} /></button></span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">当前筛选下没有投递记录</div>
        )}
      </section>
    </div>
  );
}

function isUrgent(deadline?: string) {
  if (!deadline) return false;
  const diff = new Date(`${deadline}T23:59:59`).getTime() - Date.now();
  return diff >= 0 && diff <= 2 * 86_400_000;
}

function formatDeadline(deadline?: string) {
  if (!deadline) return "—";
  const diff = Math.ceil((new Date(`${deadline}T23:59:59`).getTime() - Date.now()) / 86_400_000);
  if (diff < 0) return `${deadline}（已过）`;
  if (diff === 0) return "今天截止";
  return `${deadline.slice(5)}（${diff} 天）`;
}

export function Badge({ children, tone }: { children: React.ReactNode; tone: "red" | "gold" | "blue" | "green" | "muted" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

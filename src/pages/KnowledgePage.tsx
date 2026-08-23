import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Download, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useAppData } from "../store/appStore";
import { knowledgeStats, knowledgeToMarkdown, topicMasteredCount, topicPointCount } from "../utils/knowledge";
import { dateStamp, downloadText } from "../utils/io";
import type { KnowledgePoint, KnowledgeTopic, PointDepth, TopicPriority, TopicStatus } from "../types/domain";
import { Badge } from "./ApplicationsPage";

const topicStatuses: TopicStatus[] = ["未开始", "学习中", "已掌握"];
const priorities: TopicPriority[] = ["高频", "必考", "加分"];
const depths: PointDepth[] = ["基础", "进阶"];
type StatusFilter = "全部" | TopicStatus;

const priorityTone = (priority: TopicPriority): "red" | "gold" | "blue" => (priority === "高频" ? "red" : priority === "必考" ? "gold" : "blue");

export function KnowledgePage() {
  const { knowledge, setTopicStatus, setPointMastered, addPoint, updatePoint, removePoint, addTopic, updateTopic, removeTopic } = useAppData();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("全部");
  const [addTopicOpen, setAddTopicOpen] = useState(false);

  const stats = useMemo(() => knowledgeStats(knowledge), [knowledge]);
  const learning = knowledge.filter((item) => item.status === "学习中").length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return knowledge.filter((topic) => {
      if (statusFilter !== "全部" && topic.status !== statusFilter) return false;
      if (!q) return true;
      if (topic.name.toLowerCase().includes(q) || topic.category.toLowerCase().includes(q)) return true;
      return (topic.points ?? []).some((point) => point.title.toLowerCase().includes(q));
    });
  }, [knowledge, query, statusFilter]);

  const categories = useMemo(() => {
    const map = new Map<string, KnowledgeTopic[]>();
    for (const topic of filtered) {
      const list = map.get(topic.category) ?? [];
      list.push(topic);
      map.set(topic.category, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const categoryOptions = useMemo(() => [...new Set(knowledge.map((topic) => topic.category))], [knowledge]);

  const exportMarkdown = () => {
    const markdown = knowledgeToMarkdown(knowledge, { generatedAt: dateStamp() });
    downloadText(`knowledge-${dateStamp()}.md`, markdown, "text/markdown;charset=utf-8");
  };

  return (
    <div className="page">
      <section className="stat-strip">
        <div className="stat-card"><span>主题总数</span><strong>{stats.topics}</strong><small>学习中 {learning} · 按优先级推进</small></div>
        <div className="stat-card"><span>知识点总数</span><strong>{stats.points}</strong><small>每个主题 6–12 项为宜</small></div>
        <div className="stat-card positive"><span>已掌握知识点</span><strong>{stats.mastered}</strong><small>点击每项前的方块勾选</small></div>
        <div className="stat-card"><span>掌握率</span><strong>{stats.rate}%</strong><small>{stats.points ? `${stats.mastered} / ${stats.points}` : "尚无知识点"}</small><div className="progress-line"><i style={{ width: `${stats.rate}%` }} /></div></div>
      </section>

      <section className="card">
        <div className="card-heading">
          <h2>筛选与工具</h2>
          <span>知识点内容可逐个填写，或在「AI 助手」页勾选主题生成</span>
        </div>
        <div className="bank-actions">
          <div className="knowledge-toolbar">
            <label className="knowledge-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索主题或知识点标题…" /></label>
            <div className="bank-tabs">
              {(["全部", ...topicStatuses] as StatusFilter[]).map((item) => (
                <button key={item} type="button" className={statusFilter === item ? "active" : ""} onClick={() => setStatusFilter(item)}>
                  {item}
                  <b>{item === "全部" ? knowledge.length : knowledge.filter((topic) => topic.status === item).length}</b>
                </button>
              ))}
            </div>
          </div>
          <div className="bank-toolbar-right">
            <button type="button" className="primary" onClick={exportMarkdown} disabled={!knowledge.length}><Download size={16} /> 导出 Markdown</button>
            <button type="button" className="soft" onClick={() => setAddTopicOpen((v) => !v)}><Plus size={15} /> 新增主题</button>
          </div>
        </div>
        {addTopicOpen ? <AddTopicForm categories={categoryOptions} onCancel={() => setAddTopicOpen(false)} onSubmit={(topic) => { addTopic(topic); setAddTopicOpen(false); }} /> : null}
      </section>

      {categories.map(([category, topics]) => {
        const done = topics.filter((item) => item.status === "已掌握").length;
        return (
          <section className="card" key={category}>
            <div className="card-heading">
              <h2>{category}</h2>
              <span>{done} / {topics.length} 已掌握</span>
            </div>
            <div className="topic-grid">
              {topics.map((topic) => (
                <TopicItem
                  key={topic.id}
                  topic={topic}
                  expanded={expandedId === topic.id}
                  onToggleExpand={() => setExpandedId(expandedId === topic.id ? null : topic.id)}
                  onSetStatus={(status) => setTopicStatus(topic.id, status)}
                  onSetMastered={(pointId, mastered) => setPointMastered(topic.id, pointId, mastered)}
                  onAddPoint={(point) => addPoint(topic.id, point)}
                  onUpdatePoint={(pointId, patch) => updatePoint(topic.id, pointId, patch)}
                  onRemovePoint={(pointId) => removePoint(topic.id, pointId)}
                  onUpdateTopic={(patch) => updateTopic(topic.id, patch)}
                  onRemoveTopic={() => removeTopic(topic.id)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {!filtered.length ? (
        <section className="card"><div className="empty">
          {knowledge.length ? "没有符合当前筛选条件的主题。" : "还没有知识主题。点击「新增主题」创建第一个主题，再为它添加知识点。"}
        </div></section>
      ) : null}
    </div>
  );
}

function TopicItem({ topic, expanded, onToggleExpand, onSetStatus, onSetMastered, onAddPoint, onUpdatePoint, onRemovePoint, onUpdateTopic, onRemoveTopic }: {
  topic: KnowledgeTopic;
  expanded: boolean;
  onToggleExpand: () => void;
  onSetStatus: (status: TopicStatus) => void;
  onSetMastered: (pointId: string, mastered: boolean) => void;
  onAddPoint: (point: Omit<KnowledgePoint, "id">) => void;
  onUpdatePoint: (pointId: string, patch: Partial<KnowledgePoint>) => void;
  onRemovePoint: (pointId: string) => void;
  onUpdateTopic: (patch: Partial<Omit<KnowledgeTopic, "id">>) => void;
  onRemoveTopic: () => void;
}) {
  const total = topicPointCount(topic);
  const mastered = topicMasteredCount(topic);
  const [adding, setAdding] = useState(false);
  const [editTopic, setEditTopic] = useState(false);

  return (
    <div className={`topic-item${expanded ? " open" : ""}`}>
      <div className="topic-row" role="button" tabIndex={0} onClick={onToggleExpand} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onToggleExpand(); } }}>
        <div className="topic-name">
          {expanded ? <ChevronDown size={15} className="topic-chevron" /> : <ChevronRight size={15} className="topic-chevron" />}
          <strong>{topic.name}</strong>
          <Badge tone={priorityTone(topic.priority)}>{topic.priority}</Badge>
          {total ? <span className="topic-progress">知识点 {mastered}/{total}</span> : null}
        </div>
        <div className="topic-row-right">
          {total ? (
            <span className="topic-mini-track"><i style={{ width: `${Math.round((mastered / total) * 100)}%` }} /></span>
          ) : null}
          <select
            value={topic.status}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onSetStatus(event.target.value as TopicStatus)}
          >
            {topicStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>
      </div>

      {expanded ? (
        <div className="topic-detail">
          {topic.note ? <p className="topic-note">{topic.note}</p> : null}

          {total ? (
            <div className="point-list">
              {topic.points.map((point) => (
                <PointItem
                  key={point.id}
                  point={point}
                  onToggle={() => onSetMastered(point.id, !point.mastered)}
                  onUpdate={(patch) => onUpdatePoint(point.id, patch)}
                  onRemove={() => { if (window.confirm(`删除知识点「${point.title}」？`)) onRemovePoint(point.id); }}
                />
              ))}
            </div>
          ) : (
            <p className="empty point-empty">暂无知识点。点击下方「添加知识点」，或在「AI 助手」页勾选本主题让 AI 生成。</p>
          )}

          {adding ? (
            <AddPointForm
              onCancel={() => setAdding(false)}
              onSubmit={(point) => { onAddPoint(point); setAdding(false); }}
            />
          ) : null}

          {editTopic ? (
            <TopicEditForm
              topic={topic}
              onCancel={() => setEditTopic(false)}
              onSubmit={(patch) => { onUpdateTopic(patch); setEditTopic(false); }}
              onRemove={() => { if (window.confirm(`删除主题「${topic.name}」及其全部知识点？`)) { onRemoveTopic(); } }}
            />
          ) : null}

          <div className="topic-tools">
            {!adding ? (
              <button type="button" className="soft small" onClick={() => setAdding(true)}><Plus size={13} /> 添加知识点</button>
            ) : null}
            {!editTopic ? (
              <button type="button" className="soft small" onClick={() => setEditTopic(true)}><Pencil size={13} /> 编辑主题</button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PointItem({ point, onToggle, onUpdate, onRemove }: {
  point: KnowledgePoint;
  onToggle: () => void;
  onUpdate: (patch: Partial<KnowledgePoint>) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(point.title);
  const [summary, setSummary] = useState(point.summary);
  const [depth, setDepth] = useState<PointDepth | "">(point.depth ?? "");

  const startEdit = () => { setTitle(point.title); setSummary(point.summary); setDepth(point.depth ?? ""); setEditing(true); };
  const save = () => {
    if (!title.trim()) return;
    onUpdate({ title: title.trim(), summary: summary.trim(), depth: depth === "" ? undefined : depth });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="point-row point-edit">
        <label className="ai-field">知识点标题
          <input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
        </label>
        <label className="ai-field">核心要点（公式 / 结论 / 答法）
          <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={2} />
        </label>
        <label className="ai-field">深度
          <select value={depth} onChange={(event) => setDepth(event.target.value as PointDepth | "")}>
            <option value="">（不标记）</option>
            {depths.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <div className="inline-actions">
          <button type="button" className="primary small" onClick={save} disabled={!title.trim()}><Check size={13} /> 保存</button>
          <button type="button" className="soft small" onClick={() => setEditing(false)}><X size={13} /> 取消</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`point-row${point.mastered ? " mastered" : ""}`}>
      <button
        type="button"
        className={`bank-toggle${point.mastered ? " done" : ""}`}
        onClick={onToggle}
        aria-label={point.mastered ? "取消已掌握" : "标记已掌握"}
      />
      <div className="point-main">
        <div className="point-title-line">
          <strong className="point-title">{point.title}</strong>
          {point.depth ? <Badge tone={point.depth === "基础" ? "blue" : "muted"}>{point.depth}</Badge> : null}
        </div>
        {point.summary ? <p className="point-summary">{point.summary}</p> : <p className="point-summary empty-summary">（暂无要点，点击编辑补充）</p>}
      </div>
      <div className="point-actions">
        <button type="button" className="soft small" onClick={startEdit} aria-label="编辑"><Pencil size={13} /></button>
        <button type="button" className="soft small danger-icon" onClick={onRemove} aria-label="删除"><Trash2 size={13} /></button>
      </div>
    </div>
  );
}

function AddPointForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (point: Omit<KnowledgePoint, "id">) => void }) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [depth, setDepth] = useState<PointDepth | "">("");

  const submit = () => {
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), summary: summary.trim(), depth: depth === "" ? undefined : depth, mastered: false });
  };

  return (
    <div className="point-row point-edit add-point-form">
      <label className="ai-field">知识点标题
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="如：贝叶斯公式" autoFocus />
      </label>
      <label className="ai-field">核心要点（公式 / 结论 / 答法）
        <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={2} placeholder="1–3 句：公式、关键结论、面试必答法…" />
      </label>
      <label className="ai-field">深度
        <select value={depth} onChange={(event) => setDepth(event.target.value as PointDepth | "")}>
          <option value="">（不标记）</option>
          {depths.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <div className="inline-actions">
        <button type="button" className="primary small" onClick={submit} disabled={!title.trim()}><Check size={13} /> 添加</button>
        <button type="button" className="soft small" onClick={onCancel}><X size={13} /> 取消</button>
      </div>
    </div>
  );
}

function TopicEditForm({ topic, onCancel, onSubmit, onRemove }: {
  topic: KnowledgeTopic;
  onCancel: () => void;
  onSubmit: (patch: Partial<Omit<KnowledgeTopic, "id">>) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(topic.name);
  const [category, setCategory] = useState(topic.category);
  const [priority, setPriority] = useState<TopicPriority>(topic.priority);

  return (
    <div className="topic-edit-form">
      <label className="ai-field">主题名称
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="ai-field">分类
        <input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="如：数学/统计" />
      </label>
      <label className="ai-field">优先级
        <select value={priority} onChange={(event) => setPriority(event.target.value as TopicPriority)}>
          {priorities.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <div className="inline-actions">
        <button type="button" className="primary small" onClick={() => { if (name.trim() && category.trim()) onSubmit({ name: name.trim(), category: category.trim(), priority }); }} disabled={!name.trim() || !category.trim()}><Check size={13} /> 保存</button>
        <button type="button" className="soft small" onClick={onCancel}><X size={13} /> 取消</button>
        <button type="button" className="danger small" onClick={onRemove}><Trash2 size={13} /> 删除主题</button>
      </div>
    </div>
  );
}

function AddTopicForm({ categories, onCancel, onSubmit }: {
  categories: string[];
  onCancel: () => void;
  onSubmit: (topic: Omit<KnowledgeTopic, "id" | "points">) => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(categories[0] ?? "");
  const [priority, setPriority] = useState<TopicPriority>("必考");

  return (
    <div className="topic-edit-form add-topic-form">
      <label className="ai-field">主题名称
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="如：随机过程与布朗运动" autoFocus />
      </label>
      <label className="ai-field">分类
        <input value={category} onChange={(event) => setCategory(event.target.value)} list="knowledge-categories" placeholder="选择或输入新分类" />
        <datalist id="knowledge-categories">{categories.map((item) => <option key={item} value={item} />)}</datalist>
      </label>
      <label className="ai-field">优先级
        <select value={priority} onChange={(event) => setPriority(event.target.value as TopicPriority)}>
          {priorities.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <div className="inline-actions">
        <button type="button" className="primary small" onClick={() => { if (name.trim() && category.trim()) onSubmit({ name: name.trim(), category: category.trim(), priority, status: "未开始" }); }} disabled={!name.trim() || !category.trim()}><Check size={13} /> 创建</button>
        <button type="button" className="soft small" onClick={onCancel}><X size={13} /> 取消</button>
      </div>
    </div>
  );
}

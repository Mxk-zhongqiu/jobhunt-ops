import { useMemo } from "react";
import { useAppData } from "../store/appStore";
import type { TopicStatus } from "../types/domain";
import { Badge } from "./ApplicationsPage";

const topicStatuses: TopicStatus[] = ["未开始", "学习中", "已掌握"];

export function KnowledgePage() {
  const { knowledge, setTopicStatus } = useAppData();

  const categories = useMemo(() => {
    const map = new Map<string, typeof knowledge>();
    for (const topic of knowledge) {
      const list = map.get(topic.category) ?? [];
      list.push(topic);
      map.set(topic.category, list);
    }
    return [...map.entries()];
  }, [knowledge]);

  const mastered = knowledge.filter((item) => item.status === "已掌握").length;

  return (
    <div className="page">
      <section className="stat-strip">
        <div className="stat-card"><span>主题总数</span><strong>{knowledge.length}</strong><small>按优先级推进</small></div>
        <div className="stat-card"><span>学习中</span><strong>{knowledge.filter((item) => item.status === "学习中").length}</strong><small>当前活跃主题</small></div>
        <div className="stat-card"><span>已掌握</span><strong>{mastered}</strong><small>{knowledge.length ? Math.round((mastered / knowledge.length) * 100) : 0}% 完成</small></div>
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
                <div className="topic-row" key={topic.id}>
                  <div className="topic-name">
                    <strong>{topic.name}</strong>
                    <Badge tone={topic.priority === "高频" ? "red" : topic.priority === "必考" ? "gold" : "blue"}>{topic.priority}</Badge>
                  </div>
                  <select value={topic.status} onChange={(event) => setTopicStatus(topic.id, event.target.value as TopicStatus)}>
                    {topicStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

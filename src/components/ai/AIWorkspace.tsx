import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Bot, CheckCircle2, ClipboardCopy, Database, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import { buildAIContextSummary, createAIService, getDeepSeekStatus } from "../../services/ai";
import { useAppData } from "../../store/appStore";
import type { AICapability, AIProposal, AIProposalPayload, AIProviderId, AIProviderStatus } from "../../types/ai";
import type { AppState } from "../../types/domain";

const capabilities: Array<{ id: AICapability; label: string; description: string }> = [
  { id: "ask", label: "知识问答", description: "基于授权数据回答，不写入" },
  { id: "review", label: "面试复盘草稿", description: "生成复盘，确认后写入面试记录" },
  { id: "resume", label: "简历要点翻译", description: "经历 → 量化岗语言，可复制" },
];

// 公网展示版（npm run build:demo）：静态托管没有本地代理，隐藏真实 DeepSeek 入口，仅保留本地 Mock。
// __DEMO_MODE__ 由 vite.config.ts 的 define 构建期注入。
const DEMO_MODE = __DEMO_MODE__;

const errorMessages: Record<string, string> = {
  AI_NOT_CONFIGURED: "本地服务尚未配置 DeepSeek API 密钥（请在项目根目录 .env 中配置后重启）。",
  AI_PROXY_UNAVAILABLE: "本地 AI 代理未启动（先运行 npm run dev:full 或 npm run ai:proxy）。",
  AUTHENTICATION_FAILED: "DeepSeek API 密钥无效。",
  INSUFFICIENT_BALANCE: "DeepSeek 账户余额不足。",
  RATE_LIMITED: "DeepSeek 当前请求过多，请稍后重试。",
  TIMEOUT: "DeepSeek 请求超时。",
  CONTEXT_TOO_LARGE: "本次授权的上下文过大，请减少选择内容。",
};

export function AIWorkspace({ state }: { state: AppState }) {
  const { settings, setSettings, updateInterview } = useAppData();
  const [runtimeProvider, setRuntimeProvider] = useState<AIProviderId>(settings.aiProvider);
  const [providerStatus, setProviderStatus] = useState<AIProviderStatus | null>(null);
  const service = useMemo(() => createAIService(runtimeProvider, state), [runtimeProvider, state]);

  const [capability, setCapability] = useState<AICapability>("ask");
  const [interviewIds, setInterviewIds] = useState<string[]>([]);
  const [applicationIds, setApplicationIds] = useState<string[]>([]);
  const [topicIds, setTopicIds] = useState<string[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [targetInterviewId, setTargetInterviewId] = useState("");
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState<AIProposal | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (runtimeProvider !== "deepseek") return;
    getDeepSeekStatus().then(setProviderStatus).catch(() => setProviderStatus(null));
  }, [runtimeProvider]);

  const selectInterview = (id: string) => {
    setTargetInterviewId(id);
    if (id) setInterviewIds((current) => (current.includes(id) ? current : [...current, id]));
  };

  const context = { interviewIds, applicationIds, topicIds, projectIds };
  const contextSummary = useMemo(() => buildAIContextSummary(context, state), [context, state]);

  const generate = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const next = await service.generate({ capability, context, userInstruction: instruction });
      setProposal(next);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "AI_REQUEST_FAILED";
      setError(errorMessages[code] ?? "真实 AI 暂时不可用，没有数据发生变化。");
    } finally {
      setLoading(false);
    }
  };

  const switchProvider = (provider: AIProviderId) => {
    setRuntimeProvider(provider);
    setSettings({ aiProvider: provider });
    setError("");
  };

  const reject = () => {
    if (!proposal) return;
    setProposal({ ...proposal, status: "rejected" });
  };

  const accept = () => {
    if (!proposal || proposal.status !== "draft") return;
    const payload = proposal.payload;
    if (payload.kind === "review" && targetInterviewId) {
      const lines = [
        `复盘总结：${payload.summary}`,
        `做得好：${payload.strengths.map((item) => `· ${item}`).join("\n")}`,
        `不足：${payload.weaknesses.map((item) => `· ${item}`).join("\n")}`,
        `下一步：${payload.nextActions.map((item) => `· ${item}`).join("\n")}`,
      ].join("\n");
      updateInterview(targetInterviewId, { review: lines });
    }
    setProposal({ ...proposal, status: "accepted" });
  };

  const copyResume = async () => {
    if (proposal?.payload.kind !== "resume") return;
    try {
      await navigator.clipboard.writeText(proposal.payload.translated);
      setError("已复制到剪贴板。");
    } catch {
      setError("复制失败，请手动选择文本。");
    }
  };

  const updatePayload = (patch: ReviewPatch) =>
    setProposal((current) =>
      current && current.payload.kind === "review"
        ? { ...current, payload: { ...current.payload, ...patch } }
        : current,
    );

  const targetInterview = state.interviews.find((item) => item.id === targetInterviewId);

  return (
    <div className="ai-workspace">
      <div className="ai-header">
        <div>
          <h2><Bot size={18} /> AI 助手</h2>
          <p>只读取你勾选的上下文；生成的是草稿，写入必须确认</p>
        </div>
        <div className="provider-switch">
          <button type="button" className={runtimeProvider === "mock" ? "active" : ""} onClick={() => switchProvider("mock")}>Mock 本地规则</button>
          {!DEMO_MODE ? (
            <>
              <button type="button" className={runtimeProvider === "deepseek" ? "active" : ""} onClick={() => switchProvider("deepseek")}>DeepSeek 真实 API</button>
              {runtimeProvider === "deepseek" ? <span className={`provider-status ${providerStatus?.configured ? "ok" : "no"}`}>{providerStatus === null ? "检测中…" : providerStatus.configured ? "已配置" : "未配置密钥"}</span> : null}
            </>
          ) : (
            <span className="provider-status no">公网展示版 · 仅本地 Mock</span>
          )}
        </div>
      </div>

      {!proposal ? (
        <form onSubmit={generate} className="ai-layout">
          <aside className="ai-context">
            <div className="ai-section-title"><ShieldCheck size={15} /><strong>本次读取授权</strong></div>
            {capability === "review" ? (
              <label className="ai-field">复盘对象（确认后写入这条记录）
                <select value={targetInterviewId} onChange={(event) => selectInterview(event.target.value)}>
                  <option value="">选择一条面试记录…</option>
                  {state.interviews.map((item) => <option key={item.id} value={item.id}>{item.company} · {item.round} · {item.date}</option>)}
                </select>
              </label>
            ) : null}
            <ContextGroup title={`面试记录（${state.interviews.length}）`} items={state.interviews.map((item) => ({ id: item.id, label: `${item.company} · ${item.round}` }))} values={interviewIds} onToggle={(id) => setInterviewIds((current) => toggleValue(current, id))} />
            <ContextGroup title={`投递（${state.applications.length}）`} items={state.applications.slice(0, 30).map((item) => ({ id: item.id, label: `${item.company}（${item.status}）` }))} values={applicationIds} onToggle={(id) => setApplicationIds((current) => toggleValue(current, id))} />
            <ContextGroup title={`知识主题（${state.knowledge.length}）`} items={state.knowledge.map((item) => ({ id: item.id, label: item.name }))} values={topicIds} onToggle={(id) => setTopicIds((current) => toggleValue(current, id))} />
            <ContextGroup title={`项目（${state.projects.length}）`} items={state.projects.map((item) => ({ id: item.id, label: item.name }))} values={projectIds} onToggle={(id) => setProjectIds((current) => toggleValue(current, id))} />
          </aside>

          <main className="ai-request">
            <div className="ai-capability-grid">
              {capabilities.map((item) => (
                <button type="button" key={item.id} className={capability === item.id ? "active" : ""} onClick={() => setCapability(item.id)}>
                  <strong>{item.label}</strong><small>{item.description}</small>
                </button>
              ))}
            </div>
            <label className="ai-field">你的要求
              <textarea
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder={capability === "resume" ? "粘贴一段经历原文，例如：研究非线性系统辨识方法，应用于状态估计与最优控制…" : capability === "review" ? "例如：基于记录的问题，生成一份面试复盘草稿。" : "例如：根据我选择的主题，给出最可能被问到的 5 个问题与回答要点。"}
                rows={4}
              />
            </label>
            <div className="ai-read-summary"><Database size={14} /><div><strong>即将读取</strong>{contextSummary.map((item) => <span key={item}>{item}</span>)}</div></div>
            <p className="ai-permission">点击下方按钮即授权本次读取。{runtimeProvider === "deepseek" ? "只有已勾选的最小上下文会通过本地安全代理发送给 DeepSeek（密钥只在服务端）。" : "Mock AI 不访问网络。"} 两种提供商都不会自动修改正式数据。</p>
            {error ? <div className="ai-error"><XCircle size={15} /><span>{error}</span>{runtimeProvider === "deepseek" ? <button type="button" className="soft small" onClick={() => switchProvider("mock")}>改用本地 Mock</button> : null}</div> : null}
            <button className="primary" type="submit" disabled={loading}>{loading ? "正在生成…" : "授权本次读取并生成"}</button>
          </main>
        </form>
      ) : (
        <ProposalReview
          proposal={proposal}
          targetInterview={targetInterview}
          onAccept={accept}
          onReject={reject}
          onRestart={() => setProposal(null)}
          onCopy={copyResume}
          onPatch={updatePayload}
        />
      )}
    </div>
  );
}

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function ContextGroup({ title, items, values, onToggle }: { title: string; items: Array<{ id: string; label: string }>; values: string[]; onToggle: (id: string) => void }) {
  return (
    <fieldset className="ai-context-group">
      <legend>{title}</legend>
      <div className="ai-context-list">
        {items.map((item) => (
          <label key={item.id}><input type="checkbox" checked={values.includes(item.id)} onChange={() => onToggle(item.id)} /><span>{item.label}</span></label>
        ))}
        {!items.length ? <small>暂无数据</small> : null}
      </div>
    </fieldset>
  );
}

function ProposalReview({ proposal, targetInterview, onAccept, onReject, onRestart, onCopy, onPatch }: {
  proposal: AIProposal;
  targetInterview?: { company: string; round: string };
  onAccept: () => void;
  onReject: () => void;
  onRestart: () => void;
  onCopy: () => void;
  onPatch: (patch: ReviewPatch) => void;
}) {
  const payload = proposal.payload;
  const final = proposal.status !== "draft";
  const isReview = payload.kind === "review";
  const patch = (value: ReviewPatch) => onPatch(value);
  return (
    <div className="ai-review">
      <div className="ai-review-meta">
        <div><strong>{proposal.providerId} / {proposal.modelId}</strong><span>置信度 {Math.round((proposal.confidence ?? 0) * 100)}% · {new Date(proposal.generatedAt).toLocaleString("zh-CN")}</span></div>
        <button type="button" className="soft small" onClick={onRestart}>重新选择上下文</button>
      </div>
      <div className="ai-read-summary"><Database size={14} /><div><strong>本次实际使用的数据</strong>{proposal.contextSummary.map((item) => <span key={item}>{item}</span>)}</div></div>

      <section className="ai-draft">
        <span className="ai-eyebrow">{isReview ? `待确认复盘草稿 · 将写入「${targetInterview?.company ?? payload.company} · ${payload.round}」` : payload.kind === "resume" ? "简历要点翻译 · 不写入" : "回答 · 不写入"}</span>

        {payload.kind === "answer" ? <p className="ai-answer">{payload.content}</p> : null}

        {payload.kind === "resume" ? (
          <>
            <div className="ai-field"><label>原文</label><p className="ai-mono">{payload.original}</p></div>
            <div className="ai-field"><label>量化岗语言</label><p className="ai-mono ai-translated">{payload.translated}</p></div>
            <div className="ai-keywords">{payload.keywords.map((item) => <span key={item} className="badge green">{item}</span>)}</div>
          </>
        ) : null}

        {isReview ? (
          <>
            <label className="ai-field">公司<input disabled={final} value={payload.company} onChange={(event) => patch({ company: event.target.value })} /></label>
            <label className="ai-field">轮次<input disabled={final} value={payload.round} onChange={(event) => patch({ round: event.target.value })} /></label>
            <label className="ai-field">复盘总结<textarea disabled={final} value={payload.summary} onChange={(event) => patch({ summary: event.target.value })} /></label>
            <label className="ai-field">做得好<textarea disabled={final} value={payload.strengths.join("\n")} onChange={(event) => patch({ strengths: splitLines(event.target.value) })} /></label>
            <label className="ai-field">不足<textarea disabled={final} value={payload.weaknesses.join("\n")} onChange={(event) => patch({ weaknesses: splitLines(event.target.value) })} /></label>
            <label className="ai-field">下一步<textarea disabled={final} value={payload.nextActions.join("\n")} onChange={(event) => patch({ nextActions: splitLines(event.target.value) })} /></label>
          </>
        ) : null}
      </section>

      {!final ? (
        <div className="ai-review-actions">
          <button type="button" className="soft" onClick={onReject}><XCircle size={15} /> 拒绝</button>
          <button type="button" className="primary" onClick={onAccept} disabled={isReview && !targetInterview}>
            <CheckCircle2 size={15} /> {isReview ? "确认并写入面试记录" : payload.kind === "resume" ? "确认翻译" : "确认已读"}
          </button>
          {payload.kind === "resume" ? <button type="button" className="soft" onClick={onCopy}><ClipboardCopy size={15} /> 复制翻译</button> : null}
        </div>
      ) : (
        <div className={`ai-final ${proposal.status}`}><Sparkles size={15} /><p>{proposal.status === "accepted" ? (isReview ? "复盘已写入面试记录。" : "已确认，没有写入任何对象。") : "草稿已拒绝，没有写入正式数据。"}</p></div>
      )}
    </div>
  );
}

// 复盘草稿的可编辑字段
type ReviewPatch = Partial<Pick<Extract<AIProposalPayload, { kind: "review" }>, "company" | "round" | "summary" | "strengths" | "weaknesses" | "nextActions">>;

function splitLines(value: string) {
  return value.split(/\n/).map((item) => item.trim()).filter(Boolean);
}

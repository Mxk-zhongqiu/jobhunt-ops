import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Bot, CheckCircle2, ClipboardCopy, Database, Plus, ShieldCheck, Sparkles, Trash2, XCircle } from "lucide-react";
import { buildAIContextSummary, createAIService, getDeepSeekStatus } from "../../services/ai";
import { useAppData } from "../../store/appStore";
import type { AICapability, AIProposal, AIProposalPayload, AIProviderId, AIProviderStatus, KnowledgeDraftPoint } from "../../types/ai";
import type { PointDepth } from "../../types/domain";
import type { AppState } from "../../types/domain";

const capabilities: Array<{ id: AICapability; label: string; description: string }> = [
  { id: "ask", label: "知识问答", description: "基于授权数据回答，不写入" },
  { id: "review", label: "面试复盘草稿", description: "生成复盘，确认后写入面试记录" },
  { id: "resume", label: "简历要点翻译", description: "经历 → 量化岗语言，可复制" },
  { id: "knowledge", label: "知识点生成", description: "为主题生成知识点草稿，确认后写入" },
];

const errorMessages: Record<string, string> = {
  AI_NOT_CONFIGURED: "本地服务尚未配置 DeepSeek API 密钥（请在项目根目录 .env 中配置后重启）。",
  AI_NOT_CONFIGURED_CLOUD: "云端 AI 未配置：需要 .env 中配置 VITE_AI_PROXY_URL（Cloudflare Worker 地址）与 Firebase 公网配置，且 Worker 环境变量已设置 DeepSeek 密钥。",
  AI_PROXY_UNAVAILABLE: "本地 AI 代理未启动（先运行 npm run dev:full 或 npm run ai:proxy）。",
  AUTH_REQUIRED: "使用真实 DeepSeek 需要先登录账号（右上角登录 / 注册）。",
  FORBIDDEN: "该账号未获授权使用 AI（云端已配置邮箱白名单）。",
  AUTHENTICATION_FAILED: "DeepSeek API 密钥无效。",
  INSUFFICIENT_BALANCE: "DeepSeek 账户余额不足。",
  RATE_LIMITED: "DeepSeek 当前请求过多，请稍后重试。",
  TIMEOUT: "DeepSeek 请求超时。",
  CONTEXT_TOO_LARGE: "本次授权的上下文过大，请减少选择内容。",
  EMPTY_RESPONSE: "云端 AI 返回为空（模型未生成内容），请重试。",
  OUTPUT_TRUNCATED: "AI 输出超长被截断：请减少生成数量（如 4–6 个知识点）或精简要求后重试。",
  INVALID_REQUEST: "请求参数有误，请重试或反馈。",
  INVALID_PROVIDER_RESPONSE: "AI 返回内容格式不符合预期，请重试。",
  UNEXPECTED_DRAFT_TYPE: "AI 返回了错误的草稿类型，请重试。",
};

export function AIWorkspace({ state }: { state: AppState }) {
  const { settings, setSettings, updateInterview, addPoints, replacePoints } = useAppData();
  const [runtimeProvider, setRuntimeProvider] = useState<AIProviderId>(settings.aiProvider);
  const [providerStatus, setProviderStatus] = useState<AIProviderStatus | null>(null);
  const service = useMemo(() => createAIService(runtimeProvider, state), [runtimeProvider, state]);

  const [capability, setCapability] = useState<AICapability>("ask");
  const [interviewIds, setInterviewIds] = useState<string[]>([]);
  const [applicationIds, setApplicationIds] = useState<string[]>([]);
  const [topicIds, setTopicIds] = useState<string[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [targetInterviewId, setTargetInterviewId] = useState("");
  const [targetTopicId, setTargetTopicId] = useState("");
  /** 知识点写入方式：追加（默认）或替换主题全部知识点 */
  const [writeMode, setWriteMode] = useState<"append" | "replace">("append");
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

  const selectTopic = (id: string) => {
    setTargetTopicId(id);
    if (id) setTopicIds((current) => (current.includes(id) ? current : [...current, id]));
  };

  /** 知识主题多选框：勾选时若尚未指定「生成目标」，自动把该主题设为目标，避免"生成了却写不进去" */
  const toggleTopicContext = (id: string) => {
    const willAdd = !topicIds.includes(id);
    setTopicIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
    if (capability !== "knowledge") return;
    if (willAdd && !targetTopicId) setTargetTopicId(id);
    if (!willAdd && targetTopicId === id) setTargetTopicId("");
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
      setError(errorMessages[code] ?? `真实 AI 暂时不可用（错误码 ${code}），没有数据发生变化。`);
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
    if (payload.kind === "knowledge" && targetTopicId) {
      const points = payload.points.map((point) => ({ title: point.title, summary: point.summary, depth: point.depth, mastered: false }));
      if (writeMode === "replace") replacePoints(targetTopicId, points);
      else addPoints(targetTopicId, points);
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

  const patchReview = (patch: ReviewPatch) =>
    setProposal((current) =>
      current && current.payload.kind === "review"
        ? { ...current, payload: { ...current.payload, ...patch } }
        : current,
    );

  const patchKnowledge = (patch: KnowledgePatch) =>
    setProposal((current) =>
      current && current.payload.kind === "knowledge"
        ? { ...current, payload: { ...current.payload, ...patch } }
        : current,
    );

  const targetInterview = state.interviews.find((item) => item.id === targetInterviewId);
  const targetTopic = state.knowledge.find((item) => item.id === targetTopicId);

  return (
    <div className="ai-workspace">
      <div className="ai-header">
        <div>
          <h2><Bot size={18} /> AI 助手</h2>
          <p>只读取你勾选的上下文；生成的是草稿，写入必须确认</p>
        </div>
        <div className="provider-switch">
          <button type="button" className={runtimeProvider === "mock" ? "active" : ""} onClick={() => switchProvider("mock")}>Mock 本地规则</button>
          <button type="button" className={runtimeProvider === "deepseek" ? "active" : ""} onClick={() => switchProvider("deepseek")}>DeepSeek 真实 API</button>
          {runtimeProvider === "deepseek" ? <span className={`provider-status ${providerStatus?.configured ? "ok" : "no"}`}>{providerStatus === null ? "检测中…" : providerStatus.configured ? (providerStatus.source === "cloud" ? "已配置（云端）" : "已配置（本地）") : "未配置密钥"}</span> : null}
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
            {capability === "knowledge" ? (
              <>
                <label className="ai-field">生成目标 <b className="required-mark">必选</b>（确认后写入这个主题的知识点）
                  <select value={targetTopicId} onChange={(event) => selectTopic(event.target.value)}>
                    <option value="">选择一个知识主题…</option>
                    {state.knowledge.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}（已有 {(item.points ?? []).length} 个知识点）</option>
                    ))}
                  </select>
                </label>
                {!targetTopicId ? <p className="ai-hint-warn">请先选择「生成目标」主题，否则确认按钮不可用。</p> : null}
              </>
            ) : null}
            <ContextGroup title={`面试记录（${state.interviews.length}）`} items={state.interviews.map((item) => ({ id: item.id, label: `${item.company} · ${item.round}` }))} values={interviewIds} onToggle={(id) => setInterviewIds((current) => toggleValue(current, id))} />
            <ContextGroup title={`投递（${state.applications.length}）`} items={state.applications.slice(0, 30).map((item) => ({ id: item.id, label: `${item.company}（${item.status}）` }))} values={applicationIds} onToggle={(id) => setApplicationIds((current) => toggleValue(current, id))} />
            <ContextGroup title={`知识主题（${state.knowledge.length}）`} items={state.knowledge.map((item) => ({ id: item.id, label: item.name }))} values={topicIds} onToggle={toggleTopicContext} />
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
                placeholder={capability === "resume" ? "粘贴一段经历原文，例如：研究非线性系统辨识方法，应用于状态估计与最优控制…" : capability === "review" ? "例如：基于记录的问题，生成一份面试复盘草稿。" : capability === "knowledge" ? "例如：为「时间序列」生成 8 个知识点，含公式、关键结论与面试必答法，按基础/进阶标注。" : "例如：根据我选择的主题，给出最可能被问到的 5 个问题与回答要点。"}
                rows={4}
              />
            </label>
            <div className="ai-read-summary"><Database size={14} /><div><strong>即将读取</strong>{contextSummary.map((item) => <span key={item}>{item}</span>)}</div></div>
            <p className="ai-permission">点击下方按钮即授权本次读取。{runtimeProvider === "deepseek" ? "只有已勾选的最小上下文会通过安全代理发送给 DeepSeek（本地或云端，密钥只在服务端；云端链路需先登录）。" : "Mock AI 不访问网络。"} 两种提供商都不会自动修改正式数据。</p>
            {error ? <div className="ai-error"><XCircle size={15} /><span>{error}</span>{runtimeProvider === "deepseek" ? <button type="button" className="soft small" onClick={() => switchProvider("mock")}>改用本地 Mock</button> : null}</div> : null}
            {capability === "knowledge" && !targetTopicId ? <p className="ai-hint-warn">「知识点生成」需要先选择生成目标主题，才能生成并确认写入。</p> : null}
            <button className="primary" type="submit" disabled={loading || (capability === "knowledge" && !targetTopicId)}>{loading ? "正在生成…" : "授权本次读取并生成"}</button>
          </main>
        </form>
      ) : (
        <ProposalReview
          proposal={proposal}
          targetInterview={targetInterview}
          targetTopic={targetTopic}
          writeMode={writeMode}
          onWriteModeChange={setWriteMode}
          onAccept={accept}
          onReject={reject}
          onRestart={() => setProposal(null)}
          onCopy={copyResume}
          onPatchReview={patchReview}
          onPatchKnowledge={patchKnowledge}
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

function ProposalReview({ proposal, targetInterview, targetTopic, writeMode, onWriteModeChange, onAccept, onReject, onRestart, onCopy, onPatchReview, onPatchKnowledge }: {
  proposal: AIProposal;
  targetInterview?: { company: string; round: string };
  targetTopic?: { name: string };
  writeMode: "append" | "replace";
  onWriteModeChange: (mode: "append" | "replace") => void;
  onAccept: () => void;
  onReject: () => void;
  onRestart: () => void;
  onCopy: () => void;
  onPatchReview: (patch: ReviewPatch) => void;
  onPatchKnowledge: (patch: KnowledgePatch) => void;
}) {
  const payload = proposal.payload;
  const final = proposal.status !== "draft";
  const isReview = payload.kind === "review";
  const isKnowledge = payload.kind === "knowledge";
  const patch = (value: ReviewPatch) => onPatchReview(value);

  const patchPoint = (index: number, patchValue: Partial<KnowledgeDraftPoint>) => {
    if (payload.kind !== "knowledge") return;
    const points = payload.points.map((point, i) => (i === index ? { ...point, ...patchValue } : point));
    onPatchKnowledge({ points });
  };
  const addDraftPoint = () => {
    if (payload.kind !== "knowledge") return;
    onPatchKnowledge({ points: [...payload.points, { title: "", summary: "", depth: undefined }] });
  };
  const removeDraftPoint = (index: number) => {
    if (payload.kind !== "knowledge") return;
    onPatchKnowledge({ points: payload.points.filter((_, i) => i !== index) });
  };

  return (
    <div className="ai-review">
      <div className="ai-review-meta">
        <div><strong>{proposal.providerId} / {proposal.modelId}</strong><span>置信度 {Math.round((proposal.confidence ?? 0) * 100)}% · {new Date(proposal.generatedAt).toLocaleString("zh-CN")}</span></div>
        <button type="button" className="soft small" onClick={onRestart}>重新选择上下文</button>
      </div>
      <div className="ai-read-summary"><Database size={14} /><div><strong>本次实际使用的数据</strong>{proposal.contextSummary.map((item) => <span key={item}>{item}</span>)}</div></div>

      <section className="ai-draft">
        <span className="ai-eyebrow">
          {isReview
            ? `待确认复盘草稿 · 将写入「${targetInterview?.company ?? payload.company} · ${payload.round}」`
            : payload.kind === "resume"
              ? "简历要点翻译 · 不写入"
              : payload.kind === "knowledge"
                ? `待确认知识点草稿 · 将写入「${targetTopic?.name ?? "（未选择生成目标）"}」`
                : "回答 · 不写入"}
        </span>

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

        {isKnowledge ? (
          <>
            <div className="ai-field"><label>目标主题（展示用，实际写入以左侧选择为准）</label><input disabled={final} value={payload.topicName} onChange={(event) => onPatchKnowledge({ topicName: event.target.value })} /></div>
            {payload.points.length ? (
              <div className="knowledge-draft">
                {payload.points.map((point, index) => (
                  <div className="knowledge-draft-point" key={index}>
                    <div className="knowledge-draft-row">
                      <input
                        disabled={final}
                        value={point.title}
                        onChange={(event) => patchPoint(index, { title: event.target.value })}
                        placeholder={`知识点 ${index + 1}：标题`}
                      />
                      <select
                        disabled={final}
                        value={point.depth ?? ""}
                        onChange={(event) => patchPoint(index, { depth: (event.target.value === "" ? undefined : event.target.value) as PointDepth | undefined })}
                      >
                        <option value="">深度</option>
                        <option value="基础">基础</option>
                        <option value="进阶">进阶</option>
                      </select>
                      <button type="button" className="soft small danger-icon" disabled={final} onClick={() => removeDraftPoint(index)} aria-label="删除知识点"><Trash2 size={13} /></button>
                    </div>
                    <textarea
                      disabled={final}
                      value={point.summary}
                      onChange={(event) => patchPoint(index, { summary: event.target.value })}
                      rows={2}
                      placeholder="核心要点：公式 / 结论 / 面试答法…"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty">草稿中没有知识点，点击下方「添加知识点」手动补充。</p>
            )}
            <div className="ai-keywords">
              <button type="button" className="soft small" disabled={final} onClick={addDraftPoint}><Plus size={13} /> 添加知识点</button>
            </div>
            {!final ? (
              <div className="write-mode-toggle">
                <span>写入方式：</span>
                <button type="button" className={writeMode === "append" ? "active" : ""} onClick={() => onWriteModeChange("append")}>追加</button>
                <button type="button" className={writeMode === "replace" ? "active" : ""} onClick={() => onWriteModeChange("replace")}>替换全部</button>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {!final ? (
        <div className="ai-review-actions">
          {isKnowledge && !targetTopic ? (
            <p className="ai-hint-warn full-width">未选择生成目标主题：点击「重新选择上下文」，在左侧「生成目标」下拉中选择要写入的主题后，确认按钮才会可用。</p>
          ) : null}
          <button type="button" className="soft" onClick={onReject}><XCircle size={15} /> 拒绝</button>
          <button
            type="button"
            className="primary"
            onClick={onAccept}
            disabled={(isReview && !targetInterview) || (isKnowledge && !targetTopic)}
          >
            <CheckCircle2 size={15} />
            {isReview ? "确认并写入面试记录" : payload.kind === "resume" ? "确认翻译" : isKnowledge ? "确认并写入知识主题" : "确认已读"}
          </button>
          {payload.kind === "resume" ? <button type="button" className="soft" onClick={onCopy}><ClipboardCopy size={15} /> 复制翻译</button> : null}
        </div>
      ) : (
        <div className={`ai-final ${proposal.status}`}><Sparkles size={15} /><p>{proposal.status === "accepted" ? (isReview ? "复盘已写入面试记录。" : isKnowledge ? "知识点已写入知识主题。" : "已确认，没有写入任何对象。") : "草稿已拒绝，没有写入正式数据。"}</p></div>
      )}
    </div>
  );
}

// 复盘草稿的可编辑字段
type ReviewPatch = Partial<Pick<Extract<AIProposalPayload, { kind: "review" }>, "company" | "round" | "summary" | "strengths" | "weaknesses" | "nextActions">>;

// 知识点草稿的可编辑字段
type KnowledgePatch = Partial<Pick<Extract<AIProposalPayload, { kind: "knowledge" }>, "topicName" | "points">>;

function splitLines(value: string) {
  return value.split(/\n/).map((item) => item.trim()).filter(Boolean);
}

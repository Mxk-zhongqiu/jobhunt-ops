// 简历板块主页面：版本标签页（完整简历展示）+ 素材库抽屉 + 行内编辑 + 导出 + AI 经历改写

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Download, FileText, PanelRightClose, PanelRightOpen, Plus, Sparkles, X } from "lucide-react";
import { useAppData } from "../store/appStore";
import { useResumeData, findBlock } from "../store/resumeStore";
import { createAIService } from "../services/ai";
import type { AIProposal } from "../types/ai";
import type { ResumeCategory, ResumeJobIntent } from "../types/resume";
import { RESUME_CATEGORY_LABEL } from "../types/resume";
import { MaterialDrawer } from "../components/resume/MaterialDrawer";
import { ResumeDocument, type ResumeEditState } from "../components/resume/ResumeDocument";
import { MaterialEditor, type MaterialPatch } from "../components/resume/MaterialEditor";
import { downloadResume, materialToText, versionToBodyHtml } from "../utils/resumeExport";

type RewriteStyle = "量化岗语言" | "视觉算法岗语言" | "通用精炼";

interface AIRewriteState {
  materialId: string;
  style: RewriteStyle;
  loading: boolean;
  error: string;
  proposal: AIProposal | null;
}

const rewriteStyles: RewriteStyle[] = ["量化岗语言", "视觉算法岗语言", "通用精炼"];

export function ResumePage() {
  const resume = useResumeData();
  const appStore = useAppData();
  const aiService = useMemo(
    () => createAIService(appStore.settings.aiProvider, appStore),
    [appStore.settings.aiProvider, appStore],
  );

  const [activeVersionId, setActiveVersionId] = useState<string>(resume.versions[0]?.id ?? "");
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [editing, setEditing] = useState<ResumeEditState | null>(null);
  const [editingJobIntent, setEditingJobIntent] = useState(false);
  const [addingCategory, setAddingCategory] = useState<ResumeCategory | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [newVersionOpen, setNewVersionOpen] = useState(false);
  const [aiRewrite, setAIRewrite] = useState<AIRewriteState | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const activeVersion = resume.versions.find((item) => item.id === activeVersionId) ?? resume.versions[0];
  const state = { materials: resume.materials, versions: resume.versions };

  const handleSaveEdit = (materialId: string, patch: MaterialPatch, customize: boolean) => {
    if (!activeVersion) return;
    if (customize) {
      resume.updateBlock(activeVersion.id, materialId, {
        override: { title: patch.title, subtitle: patch.subtitle, content: patch.content },
      });
    } else {
      resume.updateMaterial(materialId, {
        title: patch.title,
        subtitle: patch.subtitle,
        fields: patch.fields,
        content: patch.content,
        tags: patch.tags,
      });
    }
    setEditing(null);
  };

  const handleStartEdit = (materialId: string) => {
    if (!activeVersion) return;
    const block = findBlock(activeVersion, materialId);
    setEditing({ materialId, customize: Boolean(block?.override) });
  };

  const handleMoveBlock = (materialId: string, direction: -1 | 1) => {
    if (activeVersion) resume.moveBlock(activeVersion.id, materialId, direction);
  };

  const handleRemoveBlock = (materialId: string) => {
    const material = resume.materials.find((item) => item.id === materialId);
    if (!activeVersion) return;
    if (window.confirm(`把「${material?.title ?? "该素材"}」从当前版本移出？（素材保留在素材库）`)) {
      resume.removeBlock(activeVersion.id, materialId);
    }
  };

  const handleRestoreOriginal = (materialId: string) => {
    if (!activeVersion) return;
    resume.updateBlock(activeVersion.id, materialId, { override: undefined });
  };

  const handleSaveJobIntent = (patch: Partial<ResumeJobIntent>) => {
    if (!activeVersion) return;
    resume.updateVersion(activeVersion.id, { jobIntent: { ...activeVersion.jobIntent, ...patch } });
    setEditingJobIntent(false);
  };

  const handleAttachmentChange = (file: File | null) => {
    if (!activeVersion) return;
    if (!file) {
      resume.updateVersion(activeVersion.id, { attachment: null });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      resume.updateVersion(activeVersion.id, { attachment: { fileName: file.name } });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      resume.updateVersion(activeVersion.id, { attachment: { fileName: file.name, fileUrl: String(reader.result) } });
    };
    reader.readAsDataURL(file);
  };

  const handleAddMaterial = (patch: MaterialPatch) => {
    if (!addingCategory) return;
    resume.addMaterial({ category: addingCategory, ...patch });
    setAddingCategory(null);
  };

  const handleAddVersion = (name: string, targetRole: string) => {
    const id = resume.addVersion({ name, targetRole });
    setActiveVersionId(id);
    setNewVersionOpen(false);
  };

  // ── AI 改写 ──
  const aiMaterial = aiRewrite ? resume.materials.find((item) => item.id === aiRewrite.materialId) : undefined;

  const openRewrite = (materialId: string) => {
    setAIRewrite({ materialId, style: "量化岗语言", loading: false, error: "", proposal: null });
  };

  const generateRewrite = async () => {
    if (!aiRewrite || !aiMaterial) return;
    setAIRewrite({ ...aiRewrite, loading: true, error: "" });
    try {
      const proposal = await aiService.generate({
        capability: "rewrite",
        context: { interviewIds: [], applicationIds: [], topicIds: [], projectIds: [] },
        userInstruction: `把下面这段简历经历改写成「${aiRewrite.style}」风格：保留真实事实不夸大，突出该方向岗位看重的点，输出精炼的要点式表达，保持逐条要点（不要合并成一段）。\n\n原文：\n${materialToText(aiMaterial)}`,
      });
      setAIRewrite({ ...aiRewrite, loading: false, proposal });
    } catch {
      setAIRewrite({ ...aiRewrite, loading: false, error: "生成失败，请检查 AI 提供商配置后重试。" });
    }
  };

  const applyRewrite = (target: "version" | "library" | "new") => {
    if (!aiRewrite || !aiMaterial || !aiRewrite.proposal) return;
    const payload = aiRewrite.proposal.payload;
    if (payload.kind !== "rewrite") return;
    const bullets = payload.rewritten.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!bullets.length) return;
    if (target === "version" && activeVersion) {
      resume.updateBlock(activeVersion.id, aiMaterial.id, { override: { content: bullets } });
    } else if (target === "library") {
      resume.updateMaterial(aiMaterial.id, { content: bullets });
    } else {
      resume.addMaterial({
        category: aiMaterial.category,
        title: `${aiMaterial.title}（AI 改写）`,
        subtitle: aiMaterial.subtitle,
        fields: aiMaterial.fields,
        content: bullets,
        tags: [...aiMaterial.tags, "AI"],
      });
    }
    setAIRewrite(null);
  };

  const exportPdf = () => {
    setExportOpen(false);
    // 打印视图已挂载到 body（.resume-print），用户选择"另存为 PDF"
    window.print();
  };

  return (
    <div className="page">
      <section className="card resume-topbar">
        <div className="resume-tabs">
          {resume.versions.map((version) => (
            <button
              key={version.id}
              type="button"
              className={`resume-tab${activeVersion?.id === version.id ? " active" : ""}`}
              onClick={() => {
                setActiveVersionId(version.id);
                setEditing(null);
                setEditingJobIntent(false);
              }}
            >
              {version.name}
              <span className="resume-tab-role">{version.targetRole}</span>
              {resume.versions.length > 1 && activeVersion?.id === version.id ? (
                <span
                  className="resume-tab-del"
                  role="button"
                  tabIndex={0}
                  title="删除此版本"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (window.confirm(`删除版本「${version.name}」？素材库内容不受影响。`)) {
                      resume.removeVersion(version.id);
                      setActiveVersionId(resume.versions.find((item) => item.id !== version.id)?.id ?? "");
                      setEditing(null);
                    }
                  }}
                >
                  <X size={12} />
                </span>
              ) : null}
            </button>
          ))}
          <button type="button" className="resume-tab add" onClick={() => setNewVersionOpen((v) => !v)}>
            <Plus size={14} /> 新建版本
          </button>
        </div>

        {newVersionOpen ? (
          <NewVersionForm onCancel={() => setNewVersionOpen(false)} onCreate={handleAddVersion} />
        ) : null}

        <div className="resume-toolbar">
          <button type="button" className="soft" onClick={() => setDrawerOpen((v) => !v)}>
            {drawerOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
            {drawerOpen ? "收起素材库" : "展开素材库"}
          </button>
          <div className="export-menu">
            <button type="button" className="primary" onClick={() => setExportOpen((v) => !v)} disabled={!activeVersion}>
              <Download size={15} /> 导出简历
            </button>
            {exportOpen && activeVersion ? (
              <div className="export-dropdown">
                <button type="button" onClick={exportPdf}><FileText size={14} /> 导出 PDF（打印/另存为）</button>
                <button type="button" onClick={() => { setExportOpen(false); downloadResume(state, activeVersion, "markdown"); }}><FileText size={14} /> 导出 Markdown</button>
                <button type="button" onClick={() => { setExportOpen(false); downloadResume(state, activeVersion, "html"); }}><FileText size={14} /> 导出 HTML</button>
                <button type="button" onClick={() => { setExportOpen(false); downloadResume(state, activeVersion, "text"); }}><FileText size={14} /> 导出纯文本（粘贴表单）</button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {!resume.versions.length ? (
        <section className="card">
          <div className="empty">
            还没有简历版本。点击「新建版本」创建第一个版本，再从素材库纳入板块。
            <div className="resume-empty-actions">
              <button type="button" className="primary" onClick={() => setNewVersionOpen(true)}><Plus size={14} /> 新建版本</button>
            </div>
          </div>
        </section>
      ) : activeVersion ? (
        <div className="resume-layout">
          <ResumeDocument
            state={state}
            version={activeVersion}
            editing={editing}
            editingJobIntent={editingJobIntent}
            onStartEdit={handleStartEdit}
            onCancelEdit={() => setEditing(null)}
            onSaveEdit={handleSaveEdit}
            onStartJobIntentEdit={() => setEditingJobIntent(true)}
            onSaveJobIntent={handleSaveJobIntent}
            onCancelJobIntentEdit={() => setEditingJobIntent(false)}
            onRemoveBlock={handleRemoveBlock}
            onMoveBlock={handleMoveBlock}
            onRestoreOriginal={handleRestoreOriginal}
            onAIRewrite={openRewrite}
            onAttachmentChange={handleAttachmentChange}
          />
          {drawerOpen ? (
            <MaterialDrawer
              materials={resume.materials}
              version={activeVersion}
              onAddMaterial={(category) => setAddingCategory(category)}
              onEditMaterial={(materialId) => handleStartEdit(materialId)}
              onRemoveMaterial={(materialId) => {
                const material = resume.materials.find((item) => item.id === materialId);
                if (window.confirm(`从素材库删除「${material?.title ?? "该素材"}」？将从所有版本中移出，不可恢复。`)) {
                  resume.removeMaterial(materialId);
                }
              }}
              onToggleInVersion={(materialId, included) => {
                if (included) resume.addBlock(activeVersion.id, materialId);
                else resume.removeBlock(activeVersion.id, materialId);
              }}
              onAIRewrite={openRewrite}
              onClose={() => setDrawerOpen(false)}
            />
          ) : null}
        </div>
      ) : null}

      {/* 新增素材弹层 */}
      {addingCategory ? (
        <div className="resume-ai-overlay" onClick={() => setAddingCategory(null)}>
          <div className="resume-ai-card" onClick={(event) => event.stopPropagation()}>
            <MaterialEditor
              material={undefined}
              resolved={{ title: "", content: [] }}
              category={addingCategory}
              allowCustomize={false}
              onSave={handleAddMaterial}
              onCancel={() => setAddingCategory(null)}
            />
          </div>
        </div>
      ) : null}

      {/* AI 改写弹层 */}
      {aiRewrite ? (
        <div className="resume-ai-overlay" onClick={() => setAIRewrite(null)}>
          <div className="resume-ai-card" onClick={(event) => event.stopPropagation()}>
            <div className="resume-ai-head">
              <strong><Sparkles size={14} /> AI 经历改写</strong>
              <button type="button" className="icon-btn" onClick={() => setAIRewrite(null)} aria-label="关闭"><X size={15} /></button>
            </div>
            <p className="ai-permission">只把下方这一条素材内容发送给 AI（最小上下文），生成结果需你确认后才写入。</p>

            {aiMaterial ? (
              <>
                <label className="ai-field">目标风格
                  <select
                    value={aiRewrite.style}
                    onChange={(event) => setAIRewrite({ ...aiRewrite, style: event.target.value as RewriteStyle })}
                    disabled={aiRewrite.loading || Boolean(aiRewrite.proposal)}
                  >
                    {rewriteStyles.map((style) => <option key={style} value={style}>{style}</option>)}
                  </select>
                </label>
                <div className="resume-ai-send">
                  <span className="ai-eyebrow">发送内容（素材）</span>
                  <pre className="ai-mono">{materialToText(aiMaterial)}</pre>
                </div>
              </>
            ) : null}

            {aiRewrite.error ? <div className="ai-error">{aiRewrite.error}</div> : null}

            {!aiRewrite.proposal ? (
              <div className="inline-actions">
                <button type="button" className="primary" onClick={generateRewrite} disabled={aiRewrite.loading || !aiMaterial}>
                  {aiRewrite.loading ? "生成中…" : "生成改写"}
                </button>
                <button type="button" className="soft" onClick={() => setAIRewrite(null)}>取消</button>
              </div>
            ) : aiRewrite.proposal.payload.kind === "rewrite" ? (
              <>
                <div className="resume-ai-cols">
                  <div className="resume-ai-col">
                    <span className="ai-eyebrow">原文</span>
                    <pre className="ai-mono">{aiRewrite.proposal.payload.original}</pre>
                  </div>
                  <div className="resume-ai-col">
                    <span className="ai-eyebrow">改写（{aiRewrite.style}）</span>
                    <pre className="ai-mono ai-translated">{aiRewrite.proposal.payload.rewritten}</pre>
                  </div>
                </div>
                {aiRewrite.proposal.payload.notes ? <p className="ai-hint-warn">{aiRewrite.proposal.payload.notes}</p> : null}
                <div className="inline-actions">
                  <button type="button" className="primary" onClick={() => applyRewrite("version")}><Check size={13} /> 应用到当前版本</button>
                  <button type="button" className="soft" onClick={() => applyRewrite("library")}>更新素材库</button>
                  <button type="button" className="soft" onClick={() => applyRewrite("new")}>另存为新素材</button>
                  <button type="button" className="soft" onClick={() => setAIRewrite(null)}>放弃</button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* 打印视图（PDF 导出）：portal 到 body，仅打印时显示 */}
      {activeVersion
        ? createPortal(
            <div className="resume-print" ref={printRef} dangerouslySetInnerHTML={{ __html: versionToBodyHtml(state, activeVersion) }} />,
            document.body,
          )
        : null}
    </div>
  );
}

function NewVersionForm({ onCancel, onCreate }: { onCancel: () => void; onCreate: (name: string, targetRole: string) => void }) {
  const [name, setName] = useState("");
  const [targetRole, setTargetRole] = useState("");
  return (
    <div className="resume-edit resume-new-version">
      <div className="resume-edit-grid">
        <label className="ai-field">版本名称
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="如：数据分析岗版" autoFocus />
        </label>
        <label className="ai-field">目标岗位
          <input value={targetRole} onChange={(event) => setTargetRole(event.target.value)} placeholder="如：数据分析实习生（2026 届秋招）" />
        </label>
      </div>
      <div className="inline-actions">
        <button type="button" className="primary small" onClick={() => { if (name.trim()) onCreate(name.trim(), targetRole.trim()); }} disabled={!name.trim()}>
          <Check size={13} /> 创建版本
        </button>
        <button type="button" className="soft small" onClick={onCancel}><X size={13} /> 取消</button>
      </div>
    </div>
  );
}

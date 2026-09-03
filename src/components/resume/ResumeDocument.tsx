// 简历文档：当前版本的完整简历（所见即所得），每个板块/条目可直接编辑、
// AI 改写、纳入/移出、排序；顶部为基本信息 + 求职意向（招聘软件字段）。

import { useRef, useState } from "react";
import { ChevronDown, ChevronUp, FileText, Paperclip, Pencil, RotateCcw, Sparkles, X } from "lucide-react";
import type { ResumeJobIntent, ResumeMaterial, ResumeState, ResumeVersion } from "../../types/resume";
import { RESUME_CATEGORY_LABEL } from "../../types/resume";
import { findBlock } from "../../store/resumeStore";
import { buildResumeSections, type ResumeRenderItem } from "../../utils/resumeExport";
import { MaterialEditor, type MaterialPatch } from "./MaterialEditor";

export interface ResumeEditState {
  materialId: string;
  customize: boolean;
}

interface ResumeDocumentProps {
  state: ResumeState;
  version: ResumeVersion;
  editing: ResumeEditState | null;
  editingJobIntent: boolean;
  onStartEdit: (materialId: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (materialId: string, patch: MaterialPatch, customize: boolean) => void;
  onStartJobIntentEdit: () => void;
  onSaveJobIntent: (patch: Partial<ResumeJobIntent>) => void;
  onCancelJobIntentEdit: () => void;
  onRemoveBlock: (materialId: string) => void;
  onMoveBlock: (materialId: string, direction: -1 | 1) => void;
  onRestoreOriginal: (materialId: string) => void;
  onAIRewrite: (materialId: string) => void;
  onAttachmentChange: (file: File | null) => void;
}

export function ResumeDocument(props: ResumeDocumentProps) {
  const { state, version, editing, editingJobIntent } = props;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sections = buildResumeSections(state, version);
  const basic = state.materials.find((item) => item.category === "basic");

  return (
    <div className="resume-doc">
      {/* 基本信息 */}
      <section className="resume-section resume-header">
        {editing && editing.materialId === basic?.id ? (
          <MaterialEditor
            material={basic}
            resolved={{ title: basic.title, subtitle: basic.subtitle, content: basic.content }}
            category="basic"
            allowCustomize={false}
            onSave={(patch) => props.onSaveEdit(basic.id, patch, false)}
            onCancel={props.onCancelEdit}
          />
        ) : basic ? (
          <div className="resume-header-row">
            <div className="resume-header-main">
              <h2 className="resume-name">{basic.title}</h2>
              <p className="resume-meta">
                {Object.entries(basic.fields)
                  .filter(([, value]) => Boolean(value))
                  .map(([, value]) => value)
                  .join(" · ")}
              </p>
            </div>
            <div className="resume-item-actions static">
              <button type="button" className="soft small" onClick={() => props.onStartEdit(basic.id)}><Pencil size={12} /> 编辑基本信息</button>
            </div>
          </div>
        ) : (
          <div className="empty">暂无基本信息，请先在素材库新增。</div>
        )}
      </section>

      {/* 求职意向（招聘软件字段，按版本独立） */}
      <section className="resume-section">
        <div className="resume-section-head">
          <h2>{RESUME_CATEGORY_LABEL.jobIntent}</h2>
          <span className="resume-hint">招聘软件表单常用字段 · 按版本独立</span>
        </div>
        {editingJobIntent ? (
          <JobIntentForm
            intent={version.jobIntent}
            onSave={props.onSaveJobIntent}
            onCancel={props.onCancelJobIntentEdit}
          />
        ) : (
          <div className="resume-header-row">
            <div className="resume-job-lines">
              {version.jobIntent.positions ? <p><strong>求职意向：</strong>{version.jobIntent.positions}</p> : null}
              <p className="resume-meta">
                {[version.jobIntent.city && `期望城市：${version.jobIntent.city}`, version.jobIntent.expectSalary && `期望薪资：${version.jobIntent.expectSalary}`, version.jobIntent.availability && `到岗时间：${version.jobIntent.availability}`].filter(Boolean).join(" · ")}
              </p>
              {version.jobIntent.tags ? <p className="resume-meta">技能标签：{version.jobIntent.tags}</p> : null}
            </div>
            <div className="resume-item-actions static">
              <button type="button" className="soft small" onClick={props.onStartJobIntentEdit}><Pencil size={12} /> 编辑求职意向</button>
            </div>
          </div>
        )}
      </section>

      {/* 各板块 */}
      {sections.map((section) => (
        <section className="resume-section" key={section.category}>
          <div className="resume-section-head">
            <h2>{section.label}</h2>
            <span className="resume-hint">{section.items.length} 项</span>
          </div>
          <div className="resume-items">
            {section.items.map((item, index) => (
              <ResumeItem
                key={item.material.id}
                item={item}
                version={version}
                index={index}
                total={section.items.length}
                editing={editing?.materialId === item.material.id ? editing : null}
                onStartEdit={() => props.onStartEdit(item.material.id)}
                onCancelEdit={props.onCancelEdit}
                onSaveEdit={(patch, customize) => props.onSaveEdit(item.material.id, patch, customize)}
                onRemove={() => props.onRemoveBlock(item.material.id)}
                onMove={(direction) => props.onMoveBlock(item.material.id, direction)}
                onRestore={() => props.onRestoreOriginal(item.material.id)}
                onAIRewrite={() => props.onAIRewrite(item.material.id)}
              />
            ))}
          </div>
        </section>
      ))}

      {/* 投递附件 */}
      <section className="resume-section">
        <div className="resume-section-head">
          <h2>投递附件</h2>
          <span className="resume-hint">上传 PDF 简历，投递时随版本使用</span>
        </div>
        {version.attachment ? (
          <div className="resume-attachment">
            <FileText size={15} />
            <span className="resume-attachment-name">{version.attachment.fileName}</span>
            <button type="button" className="soft small" onClick={() => fileInputRef.current?.click()}><Paperclip size={12} /> 替换</button>
            <button type="button" className="soft small danger-icon" onClick={() => props.onAttachmentChange(null)}><X size={12} /> 移除</button>
          </div>
        ) : (
          <div className="resume-attachment empty">
            <button type="button" className="soft small" onClick={() => fileInputRef.current?.click()}><Paperclip size={12} /> 上传附件（PDF）</button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          hidden
          onChange={(event) => props.onAttachmentChange(event.target.files?.[0] ?? null)}
        />
      </section>
    </div>
  );
}

function ResumeItem({ item, version, index, total, editing, onStartEdit, onCancelEdit, onSaveEdit, onRemove, onMove, onRestore, onAIRewrite }: {
  item: ResumeRenderItem;
  version: ResumeVersion;
  index: number;
  total: number;
  editing: ResumeEditState | null;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (patch: MaterialPatch, customize: boolean) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  onRestore: () => void;
  onAIRewrite: () => void;
}) {
  const { material, title, subtitle, content, customized } = item;
  const block = findBlock(version, material.id);

  if (editing) {
    return (
      <MaterialEditor
        material={material}
        resolved={{ title, subtitle, content }}
        category={material.category}
        allowCustomize={material.category !== "basic"}
        defaultCustomize={editing.customize}
        onSave={onSaveEdit}
        onCancel={onCancelEdit}
      />
    );
  }

  return (
    <div className={`resume-item${customized ? " customized" : ""}`}>
      <div className="resume-item-main">
        <div className="resume-item-title">
          <strong>{title}</strong>
          {customized ? <span className="resume-customized-badge">已定制</span> : null}
          {subtitle ? <span className="resume-item-sub">{subtitle}</span> : null}
        </div>
        {Object.entries(material.fields).filter(([, value]) => Boolean(value)).length ? (
          <p className="resume-item-fields">
            {Object.entries(material.fields)
              .filter(([, value]) => Boolean(value))
              .map(([key, value]) => `${key}：${value}`)
              .join(" · ")}
          </p>
        ) : null}
        {content.length ? (
          <ul className="resume-bullets">
            {content.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="resume-item-actions">
        {customized ? (
          <button type="button" className="icon-btn" onClick={onRestore} title="恢复素材原文" aria-label="恢复素材原文"><RotateCcw size={13} /></button>
        ) : null}
        <button type="button" className="icon-btn" onClick={onAIRewrite} title="AI 改写" aria-label="AI 改写"><Sparkles size={13} /></button>
        <button type="button" className="icon-btn" onClick={onStartEdit} title="编辑" aria-label="编辑"><Pencil size={13} /></button>
        <button type="button" className="icon-btn" onClick={() => onMove(-1)} disabled={index === 0} title="上移" aria-label="上移"><ChevronUp size={13} /></button>
        <button type="button" className="icon-btn" onClick={() => onMove(1)} disabled={index === total - 1} title="下移" aria-label="下移"><ChevronDown size={13} /></button>
        <button type="button" className="icon-btn" onClick={onRemove} title="从版本移出（素材保留在素材库）" aria-label="从版本移出"><X size={13} /></button>
      </div>
    </div>
  );
}

function JobIntentForm({ intent, onSave, onCancel }: {
  intent: ResumeJobIntent;
  onSave: (patch: Partial<ResumeJobIntent>) => void;
  onCancel: () => void;
}) {
  const [positions, setPositions] = useState(intent.positions);
  const [city, setCity] = useState(intent.city);
  const [expectSalary, setExpectSalary] = useState(intent.expectSalary);
  const [availability, setAvailability] = useState(intent.availability);
  const [tags, setTags] = useState(intent.tags);

  return (
    <div className="resume-edit">
      <div className="resume-edit-grid">
        <label className="ai-field">目标岗位
          <input value={positions} onChange={(event) => setPositions(event.target.value)} placeholder="如：量化研究实习生 / 量化开发实习生" />
        </label>
        <label className="ai-field">期望城市
          <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="如：北京 / 上海 / 深圳" />
        </label>
        <label className="ai-field">期望薪资
          <input value={expectSalary} onChange={(event) => setExpectSalary(event.target.value)} placeholder="如：面议" />
        </label>
        <label className="ai-field">到岗时间
          <input value={availability} onChange={(event) => setAvailability(event.target.value)} placeholder="如：2026 年 9 月起可全职实习" />
        </label>
        <label className="ai-field resume-edit-full">技能标签
          <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="如：Python、多因子、统计套利" />
        </label>
      </div>
      <div className="inline-actions">
        <button
          type="button"
          className="primary small"
          onClick={() => onSave({ positions: positions.trim(), city: city.trim(), expectSalary: expectSalary.trim(), availability: availability.trim(), tags: tags.trim() })}
        >
          保存求职意向
        </button>
        <button type="button" className="soft small" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}

// 素材编辑器：行内编辑素材（新增 / 修改 / 版本定制）
// 版本定制（customize）只覆盖 标题/副标题/要点，字段与标签始终属于素材库。

import { useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import type { ResumeCategory, ResumeMaterial } from "../../types/resume";
import { RESUME_CATEGORY_LABEL } from "../../types/resume";

export interface MaterialPatch {
  title: string;
  subtitle?: string;
  fields: Record<string, string>;
  content: string[];
  tags: string[];
}

interface MaterialEditorProps {
  /** 已有素材（undefined = 新增） */
  material?: ResumeMaterial;
  /** 当前展示内容（版本覆盖后的视图，作为编辑起始值） */
  resolved: { title: string; subtitle?: string; content: string[] };
  category: ResumeCategory;
  /** 是否允许"仅当前版本定制"（basic 素材不允许） */
  allowCustomize: boolean;
  /** 默认勾选版本定制 */
  defaultCustomize?: boolean;
  onSave: (patch: MaterialPatch, customize: boolean) => void;
  onCancel: () => void;
}

export function MaterialEditor({ material, resolved, category, allowCustomize, defaultCustomize = false, onSave, onCancel }: MaterialEditorProps) {
  const [title, setTitle] = useState(resolved.title);
  const [subtitle, setSubtitle] = useState(resolved.subtitle ?? "");
  const [fields, setFields] = useState<Array<[string, string]>>(Object.entries(material?.fields ?? {}));
  const [contentText, setContentText] = useState((resolved.content ?? []).join("\n"));
  const [tagsText, setTagsText] = useState((material?.tags ?? []).join("、"));
  const [customize, setCustomize] = useState(defaultCustomize && allowCustomize);

  const updateField = (index: number, key: string, value: string) => {
    setFields((list) => list.map((item, i) => (i === index ? [key, value] : item)));
  };
  const removeField = (index: number) => setFields((list) => list.filter((_, i) => i !== index));

  const save = () => {
    if (!title.trim()) return;
    const patch: MaterialPatch = {
      title: title.trim(),
      subtitle: subtitle.trim() || undefined,
      fields: Object.fromEntries(
        fields
          .filter(([key, value]) => key.trim() && value.trim())
          .map(([key, value]) => [key.trim(), value.trim()]),
      ),
      content: contentText.split("\n").map((line) => line.trim()).filter(Boolean),
      tags: tagsText.split(/[,，、]/).map((tag) => tag.trim()).filter(Boolean),
    };
    onSave(patch, customize);
  };

  const isNew = !material;

  return (
    <div className="resume-edit">
      <div className="resume-edit-head">
        <strong>{isNew ? `新增${RESUME_CATEGORY_LABEL[category]}素材` : `编辑：${material.title}`}</strong>
        <span className="muted">{RESUME_CATEGORY_LABEL[category]}</span>
      </div>

      <label className="ai-field">
        {category === "basic" ? "姓名" : "标题"}
        <input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus placeholder={category === "basic" ? "如：张三" : "如：A股多因子选股策略"} />
      </label>

      {category !== "basic" ? (
        <label className="ai-field">
          副标题（单位 / 时间 / 一句话定位，可留空）
          <input value={subtitle} onChange={(event) => setSubtitle(event.target.value)} placeholder="如：某科技有限公司 / 2026.08~2026.09" />
        </label>
      ) : null}

      <div className="ai-field">
        <span>结构化字段（键：值，如 时间 / 角色 / 代码链接）</span>
        <div className="resume-fields-editor">
          {fields.map(([key, value], index) => (
            <div className="resume-field-row" key={index}>
              <input value={key} onChange={(event) => updateField(index, event.target.value, value)} placeholder="字段名" disabled={customize} />
              <input value={value} onChange={(event) => updateField(index, key, event.target.value)} placeholder="内容" disabled={customize} />
              <button type="button" className="icon-btn" onClick={() => removeField(index)} aria-label="删除字段" disabled={customize}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {!customize ? (
            <button type="button" className="soft small" onClick={() => setFields((list) => [...list, ["", ""]])}>
              <Plus size={13} /> 添加字段
            </button>
          ) : null}
        </div>
      </div>

      <label className="ai-field">
        要点列表（每行一条，导出/打印时逐条列出）
        <textarea
          value={contentText}
          onChange={(event) => setContentText(event.target.value)}
          rows={Math.max(3, contentText.split("\n").length)}
          placeholder={"每行一条要点…"}
        />
      </label>

      {!customize ? (
        <label className="ai-field">
          标签（逗号分隔：量化 / 视觉 / 通用，便于识别素材适用方向）
          <input value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="如：量化、通用" disabled={!material && category === "basic"} />
        </label>
      ) : null}

      {allowCustomize && !isNew ? (
        <div className="scope-toggle">
          <label className="scope-radio">
            <input type="radio" checked={!customize} onChange={() => setCustomize(false)} />
            更新素材库（所有引用版本同步）
          </label>
          <label className="scope-radio">
            <input type="radio" checked={customize} onChange={() => setCustomize(true)} />
            仅当前版本定制（带"已定制"标记，可恢复原文）
          </label>
        </div>
      ) : null}
      {customize ? <p className="ai-hint-warn">版本定制只保存 标题/副标题/要点，字段与标签保持素材库内容。</p> : null}

      <div className="inline-actions">
        <button type="button" className="primary small" onClick={save} disabled={!title.trim()}>
          <Check size={13} /> {isNew ? "创建素材" : "保存"}
        </button>
        <button type="button" className="soft small" onClick={onCancel}>
          <X size={13} /> 取消
        </button>
      </div>
    </div>
  );
}

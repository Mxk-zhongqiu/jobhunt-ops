// 素材库抽屉：集中管理全部素材（新增/编辑/删除/AI 改写），并快速纳入/移出版本

import { Check, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import type { ResumeCategory, ResumeMaterial, ResumeVersion } from "../../types/resume";
import { RESUME_CATEGORY_LABEL, RESUME_CATEGORY_ORDER } from "../../types/resume";
import { findBlock } from "../../store/resumeStore";

interface MaterialDrawerProps {
  materials: ResumeMaterial[];
  version: ResumeVersion | undefined;
  onAddMaterial: (category: ResumeCategory) => void;
  onEditMaterial: (id: string) => void;
  onRemoveMaterial: (id: string) => void;
  onToggleInVersion: (id: string, included: boolean) => void;
  onAIRewrite: (id: string) => void;
  onClose: () => void;
}

export function MaterialDrawer({ materials, version, onAddMaterial, onEditMaterial, onRemoveMaterial, onToggleInVersion, onAIRewrite, onClose }: MaterialDrawerProps) {
  const groups = RESUME_CATEGORY_ORDER.filter((category) => category !== "jobIntent")
    .map((category) => ({
      category,
      items: materials.filter((material) => material.category === category),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <aside className="resume-drawer">
      <div className="resume-drawer-head">
        <strong>素材库</strong>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="收起素材库"><X size={15} /></button>
      </div>
      <p className="resume-drawer-hint">素材改动全局同步；「纳入版本」把素材加入当前简历版本。</p>

      {groups.map((group) => (
        <div className="resume-drawer-group" key={group.category}>
          <h3>
            <span>{RESUME_CATEGORY_LABEL[group.category]}</span>
            <button type="button" className="link-btn" onClick={() => onAddMaterial(group.category)}>
              <Plus size={12} /> 新增
            </button>
          </h3>
          <div className="resume-mat-list">
            {group.items.map((material) => {
              const inVersion = version ? Boolean(findBlock(version, material.id)) : false;
              return (
                <div className="resume-mat-row" key={material.id}>
                  <div className="resume-mat-main">
                    <span className="resume-mat-title">{material.title}</span>
                    {material.tags.length ? (
                      <span className="resume-mat-tags">
                        {material.tags.map((tag) => (
                          <span className={`badge ${tag === "量化" ? "gold" : tag === "视觉" ? "blue" : "muted"}`} key={tag}>{tag}</span>
                        ))}
                      </span>
                    ) : null}
                  </div>
                  <div className="resume-mat-actions">
                    {version ? (
                      inVersion ? (
                        <span className="resume-mat-in" title="已纳入本版本，点击移出" onClick={() => onToggleInVersion(material.id, false)}>
                          <Check size={10} /> 已纳入
                        </span>
                      ) : (
                        <button type="button" className="resume-mat-out" title="纳入当前版本" onClick={() => onToggleInVersion(material.id, true)}>
                          <Plus size={10} /> 纳入
                        </button>
                      )
                    ) : null}
                    <button type="button" className="icon-btn" onClick={() => onEditMaterial(material.id)} aria-label="编辑素材"><Pencil size={13} /></button>
                    <button type="button" className="icon-btn" onClick={() => onAIRewrite(material.id)} aria-label="AI 改写"><Sparkles size={13} /></button>
                    <button type="button" className="icon-btn" onClick={() => onRemoveMaterial(material.id)} aria-label="删除素材"><Trash2 size={13} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {!groups.length ? <div className="empty">素材库为空，点击各分类「新增」创建素材。</div> : null}
    </aside>
  );
}

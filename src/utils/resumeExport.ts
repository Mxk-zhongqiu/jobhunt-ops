// 简历渲染与导出：页面文档、PDF 打印（window.print）、Markdown / HTML / 纯文本 共用同一套渲染逻辑，
// 保证"页面所见 = 导出版本"。

import type { ResumeCategory, ResumeMaterial, ResumeState, ResumeVersion } from "../types/resume";
import { RESUME_CATEGORY_LABEL, RESUME_CATEGORY_ORDER } from "../types/resume";
import { resolvedMaterial } from "../store/resumeStore";
import { downloadText } from "./io";

export interface ResumeRenderItem {
  material: ResumeMaterial;
  title: string;
  subtitle?: string;
  content: string[];
  customized: boolean;
}

export interface ResumeRenderSection {
  category: ResumeCategory;
  label: string;
  items: ResumeRenderItem[];
}

/** 按版本组织好的简历文档结构（板块固定顺序，版本内素材按 order 排序） */
export function buildResumeSections(state: ResumeState, version: ResumeVersion): ResumeRenderSection[] {
  const sections: ResumeRenderSection[] = [];
  for (const category of RESUME_CATEGORY_ORDER) {
    if (category === "basic" || category === "jobIntent") continue; // 单独渲染
    const blocks = [...version.blocks].sort((a, b) => a.order - b.order);
    const items: ResumeRenderItem[] = [];
    for (const block of blocks) {
      const material = state.materials.find((item) => item.id === block.materialId);
      if (!material || material.category !== category) continue;
      const resolved = resolvedMaterial(material, version);
      items.push({ material, ...resolved });
    }
    if (items.length) sections.push({ category, label: RESUME_CATEGORY_LABEL[category], items });
  }
  return sections;
}

/** 素材 → 纯文本（供 AI 改写上下文） */
export function materialToText(material: ResumeMaterial): string {
  const lines: string[] = [];
  if (material.title) lines.push(material.title);
  if (material.subtitle) lines.push(material.subtitle);
  for (const [key, value] of Object.entries(material.fields)) {
    if (value) lines.push(`${key}：${value}`);
  }
  for (const line of material.content) lines.push(`- ${line}`);
  return lines.join("\n");
}

function basicMeta(material: ResumeMaterial): string {
  return Object.entries(material.fields)
    .filter(([, value]) => Boolean(value))
    .map(([, value]) => value)
    .join(" · ");
}

function jobIntentLines(version: ResumeVersion): string[] {
  const intent = version.jobIntent;
  const lines: string[] = [];
  if (intent.positions) lines.push(`求职意向：${intent.positions}`);
  const meta = [
    intent.city ? `期望城市：${intent.city}` : "",
    intent.expectSalary ? `期望薪资：${intent.expectSalary}` : "",
    intent.availability ? `到岗时间：${intent.availability}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  if (meta) lines.push(meta);
  if (intent.tags) lines.push(`技能标签：${intent.tags}`);
  return lines;
}

function basicMaterial(state: ResumeState): ResumeMaterial | undefined {
  return state.materials.find((item) => item.category === "basic");
}

// ─── Markdown ───

export function versionToMarkdown(state: ResumeState, version: ResumeVersion): string {
  const lines: string[] = [];
  const basic = basicMaterial(state);
  lines.push(`# ${basic?.title ?? version.name} · 简历（${version.name}）`);
  if (version.jobIntent.positions) lines.push(`> 求职意向：${version.jobIntent.positions}`);
  lines.push("");

  if (basic) {
    lines.push("## 基本信息");
    for (const [key, value] of Object.entries(basic.fields)) {
      if (value) lines.push(`- ${key}：${value}`);
    }
    lines.push("");
  }

  lines.push("## 求职意向");
  for (const line of jobIntentLines(version)) lines.push(`- ${line}`);
  lines.push("");

  for (const section of buildResumeSections(state, version)) {
    lines.push(`## ${section.label}`);
    for (const item of section.items) {
      lines.push(`### ${item.title}`);
      if (item.subtitle) lines.push(`*${item.subtitle}*`);
      const fieldLines = Object.entries(item.material.fields)
        .filter(([, value]) => Boolean(value))
        .map(([key, value]) => `- ${key}：${value}`);
      if (fieldLines.length) lines.push(...fieldLines);
      for (const bullet of item.content) lines.push(`- ${bullet}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

// ─── 纯文本 ───

export function versionToText(state: ResumeState, version: ResumeVersion): string {
  const lines: string[] = [];
  const basic = basicMaterial(state);
  if (basic) {
    lines.push(basic.title);
    const meta = basicMeta(basic);
    if (meta) lines.push(meta);
    lines.push("");
  }
  for (const line of jobIntentLines(version)) lines.push(line);
  lines.push("");

  for (const section of buildResumeSections(state, version)) {
    lines.push(`【${section.label}】`);
    for (const item of section.items) {
      lines.push(item.title);
      if (item.subtitle) lines.push(item.subtitle);
      for (const [key, value] of Object.entries(item.material.fields)) {
        if (value) lines.push(`${key}：${value}`);
      }
      for (const bullet of item.content) lines.push(`· ${bullet}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

// ─── HTML（单文件 / 打印共用） ───

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SHEET_STYLE = `
.resume-sheet{font-family:"Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif;max-width:210mm;margin:0 auto;padding:14mm 16mm;color:#1f2937;background:#fff;line-height:1.55}
.resume-sheet h1{font-size:23px;margin:0 0 2px}
.resume-sheet .meta{font-size:12px;color:#4b5563}
.resume-sheet h2{font-size:15px;border-bottom:1.5px solid #1f2937;padding-bottom:3px;margin:14px 0 8px}
.resume-sheet h3{font-size:13.5px;margin:10px 0 2px}
.resume-sheet .sub{font-size:12px;color:#4b5563}
.resume-sheet .fields{font-size:12px;color:#4b5563;margin:2px 0}
.resume-sheet ul{margin:4px 0 8px;padding-left:18px}
.resume-sheet li{font-size:12.5px;line-height:1.65;margin:2px 0}
@media print{.resume-sheet{padding:0;max-width:none}}
`;

/** 简历正文 HTML（含内联样式），打印视图与 HTML 导出共用 */
export function versionToBodyHtml(state: ResumeState, version: ResumeVersion): string {
  const parts: string[] = [];
  const basic = basicMaterial(state);
  const jobLines = jobIntentLines(version);

  parts.push(`<style>${SHEET_STYLE}</style><div class="resume-sheet">`);
  if (basic) {
    parts.push(`<h1>${escapeHtml(basic.title)}</h1>`);
    const meta = basicMeta(basic);
    if (meta) parts.push(`<p class="meta">${escapeHtml(meta)}</p>`);
  }
  if (jobLines.length) {
    parts.push(`<h2>求职意向</h2>`);
    for (const line of jobLines) parts.push(`<p class="sub">${escapeHtml(line)}</p>`);
  }
  for (const section of buildResumeSections(state, version)) {
    parts.push(`<h2>${escapeHtml(section.label)}</h2>`);
    for (const item of section.items) {
      parts.push(`<h3>${escapeHtml(item.title)}</h3>`);
      if (item.subtitle) parts.push(`<p class="sub">${escapeHtml(item.subtitle)}</p>`);
      const fieldLines = Object.entries(item.material.fields)
        .filter(([, value]) => Boolean(value))
        .map(([key, value]) => `${key}：${value}`);
      if (fieldLines.length) parts.push(`<p class="fields">${escapeHtml(fieldLines.join(" · "))}</p>`);
      if (item.content.length) {
        parts.push(`<ul>${item.content.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`);
      }
    }
  }
  parts.push("</div>");
  return parts.join("\n");
}

/** 单文件 HTML 简历（可独立打开/部署） */
export function versionToFileHtml(state: ResumeState, version: ResumeVersion): string {
  const title = `${basicMaterial(state)?.title ?? "简历"} · ${version.name}`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;background:#eef0f2">
${versionToBodyHtml(state, version)}
</body>
</html>`;
}

// ─── 下载 ───

export type ResumeExportFormat = "markdown" | "html" | "text";

export function downloadResume(state: ResumeState, version: ResumeVersion, format: ResumeExportFormat) {
  const name = basicMaterial(state)?.title ?? "简历";
  if (format === "markdown") {
    downloadText(`${name}-${version.name}-${dateSuffix()}.md`, versionToMarkdown(state, version), "text/markdown;charset=utf-8");
  } else if (format === "html") {
    downloadText(`${name}-${version.name}-${dateSuffix()}.html`, versionToFileHtml(state, version), "text/html;charset=utf-8");
  } else {
    downloadText(`${name}-${version.name}-${dateSuffix()}.txt`, versionToText(state, version), "text/plain;charset=utf-8");
  }
}

function dateSuffix(): string {
  return new Date().toISOString().slice(0, 10);
}

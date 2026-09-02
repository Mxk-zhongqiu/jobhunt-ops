// 导入 / 导出工具：JSON 全量备份、投递 CSV、下载与状态校验

import type { AppState, Application } from "../types/domain";

/** 触发浏览器下载文本文件 */
export function downloadText(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** 校验导入对象是否为本系统的完整状态（防错误文件损坏数据） */
export function isAppState(value: unknown): value is AppState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.applications) &&
    Array.isArray(v.interviews) &&
    Array.isArray(v.weeklyPlans) &&
    Array.isArray(v.projects) &&
    Array.isArray(v.knowledge) &&
    typeof v.settings === "object" &&
    v.settings !== null
  );
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

/** 投递清单 → CSV（带 BOM，Excel 直接打开不乱码） */
export function applicationsToCsv(applications: Application[]): string {
  const headers = ["公司", "分层", "来源平台", "岗位", "岗位类型", "状态", "截止日", "投递日期", "链接", "备注", "下一步"];
  const rows = applications.map((item) =>
    [
      item.company,
      item.tier,
      item.platform ?? "",
      item.position,
      item.positionKind,
      item.status,
      item.deadline ?? "",
      item.appliedAt ?? "",
      item.url ?? "",
      item.note ?? "",
      item.nextAction ?? "",
    ]
      .map((cell) => csvEscape(cell ?? ""))
      .join(","),
  );
  return `\uFEFF${[headers.map((cell) => csvEscape(cell)).join(","), ...rows].join("\r\n")}`;
}

export function dateStamp(date: Date = new Date()) {
  return date.toISOString().slice(0, 10);
}

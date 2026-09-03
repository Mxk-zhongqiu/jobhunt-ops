// 本地存储键管理（账号空间隔离）
// 语义：
//  - 游客槽（未登录 / 云端未配置）：固定键 jobhunt-ops-state-v1（向后兼容旧版本数据）；
//  - 账号槽（已登录）：键形如 jobhunt-ops-state-v1:<uid>，每个账号独立缓存，互不串扰；
//  - 已登录时界面只读写自己的账号槽；登出即切回游客槽，绝不在界面上残留上一账号数据。
// 云端文档（states/{uid} / resumes/{uid}）始终是登录态数据的真源，账号槽只是本机缓存。

export const STATE_KEY = "jobhunt-ops-state-v1";
export const RESUME_KEY = "jobhunt-ops-resume-v1";

/** 当前生效的本地键：登录后按 uid 分区，未登录回到游客槽 */
export function stateKey(uid?: string | null): string {
  return uid ? `${STATE_KEY}:${uid}` : STATE_KEY;
}

export function resumeKey(uid?: string | null): string {
  return uid ? `${RESUME_KEY}:${uid}` : RESUME_KEY;
}

/** 读取并解析 JSON；不存在或解析失败返回 null */
export function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** 写入 JSON；失败（如隐私模式）静默忽略，不阻断使用 */
export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** 递归去掉 createdAt/updatedAt 等时间戳字段（内容比较用，时间戳本身不代表用户改动） */
function stripVolatile(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (key === "createdAt" || key === "updatedAt") continue;
      out[key] = stripVolatile(item);
    }
    return out;
  }
  return value;
}

/** 忽略时间戳后的内容是否一致（用于判断本地槽是否仍是纯种子、是否与云端同内容） */
export function contentEquals(a: unknown, b: unknown): boolean {
  return JSON.stringify(stripVolatile(a)) === JSON.stringify(stripVolatile(b));
}

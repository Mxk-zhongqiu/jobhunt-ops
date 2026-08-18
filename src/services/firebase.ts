// Firebase 云同步（第二阶段：认证 + Firestore 跨设备同步 + AI 云函数）
// 安全边界：
//  - Firebase 的 apiKey 是"公网配置"（Firebase 设计上就随前端下发，不是机密）；
//  - 真正的机密是 DEEPSEEK_API_KEY——它只存在于云函数环境变量（functions/index.js），浏览器代码永远接触不到；
//  - 公网展示版（__DEMO_MODE__）与未配置 .env 时整模块禁用，应用完全退化为本地模式（localStorage），
//    保证展示版永远不会连上真实 Firebase 项目。

import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;

/** 云端能力是否可用：非展示版构建 + .env 已填 Firebase 公网配置 */
export const firebaseEnabled = !__DEMO_MODE__ && Boolean(apiKey && projectId);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let functions: Functions | null = null;

if (firebaseEnabled) {
  app = initializeApp({
    apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  });
  auth = getAuth(app);
  // 启用 IndexedDB 离线持久化（多标签页共享）：断网也能读本地缓存，恢复联网后自动同步
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  // 云函数区域必须与 functions/index.js 的部署区域一致（asia-east1）
  functions = getFunctions(app, "asia-east1");
}

export { auth, db, functions };

export interface SyncUser {
  uid: string;
  email: string;
}

export function toSyncUser(user: User | null): SyncUser | null {
  if (!user) return null;
  return { uid: user.uid, email: user.email ?? "" };
}

/** 订阅登录状态变化；返回退订函数。未启用云端时永不触发。 */
export function subscribeAuth(callback: (user: SyncUser | null) => void): () => void {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, (user) => callback(toSyncUser(user)));
}

/** Firebase Auth 错误 → 中文提示 */
export function mapAuthError(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
  const messages: Record<string, string> = {
    "auth/email-already-in-use": "该邮箱已注册，请直接登录。",
    "auth/invalid-email": "邮箱格式不正确。",
    "auth/weak-password": "密码至少需要 6 位。",
    "auth/user-not-found": "该邮箱尚未注册。",
    "auth/wrong-password": "邮箱或密码错误。",
    "auth/invalid-credential": "邮箱或密码错误。",
    "auth/too-many-requests": "尝试次数过多，请稍后再试。",
    "auth/network-request-failed": "网络错误，请检查网络后重试。",
  };
  return messages[code] ?? "操作失败，请稍后重试。";
}

export async function registerUser(email: string, password: string): Promise<SyncUser> {
  if (!auth) throw new Error("CLOUD_NOT_CONFIGURED");
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  return toSyncUser(credential.user) ?? { uid: "", email };
}

export async function loginUser(email: string, password: string): Promise<SyncUser> {
  if (!auth) throw new Error("CLOUD_NOT_CONFIGURED");
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return toSyncUser(credential.user) ?? { uid: "", email };
}

export async function logoutUser(): Promise<void> {
  if (!auth) return;
  await signOut(auth);
}

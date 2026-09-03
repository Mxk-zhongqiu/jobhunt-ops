// 简历板块数据存储：素材库 + 版本
// 持久化：localStorage（游客槽 jobhunt-ops-resume-v1；登录后按账号分区 jobhunt-ops-resume-v1:<uid>）
//         + Firebase 云同步（登录时并入 resumes/{uid}，与 appStore 同模式：账号空间隔离 + 认领确认，
//          绝不把游客/其它账号数据静默写入该账号云端）

import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { createSeedResumeState } from "../data/resumeSeed";
import { db, firebaseEnabled, subscribeAuth, type SyncUser } from "../services/firebase";
import type { ResumeMaterial, ResumeState, ResumeVersion, ResumeVersionBlock } from "../types/resume";
import { RESUME_CATEGORY_LABEL } from "../types/resume";
import { contentEquals, readJson, removeKey, resumeKey, writeJson } from "../utils/storage";

type ResumeAction =
  | { type: "add-material"; material: ResumeMaterial }
  | { type: "update-material"; id: string; patch: Partial<Omit<ResumeMaterial, "id">> }
  | { type: "remove-material"; id: string }
  | { type: "add-version"; version: ResumeVersion }
  | { type: "update-version"; id: string; patch: Partial<Omit<ResumeVersion, "id">> }
  | { type: "remove-version"; id: string }
  | { type: "add-block"; versionId: string; materialId: string }
  | { type: "remove-block"; versionId: string; materialId: string }
  | { type: "update-block"; versionId: string; materialId: string; patch: Partial<ResumeVersionBlock> }
  | { type: "move-block"; versionId: string; materialId: string; direction: -1 | 1 }
  | { type: "replace-state"; state: ResumeState };

function mergeState(seed: ResumeState, stored: Partial<ResumeState> | null): ResumeState {
  if (!stored) return seed;
  const storedMaterials = Array.isArray(stored.materials) ? stored.materials : seed.materials;
  const seedBasic = seed.materials.find((item) => item.category === "basic");
  // 基本信息字段补种：种子中 basic 素材新增的字段自动合并进已有数据（只补缺失键，保留用户已改的值）
  const materials = storedMaterials.map((material) =>
    material.category === "basic" && seedBasic ? { ...material, fields: { ...seedBasic.fields, ...material.fields } } : material,
  );
  const versions = Array.isArray(stored.versions) ? stored.versions : seed.versions;
  return migrateLeadershipToBlock({ materials, versions }, seed);
}

/**
 * 一次性迁移：旧版本把"任职"（如 党支部组织委员）放在基本信息字段里，
 * 现改为独立「任职经历」板块素材（lead-1），可在版本间自由纳入/移出。
 * 幂等：basic 无"任职"键后不再触发。
 */
function migrateLeadershipToBlock(state: ResumeState, seed: ResumeState): ResumeState {
  let removed = false;
  const materials = state.materials.map((material) => {
    if (material.category !== "basic" || !material.fields || !("任职" in material.fields)) return material;
    removed = true;
    const fields = { ...material.fields };
    delete fields["任职"];
    return { ...material, fields };
  });
  let nextMaterials = materials;
  if (!nextMaterials.some((item) => item.id === "lead-1")) {
    const lead = seed.materials.find((item) => item.id === "lead-1");
    if (lead) nextMaterials = [...nextMaterials, lead];
  }
  let versions = state.versions;
  if (removed) {
    // 任职原本随基本信息展示在两个版本，迁移后默认也纳入两个现有版本
    versions = versions.map((version) => {
      if (version.blocks.some((block) => block.materialId === "lead-1")) return version;
      const maxOrder = version.blocks.reduce((max, block) => Math.max(max, block.order), -1);
      return { ...version, blocks: [...version.blocks, { materialId: "lead-1", order: maxOrder + 1 }] };
    });
  }
  return { materials: nextMaterials, versions };
}

/** 读取指定本地槽并合并种子兜底（游客槽或某账号槽通用） */
function loadResumeFromKey(key: string): ResumeState {
  const seed = createSeedResumeState();
  const stored = readJson<Partial<ResumeState>>(key);
  return mergeState(seed, stored);
}

/** 已登录时若游客槽残留的旧简历数据与该账号云端快照一致（老版本单键数据），自动清理，避免重复询问认领 */
function maybeCleanGuestResumeSlot(remote: unknown): void {
  const guestRaw = readJson<Partial<ResumeState>>(resumeKey());
  if (!guestRaw) return;
  if (contentEquals(mergeState(createSeedResumeState(), guestRaw), remote)) removeKey(resumeKey());
}

function moveBlockWithinCategory(
  state: ResumeState,
  versionId: string,
  materialId: string,
  direction: -1 | 1,
): ResumeState {
  const version = state.versions.find((item) => item.id === versionId);
  if (!version) return state;
  const material = state.materials.find((item) => item.id === materialId);
  if (!material) return state;
  // 同类别素材按 order 排序，交换相邻两项
  const siblings = version.blocks
    .map((block) => ({ block, material: state.materials.find((m) => m.id === block.materialId) }))
    .filter((entry) => entry.material && entry.material.category === material.category)
    .sort((a, b) => a.block.order - b.block.order);
  const index = siblings.findIndex((entry) => entry.block.materialId === materialId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= siblings.length) return state;
  const [a, b] = [siblings[index].block, siblings[target].block];
  return {
    ...state,
    versions: state.versions.map((item) =>
      item.id === versionId
        ? {
            ...item,
            updatedAt: Date.now(),
            blocks: item.blocks.map((block) => {
              if (block.materialId === a.materialId) return { ...block, order: b.order };
              if (block.materialId === b.materialId) return { ...block, order: a.order };
              return block;
            }),
          }
        : item,
    ),
  };
}

function reducer(state: ResumeState, action: ResumeAction): ResumeState {
  switch (action.type) {
    case "add-material":
      return { ...state, materials: [...state.materials, action.material] };
    case "update-material":
      return {
        ...state,
        materials: state.materials.map((item) =>
          item.id === action.id ? { ...item, ...action.patch, updatedAt: Date.now() } : item,
        ),
      };
    case "remove-material": {
      // 从素材库删除：同时从所有版本的 blocks 中移除
      return {
        ...state,
        materials: state.materials.filter((item) => item.id !== action.id),
        versions: state.versions.map((version) => ({
          ...version,
          updatedAt: Date.now(),
          blocks: version.blocks.filter((block) => block.materialId !== action.id),
        })),
      };
    }
    case "add-version":
      return { ...state, versions: [...state.versions, action.version] };
    case "update-version":
      return {
        ...state,
        versions: state.versions.map((item) =>
          item.id === action.id ? { ...item, ...action.patch, updatedAt: Date.now() } : item,
        ),
      };
    case "remove-version":
      return { ...state, versions: state.versions.filter((item) => item.id !== action.id) };
    case "add-block": {
      const version = state.versions.find((item) => item.id === action.versionId);
      if (!version || version.blocks.some((block) => block.materialId === action.materialId)) return state;
      const maxOrder = version.blocks.reduce((max, block) => Math.max(max, block.order), -1);
      return {
        ...state,
        versions: state.versions.map((item) =>
          item.id === action.versionId
            ? { ...item, updatedAt: Date.now(), blocks: [...item.blocks, { materialId: action.materialId, order: maxOrder + 1 }] }
            : item,
        ),
      };
    }
    case "remove-block":
      return {
        ...state,
        versions: state.versions.map((item) =>
          item.id === action.versionId
            ? { ...item, updatedAt: Date.now(), blocks: item.blocks.filter((block) => block.materialId !== action.materialId) }
            : item,
        ),
      };
    case "update-block":
      return {
        ...state,
        versions: state.versions.map((item) =>
          item.id === action.versionId
            ? {
                ...item,
                updatedAt: Date.now(),
                blocks: item.blocks.map((block) =>
                  block.materialId === action.materialId ? { ...block, ...action.patch } : block,
                ),
              }
            : item,
        ),
      };
    case "move-block":
      return moveBlockWithinCategory(state, action.versionId, action.materialId, action.direction);
    case "replace-state":
      return mergeState(createSeedResumeState(), action.state);
    default:
      return state;
  }
}

export interface ResumeStoreValue extends ResumeState {
  addMaterial: (input: Omit<ResumeMaterial, "id" | "createdAt" | "updatedAt">) => string;
  updateMaterial: (id: string, patch: Partial<Omit<ResumeMaterial, "id">>) => void;
  removeMaterial: (id: string) => void;
  addVersion: (input: Omit<ResumeVersion, "id" | "createdAt" | "updatedAt" | "blocks" | "attachment" | "jobIntent"> & { jobIntent?: ResumeVersion["jobIntent"] }) => string;
  updateVersion: (id: string, patch: Partial<Omit<ResumeVersion, "id">>) => void;
  removeVersion: (id: string) => void;
  addBlock: (versionId: string, materialId: string) => void;
  removeBlock: (versionId: string, materialId: string) => void;
  updateBlock: (versionId: string, materialId: string, patch: Partial<ResumeVersionBlock>) => void;
  moveBlock: (versionId: string, materialId: string, direction: -1 | 1) => void;
  /** 当前登录用户（null=未登录/未配置云端） */
  user: SyncUser | null;
  /**
   * 登录时检测到"本机游客槽有未绑定的简历数据"（且该账号云端/本机缓存为空）。
   * 非 null 时界面应提示用户：并入该账号，或保留为游客数据。绝不静默上传到该账号云端。
   */
  pendingLocalClaim: ResumeState | null;
  /** 把游客槽简历数据并入当前账号（作为该账号简历上传云端，成功后清除游客槽） */
  claimLocalData: () => Promise<void>;
  /** 暂不并入：游客简历数据保留在游客槽，该账号以全新状态开始 */
  skipLocalClaim: () => void;
}

const ResumeStoreContext = createContext<ResumeStoreValue | null>(null);

export function ResumeProvider({ children }: { children: ReactNode }) {
  // 初始状态：登录态尚未恢复（Firebase 异步），先读游客槽，待 auth 事件到达后再切到对应账号槽
  const [realState, dispatch] = useReducer(reducer, undefined, () => loadResumeFromKey(resumeKey()));
  const [user, setUser] = useState<SyncUser | null>(null);
  // 内部门禁：该账号云端无数据且本机有待认领数据时，暂停自动上传，等用户决定
  const [cloudEmpty, setCloudEmpty] = useState(false);
  const [pendingClaim, setPendingClaim] = useState<ResumeState | null>(null);
  // 登录后是否仍在等待"首份云端快照判定"（防护：判定前不上传，避免用本机旧内容覆盖云端已有数据）
  const [cloudPending, setCloudPending] = useState(false);
  const lastRemoteJson = useRef<string | null>(null);
  // 当前登录用户镜像（供异步回调判断身份切换）
  const userRef = useRef<SyncUser | null>(null);
  // 登录瞬间计算的"待认领候选"；云端快照确认无数据后才真正提示
  const claimCandidateRef = useRef<ResumeState | null>(null);

  // 登录状态监听（仅云端启用时生效）
  // 身份切换（登出 / 登录 / 换账号）时切换本地存储槽：登出切回游客槽，登录切到该账号自己的槽
  useEffect(() => {
    if (!firebaseEnabled) return;
    return subscribeAuth((next) => {
      const prev = userRef.current;
      userRef.current = next;
      if (prev?.uid && next?.uid && prev.uid === next.uid) {
        setUser(next);
        return;
      }
      if (!prev && !next) return;
      if (!next) {
        // ── 登出 ──
        setUser(null);
        setCloudEmpty(false);
        setCloudPending(false);
        setPendingClaim(null);
        claimCandidateRef.current = null;
        lastRemoteJson.current = null;
        dispatch({ type: "replace-state", state: loadResumeFromKey(resumeKey()) });
        return;
      }
      // ── 登录 / 换账号 ──
      setUser(next);
      setCloudEmpty(false);
      setCloudPending(true); // 等首份云端快照判定后再允许上传
      setPendingClaim(null);
      lastRemoteJson.current = null;
      dispatch({ type: "replace-state", state: loadResumeFromKey(resumeKey(next.uid)) });
      claimCandidateRef.current = null;
      const hasAccountCache = window.localStorage.getItem(resumeKey(next.uid)) !== null;
      if (!hasAccountCache) {
        const guestRaw = readJson<Partial<ResumeState>>(resumeKey());
        if (guestRaw) {
          const merged = mergeState(createSeedResumeState(), guestRaw);
          if (!contentEquals(merged, createSeedResumeState())) {
            claimCandidateRef.current = merged;
          }
        }
      }
    });
  }, []);

  // 登录后订阅云端简历文档：以云端为真，本机状态随之替换
  // 同一账号的会话刷新（auth 事件以新对象重发）不重建订阅，避免打断认领/同步状态
  const subscribedUidRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user || !db) return;
    if (subscribedUidRef.current === user.uid) return;
    subscribedUidRef.current = user.uid;
    lastRemoteJson.current = null;
    const docRef = doc(db, "resumes", user.uid);
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.metadata.hasPendingWrites) return; // 自己刚写入的回显，等服务端确认
        if (!snapshot.exists()) {
          // 云端无该账号数据：有候选 → 提示认领（暂停上传）；无候选 → 允许上传 effect 用当前本人数据初始化
          const candidate = claimCandidateRef.current;
          if (candidate) setCloudEmpty(true);
          else setCloudEmpty(false);
          setCloudPending(false);
          return;
        }
        const remote = (snapshot.data() as { data?: unknown }).data;
        const json = JSON.stringify(remote ?? null);
        if (json === lastRemoteJson.current) {
          setCloudPending(false); // 与已应用内容一致（含自己上传后的确认回显）
          return;
        }
        lastRemoteJson.current = json;
        const parsed = remote as Partial<ResumeState> | null;
        if (parsed && typeof parsed === "object") {
          dispatch({ type: "replace-state", state: parsed as ResumeState });
          maybeCleanGuestResumeSlot(remote); // 云端已有且与游客槽一致 → 清理旧单键残留
        }
        setPendingClaim(null);
        setCloudEmpty(false);
        setCloudPending(false);
      },
      () => undefined,
    );
    return () => {
      subscribedUidRef.current = null;
      unsubscribe();
    };
  }, [user]);

  // 本地持久化：任何状态变化写入"当前空间"的本地槽（游客槽 / 该账号槽）
  useEffect(() => {
    writeJson(user ? resumeKey(user.uid) : resumeKey(), realState);
  }, [realState, user]);

  // 云端同步：登录后防抖上传；状态来自云端（回显一致）时不写回；
  // 认领待定（cloudEmpty）或首份云端快照未判定（cloudPending）期间不上传，
  // 避免把游客/他人/本机旧内容静默写入该账号
  useEffect(() => {
    if (!user || !db || cloudEmpty || cloudPending) return;
    if (lastRemoteJson.current !== null && JSON.stringify(realState) === lastRemoteJson.current) return;
    const docRef = doc(db, "resumes", user.uid);
    const timer = setTimeout(() => {
      setDoc(docRef, { data: realState, updatedAt: serverTimestamp() }, { merge: true }).catch(() => undefined);
    }, 600);
    return () => clearTimeout(timer);
  }, [realState, user, cloudEmpty, cloudPending]);

  /** 认领：把游客槽简历数据并入当前账号（上传云端，成功后清除游客槽） */
  const claimLocalData = async () => {
    const uid = userRef.current?.uid;
    if (!uid || !db || !pendingClaim) return;
    const claim = pendingClaim;
    setCloudEmpty(false);
    setPendingClaim(null);
    claimCandidateRef.current = null;
    lastRemoteJson.current = null;
    dispatch({ type: "replace-state", state: claim });
    try {
      await setDoc(doc(db, "resumes", uid), { data: claim, updatedAt: serverTimestamp() }, { merge: true });
      removeKey(resumeKey()); // 已并入账号：清除游客槽，避免下次登录重复询问
    } catch {
      setCloudEmpty(true);
      setPendingClaim(claim); // 失败可重试
    }
  };

  /** 暂不认领：游客简历数据保留在游客槽，该账号以当前（全新/缓存）状态开始 */
  const skipLocalClaim = () => {
    if (!userRef.current || !db) return;
    setPendingClaim(null);
    claimCandidateRef.current = null;
    setCloudEmpty(false);
  };

  const value = useMemo<ResumeStoreValue>(() => {
    const materialId = (category: string) => `mat-${category}-${Date.now()}`;
    return {
      ...realState,
      addMaterial: (input) => {
        const id = materialId(input.category);
        dispatch({ type: "add-material", material: { ...input, id, createdAt: Date.now(), updatedAt: Date.now() } });
        return id;
      },
      updateMaterial: (id, patch) => dispatch({ type: "update-material", id, patch }),
      removeMaterial: (id) => dispatch({ type: "remove-material", id }),
      addVersion: (input) => {
        const id = `version-${Date.now()}`;
        const defaultIntent = {
          positions: input.targetRole || "",
          city: "",
          expectSalary: "面议",
          availability: "",
          tags: "",
        };
        dispatch({
          type: "add-version",
          version: {
            id,
            name: input.name,
            targetRole: input.targetRole,
            jobIntent: input.jobIntent ?? defaultIntent,
            blocks: [],
            attachment: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        });
        return id;
      },
      updateVersion: (id, patch) => dispatch({ type: "update-version", id, patch }),
      removeVersion: (id) => dispatch({ type: "remove-version", id }),
      addBlock: (versionId, materialId) => dispatch({ type: "add-block", versionId, materialId }),
      removeBlock: (versionId, materialId) => dispatch({ type: "remove-block", versionId, materialId }),
      updateBlock: (versionId, materialId, patch) => dispatch({ type: "update-block", versionId, materialId, patch }),
      moveBlock: (versionId, materialId, direction) => dispatch({ type: "move-block", versionId, materialId, direction }),
      user,
      pendingLocalClaim: pendingClaim,
      claimLocalData,
      skipLocalClaim,
    };
  }, [realState, user, pendingClaim, cloudEmpty, cloudPending]);

  return <ResumeStoreContext.Provider value={value}>{children}</ResumeStoreContext.Provider>;
}

export function useResumeData() {
  const context = useContext(ResumeStoreContext);
  if (!context) throw new Error("useResumeData must be used within ResumeProvider");
  return context;
}

// ─── 派生工具（跨组件复用） ───

/** 版本内某素材块（可能不存在） */
export function findBlock(version: ResumeVersion, materialId: string): ResumeVersionBlock | undefined {
  return version.blocks.find((block) => block.materialId === materialId);
}

/** 素材在当前版本的展示内容（标题/副标题/要点，应用版本覆盖） */
export function resolvedMaterial(
  material: ResumeMaterial,
  version: ResumeVersion | undefined,
): { title: string; subtitle: string | undefined; content: string[]; customized: boolean } {
  const block = version ? findBlock(version, material.id) : undefined;
  const override = block?.override;
  return {
    title: override?.title ?? material.title,
    subtitle: override?.subtitle ?? material.subtitle,
    content: override?.content ?? material.content,
    customized: Boolean(override),
  };
}

/** 素材是否为"通用"或命中目标岗位标签（供抽屉筛选提示） */
export function materialKindLabel(material: ResumeMaterial): string {
  return RESUME_CATEGORY_LABEL[material.category];
}

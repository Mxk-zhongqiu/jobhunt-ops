import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { createSeedState } from "../data/seed";
import { createDemoState } from "../data/demoSeed";
import { db, firebaseEnabled, loginUser, logoutUser, registerUser, subscribeAuth, type SyncUser } from "../services/firebase";
import { isAppState } from "../utils/io";
import { readJson, removeKey, stateKey, writeJson, contentEquals } from "../utils/storage";
import type {
  AppSettings,
  AppState,
  Application,
  ApplicationStatus,
  InterviewLog,
  KnowledgePoint,
  KnowledgeTopic,
  PlanTask,
  ProjectMilestone,
  QuantProject,
  TopicStatus,
  WeeklyPlan,
} from "../types/domain";

/** 云同步状态：unsupported=未配置云端；local=未登录本地模式；syncing=同步中；synced=已同步；error=同步出错 */
export type SyncStatus = "unsupported" | "local" | "syncing" | "synced" | "error";

type AppAction =
  | { type: "add-application"; application: Application }
  | { type: "update-application"; id: string; patch: Partial<Application> }
  | { type: "remove-application"; id: string }
  | { type: "add-interview"; interview: InterviewLog }
  | { type: "update-interview"; id: string; patch: Partial<InterviewLog> }
  | { type: "remove-interview"; id: string }
  | { type: "toggle-plan-task"; week: number; taskId: string }
  | { type: "add-plan-task"; week: number; text: string }
  | { type: "remove-plan-task"; week: number; taskId: string }
  | { type: "set-project-status"; id: string; status: QuantProject["status"] }
  | { type: "toggle-milestone"; projectId: string; milestoneId: string }
  | { type: "set-topic-status"; id: string; status: TopicStatus }
  | { type: "add-topic"; topic: KnowledgeTopic }
  | { type: "update-topic"; id: string; patch: Partial<KnowledgeTopic> }
  | { type: "remove-topic"; id: string }
  | { type: "set-point-mastered"; topicId: string; pointId: string; mastered: boolean }
  | { type: "add-point"; topicId: string; point: KnowledgePoint }
  | { type: "update-point"; topicId: string; pointId: string; patch: Partial<KnowledgePoint> }
  | { type: "remove-point"; topicId: string; pointId: string }
  | { type: "add-points"; topicId: string; points: KnowledgePoint[] }
  | { type: "replace-points"; topicId: string; points: KnowledgePoint[] }
  | { type: "set-settings"; patch: Partial<AppSettings> }
  | { type: "toggle-question-mastered"; key: string }
  | { type: "replace-state"; state: AppState };

// 模块级种子：知识模块迁移回填用（旧数据缺 points 时按 id 从种子复制知识点）
const seedState = createSeedState();

/**
 * 知识主题兼容迁移：
 * - 旧主题没有 points 字段 → 按 id 从种子主题回填知识点（老用户升级自动获得内容）；
 * - 已有 points 则保留（含用户清空后的空数组，不回填）；
 * - 点级字段补齐默认值（mastered 缺省 false）。
 */
function normalizeKnowledge(knowledge: KnowledgeTopic[]): KnowledgeTopic[] {
  const seedById = new Map(seedState.knowledge.map((topic) => [topic.id, topic]));
  return knowledge.map((topic) => {
    const hasPoints = Array.isArray(topic.points);
    const points = hasPoints
      ? topic.points.map((point) => ({ ...point, mastered: point.mastered === true }))
      : (seedById.get(topic.id)?.points ?? []).map((point) => ({ ...point }));
    return { ...topic, points };
  });
}

function mergeState(seed: AppState, stored: Partial<AppState> | null): AppState {
  if (!stored) return seed;
  return {
    applications: stored.applications ?? seed.applications,
    interviews: stored.interviews ?? seed.interviews,
    weeklyPlans: stored.weeklyPlans ?? seed.weeklyPlans,
    projects: stored.projects ?? seed.projects,
    knowledge: normalizeKnowledge(stored.knowledge ?? seed.knowledge),
    settings: { ...seed.settings, ...stored.settings },
    questionBankMastered: stored.questionBankMastered ?? seed.questionBankMastered,
  };
}

/** 读取指定本地槽并合并种子兜底（游客槽或某账号槽通用） */
function loadStateFromKey(key: string): AppState {
  const seed = createSeedState();
  const stored = readJson<Partial<AppState>>(key);
  return mergeState(seed, stored);
}

/**
 * 已登录时若游客槽残留的旧数据与该账号云端快照完全一致（老版本单键数据升级后
 * 云端已有同样内容），自动清理游客槽，避免每次登录都弹出"待认领"。
 */
function maybeCleanGuestSlot(remote: unknown): void {
  const guestRaw = readJson<Partial<AppState>>(stateKey());
  if (!guestRaw) return;
  const merged = mergeState(createSeedState(), guestRaw);
  if (contentEquals(merged, remote)) removeKey(stateKey());
}

/**
 * 追加一条状态变更到投递时间线：
 * - 旧数据缺 statusHistory → 先用 createdAt 初始化一条当前状态记录，再追加新状态；
 * - 与时间线末尾状态相同（重复设置/远端回显）→ 不重复记录；
 * - 时间戳统一用 ISO（updatedAt 语义，供阶段耗时统计取整日差）。
 */
function recordStatusChange(application: Application, status: ApplicationStatus, at: string): Application {
  const history =
    application.statusHistory && application.statusHistory.length > 0
      ? application.statusHistory
      : [{ status: application.status, at: application.createdAt }];
  const last = history[history.length - 1];
  if (last.status === status) return application;
  return { ...application, statusHistory: [...history, { status, at }] };
}

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "add-application": {
      const next = action.application;
      // 新投递初始化状态时间线（外部带入的历史保留，缺省时以创建时状态为第一条）
      const seeded: Application = {
        ...next,
        statusHistory:
          next.statusHistory && next.statusHistory.length > 0
            ? next.statusHistory
            : [{ status: next.status, at: next.createdAt }],
      };
      return { ...state, applications: [seeded, ...state.applications] };
    }
    case "update-application": {
      const at = new Date().toISOString();
      return {
        ...state,
        applications: state.applications.map((item) => {
          if (item.id !== action.id) return item;
          const merged: Application = { ...item, ...action.patch, updatedAt: at };
          // 状态确实变化（含 计划投递→已投递 等）→ 记入时间线；仅改其他字段不追加
          return action.patch.status && action.patch.status !== item.status
            ? recordStatusChange(merged, action.patch.status, at)
            : merged;
        }),
      };
    }
    case "remove-application":
      return { ...state, applications: state.applications.filter((item) => item.id !== action.id) };
    case "add-interview":
      return { ...state, interviews: [action.interview, ...state.interviews] };
    case "update-interview":
      return {
        ...state,
        interviews: state.interviews.map((item) => (item.id === action.id ? { ...item, ...action.patch } : item)),
      };
    case "remove-interview":
      return { ...state, interviews: state.interviews.filter((item) => item.id !== action.id) };
    case "toggle-plan-task":
      return {
        ...state,
        weeklyPlans: state.weeklyPlans.map((plan) =>
          plan.week === action.week
            ? { ...plan, tasks: plan.tasks.map((item) => (item.id === action.taskId ? { ...item, done: !item.done } : item)) }
            : plan,
        ),
      };
    case "add-plan-task":
      return {
        ...state,
        weeklyPlans: state.weeklyPlans.map((plan) =>
          plan.week === action.week
            ? { ...plan, tasks: [...plan.tasks, { id: `task-${Date.now()}`, text: action.text, done: false }] }
            : plan,
        ),
      };
    case "remove-plan-task":
      return {
        ...state,
        weeklyPlans: state.weeklyPlans.map((plan) =>
          plan.week === action.week ? { ...plan, tasks: plan.tasks.filter((item) => item.id !== action.taskId) } : plan,
        ),
      };
    case "set-project-status":
      return { ...state, projects: state.projects.map((item) => (item.id === action.id ? { ...item, status: action.status } : item)) };
    case "toggle-milestone":
      return {
        ...state,
        projects: state.projects.map((project) =>
          project.id === action.projectId
            ? {
                ...project,
                milestones: project.milestones.map((milestone: ProjectMilestone) =>
                  milestone.id === action.milestoneId
                    ? { ...milestone, status: milestone.status === "done" ? "active" : "done" }
                    : milestone,
                ),
              }
            : project,
        ),
      };
    case "set-topic-status":
      return { ...state, knowledge: state.knowledge.map((item) => (item.id === action.id ? { ...item, status: action.status } : item)) };
    case "add-topic":
      return { ...state, knowledge: [...state.knowledge, action.topic] };
    case "update-topic":
      return { ...state, knowledge: state.knowledge.map((item) => (item.id === action.id ? { ...item, ...action.patch } : item)) };
    case "remove-topic":
      return { ...state, knowledge: state.knowledge.filter((item) => item.id !== action.id) };
    case "set-point-mastered":
      return {
        ...state,
        knowledge: state.knowledge.map((topic) =>
          topic.id === action.topicId
            ? { ...topic, points: topic.points.map((point) => (point.id === action.pointId ? { ...point, mastered: action.mastered } : point)) }
            : topic,
        ),
      };
    case "add-point":
      return {
        ...state,
        knowledge: state.knowledge.map((topic) =>
          topic.id === action.topicId ? { ...topic, points: [...(topic.points ?? []), action.point] } : topic,
        ),
      };
    case "update-point":
      return {
        ...state,
        knowledge: state.knowledge.map((topic) =>
          topic.id === action.topicId
            ? { ...topic, points: topic.points.map((point) => (point.id === action.pointId ? { ...point, ...action.patch } : point)) }
            : topic,
        ),
      };
    case "remove-point":
      return {
        ...state,
        knowledge: state.knowledge.map((topic) =>
          topic.id === action.topicId ? { ...topic, points: topic.points.filter((point) => point.id !== action.pointId) } : topic,
        ),
      };
    case "add-points":
      return {
        ...state,
        knowledge: state.knowledge.map((topic) =>
          topic.id === action.topicId ? { ...topic, points: [...(topic.points ?? []), ...action.points] } : topic,
        ),
      };
    case "replace-points":
      return {
        ...state,
        knowledge: state.knowledge.map((topic) => (topic.id === action.topicId ? { ...topic, points: action.points } : topic)),
      };
    case "set-settings":
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case "toggle-question-mastered":
      return {
        ...state,
        questionBankMastered: state.questionBankMastered.includes(action.key)
          ? state.questionBankMastered.filter((key) => key !== action.key)
          : [...state.questionBankMastered, action.key],
      };
    case "replace-state":
      // 兼容旧备份：导入/重置的数据若缺新字段则兜底为空数组；知识主题统一走迁移回填
      return {
        ...action.state,
        knowledge: normalizeKnowledge(action.state.knowledge ?? []),
        questionBankMastered: action.state.questionBankMastered ?? [],
      };
    default:
      return state;
  }
}

export interface AppStoreValue extends AppState {
  addApplication: (input: Omit<Application, "id" | "status" | "createdAt" | "updatedAt">) => void;
  updateApplication: (id: string, patch: Partial<Application>) => void;
  removeApplication: (id: string) => void;
  addInterview: (input: Omit<InterviewLog, "id" | "createdAt">) => void;
  updateInterview: (id: string, patch: Partial<InterviewLog>) => void;
  removeInterview: (id: string) => void;
  togglePlanTask: (week: number, taskId: string) => void;
  addPlanTask: (week: number, text: string) => void;
  removePlanTask: (week: number, taskId: string) => void;
  setProjectStatus: (id: string, status: QuantProject["status"]) => void;
  toggleMilestone: (projectId: string, milestoneId: string) => void;
  setTopicStatus: (id: string, status: TopicStatus) => void;
  addTopic: (topic: Omit<KnowledgeTopic, "id" | "points">) => void;
  updateTopic: (id: string, patch: Partial<Omit<KnowledgeTopic, "id">>) => void;
  removeTopic: (id: string) => void;
  setPointMastered: (topicId: string, pointId: string, mastered: boolean) => void;
  addPoint: (topicId: string, point: Omit<KnowledgePoint, "id">) => void;
  updatePoint: (topicId: string, pointId: string, patch: Partial<KnowledgePoint>) => void;
  removePoint: (topicId: string, pointId: string) => void;
  /** 批量追加知识点（AI 生成确认后写入） */
  addPoints: (topicId: string, points: Array<Omit<KnowledgePoint, "id">>) => void;
  /** 替换该主题全部知识点（AI 生成确认后写入） */
  replacePoints: (topicId: string, points: Array<Omit<KnowledgePoint, "id">>) => void;
  setSettings: (patch: Partial<AppSettings>) => void;
  toggleQuestionMastered: (key: string) => void;
  restoreState: (state: AppState) => void;
  /** 当前登录用户（null=未登录/未配置云端） */
  user: SyncUser | null;
  /** 云同步状态 */
  syncStatus: SyncStatus;
  /** 云端还没有该账号的数据文档，且本机游客槽有数据等待用户决定是否并入（认领期间暂停自动上传） */
  cloudEmpty: boolean;
  /**
   * 登录时检测到"本机游客槽有未绑定账号的数据"（且该账号云端/本机缓存为空）。
   * 非 null 时界面应提示用户：并入该账号，或保留为游客数据。绝不静默上传或展示到他人账号。
   */
  pendingLocalClaim: AppState | null;
  /** 把游客槽数据并入当前账号（作为该账号数据上传云端，成功后清除游客槽） */
  claimLocalData: () => Promise<void>;
  /** 暂不并入：游客数据保留在游客槽，该账号以全新状态开始 */
  skipLocalClaim: () => void;
  register: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** 游客预览模式：界面切换为演示数据（用于截图/展示，不写入本地与云端） */
  previewDemo: boolean;
  togglePreviewDemo: () => void;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  // 初始状态：登录态尚未恢复（Firebase 异步），先读游客槽，待 auth 事件到达后再切到对应账号槽
  const [realState, dispatch] = useReducer(reducer, undefined, () => loadStateFromKey(stateKey()));
  const [user, setUser] = useState<SyncUser | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(firebaseEnabled ? "local" : "unsupported");
  const [cloudEmpty, setCloudEmpty] = useState(false);
  // 游客预览模式：界面切换为演示数据（用于截图/展示）。演示数据是独立内存态，
  // 绝不写入 localStorage 或云端；切换回真实模式即恢复本人真实数据。
  const [previewDemo, setPreviewDemo] = useState(false);
  const [demoState] = useState<AppState>(() => createDemoState());
  const state = previewDemo ? demoState : realState;
  // 上一次"来自云端"的状态 JSON：云端快照与它一致时视为回显，不再覆盖本地，避免同步死循环
  const lastRemoteJson = useRef<string | null>(null);
  // 当前登录用户镜像（供异步回调判断身份切换）
  const userRef = useRef<SyncUser | null>(null);
  // 登录瞬间计算的"待认领候选"（游客槽有非种子数据且该账号本机无缓存时）；云端快照确认无数据后才真正提示
  const claimCandidateRef = useRef<AppState | null>(null);
  const [pendingClaim, setPendingClaim] = useState<AppState | null>(null);
  // 登录后是否仍在等待"首份云端快照判定"（防护：判定前不上传，避免用本机旧内容覆盖云端已有数据）
  const [cloudPending, setCloudPending] = useState(false);

  // 登录状态监听（仅云端启用时生效）
  // 身份切换（登出 / 登录 / 换账号）时切换本地存储槽，保证界面只显示"当前空间"的数据：
  //  - 登出 → 切回游客槽（账号数据留在其账号槽与云端，绝不残留展示）；
  //  - 登录/换账号 → 立即切到该账号自己的槽（缓存或全新种子），旧游客数据只可能以"待认领"方式出现。
  useEffect(() => {
    if (!firebaseEnabled) return;
    return subscribeAuth((next) => {
      const prev = userRef.current;
      userRef.current = next;
      if (prev?.uid && next?.uid && prev.uid === next.uid) {
        setUser(next); // 同一账号的会话刷新
        return;
      }
      if (!prev && !next) return;
      if (!next) {
        // ── 登出 ──
        setUser(null);
        setSyncStatus("local");
        setCloudEmpty(false);
        setCloudPending(false);
        setPendingClaim(null);
        claimCandidateRef.current = null;
        lastRemoteJson.current = null;
        dispatch({ type: "replace-state", state: loadStateFromKey(stateKey()) });
        return;
      }
      // ── 登录 / 换账号 ──
      setUser(next);
      setSyncStatus("syncing");
      setCloudEmpty(false);
      setCloudPending(true); // 等首份云端快照判定后再允许上传
      lastRemoteJson.current = null;
      dispatch({ type: "replace-state", state: loadStateFromKey(stateKey(next.uid)) });
      claimCandidateRef.current = null;
      const hasAccountCache = window.localStorage.getItem(stateKey(next.uid)) !== null;
      if (!hasAccountCache) {
        const guestRaw = readJson<Partial<AppState>>(stateKey());
        if (guestRaw) {
          const merged = mergeState(createSeedState(), guestRaw);
          if (!contentEquals(merged, createSeedState())) {
            claimCandidateRef.current = merged;
          }
        }
      }
    });
  }, []);

  // 登录后订阅云端状态文档：以云端为真，本机状态随之替换
  // 同一账号的会话刷新（auth 事件以新对象重发）不重建订阅，避免打断认领/同步状态
  const subscribedUidRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user || !db) return;
    if (subscribedUidRef.current === user.uid) return;
    subscribedUidRef.current = user.uid;
    setSyncStatus("syncing");
    setCloudEmpty(false);
    lastRemoteJson.current = null;
    const docRef = doc(db, "states", user.uid);
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.metadata.hasPendingWrites) return; // 自己刚写入的回显，等服务端确认
        if (!snapshot.exists()) {
          // 云端无该账号数据：有候选 → 提示认领（暂停上传，等用户决定）；无候选 → 允许上传 effect 用当前本人数据初始化
          const candidate = claimCandidateRef.current;
          if (candidate) {
            setCloudEmpty(true);
            setPendingClaim(candidate);
            setSyncStatus("synced");
          } else {
            setCloudEmpty(false);
            setSyncStatus("synced");
          }
          setCloudPending(false);
          return;
        }
        const remote = (snapshot.data() as { data?: unknown }).data;
        const json = JSON.stringify(remote ?? null);
        if (json === lastRemoteJson.current) {
          setSyncStatus("synced"); // 与已应用内容一致（含自己上传后的确认回显）
          setCloudPending(false);
          return;
        }
        lastRemoteJson.current = json;
        if (isAppState(remote)) {
          dispatch({ type: "replace-state", state: remote });
          maybeCleanGuestSlot(remote); // 云端已有且与游客槽一致 → 清理旧单键残留
        }
        setPendingClaim(null);
        setCloudEmpty(false);
        setCloudPending(false);
        setSyncStatus("synced");
      },
      () => setSyncStatus("error"),
    );
    return () => {
      subscribedUidRef.current = null;
      unsubscribe();
    };
  }, [user]);

  // 真实持久化：任何状态变化立即写入"当前空间"的本地槽
  // （未登录→游客槽；已登录→该账号槽，作为本机缓存备份）
  // ⚠️ 游客预览模式不写：演示数据绝不污染本人真实数据
  useEffect(() => {
    if (previewDemo) return;
    writeJson(user ? stateKey(user.uid) : stateKey(), realState);
  }, [realState, previewDemo, user]);

  // 云端同步：登录后防抖上传；状态来自云端（回显一致）时不写回；游客预览模式不上传；
  // 认领待定（cloudEmpty）或首份云端快照未判定（cloudPending）期间不上传，
  // 避免把游客/他人/本机旧内容静默写入该账号
  useEffect(() => {
    if (previewDemo || !user || !db || cloudEmpty || cloudPending) return;
    if (lastRemoteJson.current !== null && JSON.stringify(realState) === lastRemoteJson.current) return;
    setSyncStatus("syncing");
    const docRef = doc(db, "states", user.uid);
    const timer = setTimeout(() => {
      setDoc(docRef, { data: realState, updatedAt: serverTimestamp() }, { merge: true })
        .then(() => setSyncStatus("synced"))
        .catch(() => setSyncStatus("error"));
    }, 600);
    return () => clearTimeout(timer);
  }, [realState, user, cloudEmpty, cloudPending, previewDemo]);

  /** 认领：把游客槽数据并入当前账号（作为该账号数据上传云端，成功后清除游客槽） */
  const claimLocalData = async () => {
    const uid = userRef.current?.uid;
    if (!uid || !db || !pendingClaim) return;
    const claim = pendingClaim;
    setCloudEmpty(false);
    setSyncStatus("syncing");
    setPendingClaim(null);
    claimCandidateRef.current = null;
    lastRemoteJson.current = null;
    dispatch({ type: "replace-state", state: claim });
    try {
      await setDoc(doc(db, "states", uid), { data: claim, updatedAt: serverTimestamp() }, { merge: true });
      removeKey(stateKey()); // 已并入账号：清除游客槽，避免下次登录重复询问
      setSyncStatus("synced");
    } catch {
      setSyncStatus("error");
      setCloudEmpty(true);
      setPendingClaim(claim); // 失败可重试
    }
  };

  /** 暂不认领：游客数据保留在游客槽，该账号以当前（全新/缓存）状态开始，由上传 effect 初始化云端 */
  const skipLocalClaim = () => {
    if (!userRef.current || !db) return;
    setPendingClaim(null);
    claimCandidateRef.current = null;
    setCloudEmpty(false);
    setSyncStatus("synced");
  };

  const value = useMemo<AppStoreValue>(() => ({
    ...state,
    addApplication: (input) =>
      dispatch({
        type: "add-application",
        application: {
          ...input,
          id: `app-${Date.now()}`,
          status: "计划投递",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
    updateApplication: (id, patch) => dispatch({ type: "update-application", id, patch }),
    removeApplication: (id) => dispatch({ type: "remove-application", id }),
    addInterview: (input) =>
      dispatch({
        type: "add-interview",
        interview: { ...input, id: `interview-${Date.now()}`, createdAt: new Date().toISOString() },
      }),
    updateInterview: (id, patch) => dispatch({ type: "update-interview", id, patch }),
    removeInterview: (id) => dispatch({ type: "remove-interview", id }),
    togglePlanTask: (week, taskId) => dispatch({ type: "toggle-plan-task", week, taskId }),
    addPlanTask: (week, text) => dispatch({ type: "add-plan-task", week, text }),
    removePlanTask: (week, taskId) => dispatch({ type: "remove-plan-task", week, taskId }),
    setProjectStatus: (id, status) => dispatch({ type: "set-project-status", id, status }),
    toggleMilestone: (projectId, milestoneId) => dispatch({ type: "toggle-milestone", projectId, milestoneId }),
    setTopicStatus: (id, status) => dispatch({ type: "set-topic-status", id, status }),
    addTopic: (topic) => dispatch({ type: "add-topic", topic: { ...topic, id: `topic-${Date.now()}`, points: [] } }),
    updateTopic: (id, patch) => dispatch({ type: "update-topic", id, patch }),
    removeTopic: (id) => dispatch({ type: "remove-topic", id }),
    setPointMastered: (topicId, pointId, mastered) => dispatch({ type: "set-point-mastered", topicId, pointId, mastered }),
    addPoint: (topicId, point) => dispatch({ type: "add-point", topicId, point: { ...point, id: `point-${Date.now()}` } }),
    updatePoint: (topicId, pointId, patch) => dispatch({ type: "update-point", topicId, pointId, patch }),
    removePoint: (topicId, pointId) => dispatch({ type: "remove-point", topicId, pointId }),
    addPoints: (topicId, points) =>
      dispatch({ type: "add-points", topicId, points: points.map((point, index) => ({ ...point, id: `point-${Date.now()}-${index}` })) }),
    replacePoints: (topicId, points) =>
      dispatch({ type: "replace-points", topicId, points: points.map((point, index) => ({ ...point, id: `point-${Date.now()}-${index}` })) }),
    setSettings: (patch) => dispatch({ type: "set-settings", patch }),
    toggleQuestionMastered: (key) => dispatch({ type: "toggle-question-mastered", key }),
    restoreState: (nextState) => dispatch({ type: "replace-state", state: nextState }),
    user,
    syncStatus,
    cloudEmpty,
    pendingLocalClaim: pendingClaim,
    claimLocalData,
    skipLocalClaim,
    previewDemo,
    togglePreviewDemo: () => setPreviewDemo((v) => !v),
    register: (email, password) => registerUser(email, password).then(() => undefined),
    login: (email, password) => loginUser(email, password).then(() => undefined),
    logout: () => logoutUser(),
  }), [state, user, syncStatus, cloudEmpty, cloudPending, previewDemo, pendingClaim]);

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppData() {
  const context = useContext(AppStoreContext);
  if (!context) throw new Error("useAppData must be used within AppDataProvider");
  return context;
}

// ─── 派生工具（跨页面复用） ───

/** 按作战起点计算当前周（1–10），可手动在设置中覆盖 startDate */
export function currentWeek(settings: AppSettings, today: Date = new Date()): number {
  const start = new Date(`${settings.startDate}T00:00:00`);
  const diffDays = Math.floor((today.getTime() - start.getTime()) / 86_400_000);
  return Math.min(10, Math.max(1, Math.floor(diffDays / 7) + 1));
}

/** 正在推进（已投递 → 终面，不含 Offer/已拒绝/放弃/计划投递） */
export function activeApplications(applications: Application[]): Application[] {
  return applications.filter((item) => ["已投递", "笔试", "一面", "二面", "终面"].includes(item.status));
}

export function interviewApplications(applications: Application[]): Application[] {
  return applications.filter((item) => ["一面", "二面", "终面"].includes(item.status));
}

export function projectProgress(project: QuantProject): number {
  if (!project.milestones.length) return 0;
  return Math.round((project.milestones.filter((item) => item.status === "done").length / project.milestones.length) * 100);
}

export function planTasks(plan: WeeklyPlan | undefined): PlanTask[] {
  return plan?.tasks ?? [];
}

import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import { createSeedState } from "../data/seed";
import type {
  AppSettings,
  AppState,
  Application,
  InterviewLog,
  PlanTask,
  ProjectMilestone,
  QuantProject,
  TopicStatus,
  WeeklyPlan,
} from "../types/domain";

const STORAGE_KEY = "jobhunt-ops-state-v1";

type AppAction =
  | { type: "add-application"; application: Application }
  | { type: "update-application"; id: string; patch: Partial<Application> }
  | { type: "remove-application"; id: string }
  | { type: "add-interview"; interview: InterviewLog }
  | { type: "remove-interview"; id: string }
  | { type: "toggle-plan-task"; week: number; taskId: string }
  | { type: "add-plan-task"; week: number; text: string }
  | { type: "remove-plan-task"; week: number; taskId: string }
  | { type: "set-project-status"; id: string; status: QuantProject["status"] }
  | { type: "toggle-milestone"; projectId: string; milestoneId: string }
  | { type: "set-topic-status"; id: string; status: TopicStatus }
  | { type: "set-settings"; patch: Partial<AppSettings> };

function mergeState(seed: AppState, stored: Partial<AppState> | null): AppState {
  if (!stored) return seed;
  return {
    applications: stored.applications ?? seed.applications,
    interviews: stored.interviews ?? seed.interviews,
    weeklyPlans: stored.weeklyPlans ?? seed.weeklyPlans,
    projects: stored.projects ?? seed.projects,
    knowledge: stored.knowledge ?? seed.knowledge,
    settings: { ...seed.settings, ...stored.settings },
  };
}

function loadState(): AppState {
  const seed = createSeedState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed;
    return mergeState(seed, JSON.parse(raw) as Partial<AppState>);
  } catch {
    return seed;
  }
}

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "add-application":
      return { ...state, applications: [action.application, ...state.applications] };
    case "update-application":
      return {
        ...state,
        applications: state.applications.map((item) =>
          item.id === action.id ? { ...item, ...action.patch, updatedAt: new Date().toISOString() } : item,
        ),
      };
    case "remove-application":
      return { ...state, applications: state.applications.filter((item) => item.id !== action.id) };
    case "add-interview":
      return { ...state, interviews: [action.interview, ...state.interviews] };
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
    case "set-settings":
      return { ...state, settings: { ...state.settings, ...action.patch } };
    default:
      return state;
  }
}

export interface AppStoreValue extends AppState {
  addApplication: (input: Omit<Application, "id" | "status" | "createdAt" | "updatedAt">) => void;
  updateApplication: (id: string, patch: Partial<Application>) => void;
  removeApplication: (id: string) => void;
  addInterview: (input: Omit<InterviewLog, "id" | "createdAt">) => void;
  removeInterview: (id: string) => void;
  togglePlanTask: (week: number, taskId: string) => void;
  addPlanTask: (week: number, text: string) => void;
  removePlanTask: (week: number, taskId: string) => void;
  setProjectStatus: (id: string, status: QuantProject["status"]) => void;
  toggleMilestone: (projectId: string, milestoneId: string) => void;
  setTopicStatus: (id: string, status: TopicStatus) => void;
  setSettings: (patch: Partial<AppSettings>) => void;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  // 真实持久化：任何状态变化立即写入本地存储
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 存储失败不阻断使用（例如隐私模式）
    }
  }, [state]);

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
    removeInterview: (id) => dispatch({ type: "remove-interview", id }),
    togglePlanTask: (week, taskId) => dispatch({ type: "toggle-plan-task", week, taskId }),
    addPlanTask: (week, text) => dispatch({ type: "add-plan-task", week, text }),
    removePlanTask: (week, taskId) => dispatch({ type: "remove-plan-task", week, taskId }),
    setProjectStatus: (id, status) => dispatch({ type: "set-project-status", id, status }),
    toggleMilestone: (projectId, milestoneId) => dispatch({ type: "toggle-milestone", projectId, milestoneId }),
    setTopicStatus: (id, status) => dispatch({ type: "set-topic-status", id, status }),
    setSettings: (patch) => dispatch({ type: "set-settings", patch }),
  }), [state]);

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

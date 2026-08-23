// 求职作战台核心数据模型
// 所有对象均为真实业务数据，本地持久化（localStorage），与旧项目的"Mock 演示"哲学彻底分离。

export type CompanyTier = "冲刺" | "主攻" | "保底";

export type ApplicationChannel = "官网" | "牛客" | "应届生" | "学校就业网" | "内推" | "实习转正" | "其他";

export type ApplicationStatus = "计划投递" | "已投递" | "笔试" | "一面" | "二面" | "终面" | "Offer" | "已拒绝" | "放弃";

export type PositionKind = "量化研究" | "量化开发" | "金融科技" | "数据分析" | "风控" | "其他";

export interface Application {
  id: string;
  company: string;
  tier: CompanyTier;
  channel: ApplicationChannel;
  position: string;
  positionKind: PositionKind;
  status: ApplicationStatus;
  /** 投递截止日，ISO 日期（yyyy-MM-dd） */
  deadline?: string;
  /** 实际投递日期 */
  appliedAt?: string;
  url?: string;
  note?: string;
  nextAction?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewLog {
  id: string;
  company: string;
  /** 笔试 / 一面 / 二面 / 终面 / HR 面 */
  round: string;
  date: string;
  /** 被问到的问题（换行分隔） */
  questions: string;
  /** 复盘：做得好 / 不好 / 下次改进 */
  review: string;
  nextAction?: string;
  createdAt: string;
}

export interface PlanTask {
  id: string;
  text: string;
  done: boolean;
}

export interface WeeklyPlan {
  week: number; // 1–10
  label: string;
  tasks: PlanTask[];
}

export type MilestoneStatus = "pending" | "active" | "done";

export interface ProjectMilestone {
  id: string;
  title: string;
  status: MilestoneStatus;
  targetDate?: string;
}

export interface QuantProject {
  id: string;
  name: string;
  goal: string;
  status: "active" | "paused" | "done";
  milestones: ProjectMilestone[];
  /** 交付物：GitHub 链接 / 策略报告位置 */
  output?: string;
}

export type TopicPriority = "高频" | "必考" | "加分";
export type TopicStatus = "未开始" | "学习中" | "已掌握";

/** 知识点掌握深度（可选提示：优先学基础，进阶冲刺用） */
export type PointDepth = "基础" | "进阶";

export interface KnowledgePoint {
  id: string;
  /** 知识点名，如「贝叶斯公式」 */
  title: string;
  /** 核心要点 1–3 句（公式 / 结论 / 面试答法，纯文本，可用 AI 助手生成） */
  summary: string;
  depth?: PointDepth;
  /** 两态掌握标记：已掌握 ✓ / 未掌握 */
  mastered: boolean;
}

export interface KnowledgeTopic {
  id: string;
  category: string;
  name: string;
  priority: TopicPriority;
  status: TopicStatus;
  note?: string;
  /** 知识点清单（v0.3 新增；旧数据缺省时按 id 从种子回填） */
  points: KnowledgePoint[];
}

export interface AppSettings {
  /** 当前用户称呼 */
  targetName: string;
  /** 作战起点（用于自动计算当前周） */
  startDate: string;
  /** 每日投递目标 */
  dailySubmitTarget: number;
  /** 总投递目标 */
  totalTarget: number;
  /** AI 提供商：本地规则 / 真实 DeepSeek（经本地安全代理） */
  aiProvider: "mock" | "deepseek";
}

export interface AppState {
  applications: Application[];
  interviews: InterviewLog[];
  weeklyPlans: WeeklyPlan[];
  projects: QuantProject[];
  knowledge: KnowledgeTopic[];
  settings: AppSettings;
  /** 面试题库中已标记"已掌握"的题目（存规范化键，见 utils/questionBank.ts） */
  questionBankMastered: string[];
}

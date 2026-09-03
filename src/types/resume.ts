// 简历板块数据模型：素材库（单一数据源）+ 版本（挑选与定制）
// 素材改动全局同步；版本内可微调（override，带"已定制"标记）；招聘软件字段（求职意向）按版本独立。

export type ResumeCategory =
  | "basic" // 基本信息（姓名/联系方式/GitHub 等）
  | "jobIntent" // 求职意向（招聘软件字段，按版本独立，不存为素材）
  | "education" // 教育背景
  | "experience" // 实习经历
  | "project" // 项目经历
  | "leadership" // 任职经历（学生工作 / 党内职务等，可选板块）
  | "skill" // 核心技能
  | "honor" // 奖励证书
  | "selfIntro"; // 自我评价

export const RESUME_CATEGORY_LABEL: Record<ResumeCategory, string> = {
  basic: "基本信息",
  jobIntent: "求职意向",
  education: "教育背景",
  experience: "实习经历",
  project: "项目经历",
  leadership: "任职经历",
  skill: "核心技能",
  honor: "奖励证书",
  selfIntro: "自我评价",
};

/** 简历文档中的板块固定顺序（jobIntent 紧随 basic 之后） */
export const RESUME_CATEGORY_ORDER: ResumeCategory[] = [
  "basic",
  "jobIntent",
  "education",
  "experience",
  "project",
  "leadership",
  "skill",
  "honor",
  "selfIntro",
];

export interface ResumeMaterial {
  id: string;
  category: ResumeCategory;
  /** 条目标题，如 "A股多因子选股策略"；basic 素材的 title 为姓名 */
  title: string;
  /** 副标题，如公司/单位 */
  subtitle?: string;
  /** 结构化字段，如 时间/角色/代码链接，渲染为 "键：值" */
  fields: Record<string, string>;
  /** 要点列表（bullet 行，导出一行一条） */
  content: string[];
  /** 素材标签：量化 / 视觉 / 通用（辅助筛选与标识） */
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

/** 版本内微调：只覆盖展示层（标题/副标题/要点），不修改素材库 */
export interface ResumeBlockOverride {
  title?: string;
  subtitle?: string;
  content?: string[];
}

export interface ResumeVersionBlock {
  materialId: string;
  /** 同类目内的展示顺序（升序） */
  order: number;
  override?: ResumeBlockOverride;
}

/** 招聘软件常用字段（按版本独立填写） */
export interface ResumeJobIntent {
  /** 目标岗位 */
  positions: string;
  /** 期望城市 */
  city: string;
  /** 期望薪资 */
  expectSalary: string;
  /** 到岗时间 */
  availability: string;
  /** 技能标签（招聘软件常要求的关键词） */
  tags: string;
}

export interface ResumeAttachment {
  fileName: string;
  /** 可选：小文件内嵌 data URL；大文件仅记录文件名 */
  fileUrl?: string;
}

export interface ResumeVersion {
  id: string;
  /** 版本名，如 "量化岗版" */
  name: string;
  /** 目标岗位描述（展示在简历顶部/标签上） */
  targetRole: string;
  jobIntent: ResumeJobIntent;
  /** 已纳入本版本的素材块（素材库中未列出的素材即未纳入） */
  blocks: ResumeVersionBlock[];
  /** 投递附件 PDF */
  attachment: ResumeAttachment | null;
  createdAt: number;
  updatedAt: number;
}

export interface ResumeState {
  materials: ResumeMaterial[];
  versions: ResumeVersion[];
}

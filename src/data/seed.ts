import type {
  AppState,
  Application,
  KnowledgeTopic,
  QuantProject,
  WeeklyPlan,
} from "../types/domain";

// ─── 种子数据：直接来自《求职规划内部文档》 ───
// 这是"真实作战数据"的初始清单，不是演示数据。用户可以自由修改、删除、补充。

const now = new Date().toISOString();

function application(
  company: string,
  tier: Application["tier"],
  positionKind: Application["positionKind"] = "量化研究",
  channel: Application["channel"] = "官网",
): Application {
  return {
    id: `seed-app-${company}`,
    company,
    tier,
    channel,
    position: "量化研究员（2026 届）",
    positionKind,
    status: "计划投递",
    createdAt: now,
    updatedAt: now,
  };
}

// 第一层（冲刺）：投但不报期望。数据来源：文档 §五 投递分层。
const sprintCompanies = ["幻方", "九坤", "明汯", "衍复", "宽德", "灵均", "启林", "因诺", "蒙玺", "迎水", "佳期", "DTL"];

export const seedApplications: Application[] = sprintCompanies.map((company) => application(company, "冲刺"));

function task(id: string, text: string, done = false) {
  return { id, text, done };
}

// 十周行动清单：文档 §七（周次与日期范围）
export const seedWeeklyPlans: WeeklyPlan[] = [
  {
    week: 1, label: "8/18–8/24 定方向与启动",
    tasks: [
      task("w1t1", "定方向：明确冲刺 / 主攻 / 保底目标分层"),
      task("w1t2", "搭 Python 环境，刷 pandas 基础"),
      task("w1t3", "简历初稿（量化岗翻译版）"),
      task("w1t4", "投出第一批 5–10 家"),
      task("w1t5", "项目1：数据获取 + 因子 1–3"),
      task("w1t6", "每天刷 3–5 道概率题"),
    ],
  },
  {
    week: 2, label: "8/25–8/31 项目1核心",
    tasks: [
      task("w2t1", "项目1：因子扩充到 5–10 个"),
      task("w2t2", "项目1：单因子 IC 分析"),
      task("w2t3", "每天投递 2–5 家"),
      task("w2t4", "概率题 100 题清单开刷"),
    ],
  },
  {
    week: 3, label: "9/1–9/7 项目1完成",
    tasks: [
      task("w3t1", "项目1：回测框架 + 分层回测"),
      task("w3t2", "项目1：策略报告 + GitHub 发布"),
      task("w3t3", "简历定稿"),
      task("w3t4", "每天投 5 家"),
    ],
  },
  {
    week: 4, label: "9/8–9/14 项目2启动",
    tasks: [
      task("w4t1", "项目2：确定方向（推荐配对交易 / 统计套利）"),
      task("w4t2", "项目2：数据获取与协整检验"),
      task("w4t3", "笔试准备：LeetCode 热题 100 开刷"),
    ],
  },
  {
    week: 5, label: "9/15–9/21 项目2核心",
    tasks: [
      task("w5t1", "项目2：价差 OU 建模（或 ML 特征工程）"),
      task("w5t2", "准备自我介绍 + 项目讲述框架"),
    ],
  },
  {
    week: 6, label: "9/22–9/28 项目2收尾",
    tasks: [
      task("w6t1", "项目2：回测 + 报告 + GitHub"),
      task("w6t2", "面试复盘迭代"),
      task("w6t3", "投实习岗（转正通道）"),
    ],
  },
  {
    week: 7, label: "9/29–10/5 国庆冲刺",
    tasks: [
      task("w7t1", "项目打磨（多数人放假，弯道超车）"),
      task("w7t2", "题库冲刺：概率 + LeetCode"),
    ],
  },
  {
    week: 8, label: "10/6–10/12 面试高峰",
    tasks: [
      task("w8t1", "持续投递 + 面试"),
      task("w8t2", "整理高频面试题文档"),
    ],
  },
  {
    week: 9, label: "10/13–10/19 复盘补漏",
    tasks: [
      task("w9t1", "复盘失败环节，补漏洞"),
      task("w9t2", "跟进流程中公司"),
    ],
  },
  {
    week: 10, label: "10/20–10/31 秋招收尾",
    tasks: [
      task("w10t1", "秋招收尾：跟进剩余流程"),
      task("w10t2", "无 offer 转主攻实习转正"),
      task("w10t3", "准备春招"),
    ],
  },
];

// 两个项目：文档 §四 项目规划
export const seedProjects: QuantProject[] = [
  {
    id: "project-factor",
    name: "项目1：A股多因子选股策略",
    goal: "从数据到可复现策略：5–10 个因子 → 单因子检验 → 合成选股 → 完整回测（手续费/涨跌停/停牌/剔除 ST）→ 组合中性化 → 输出夏普/回撤/换手/月度收益。交付 GitHub + 策略报告（9/7 前）。",
    status: "active",
    output: "",
    milestones: [
      { id: "f1", title: "数据获取（tushare / akshare）", status: "active", targetDate: "2026-08-24" },
      { id: "f2", title: "因子计算：价值/动量/反转/波动率/换手 5–10 个", status: "pending", targetDate: "2026-08-28" },
      { id: "f3", title: "单因子检验：IC 均值、ICIR、分层回测", status: "pending", targetDate: "2026-08-31" },
      { id: "f4", title: "因子合成打分选股", status: "pending", targetDate: "2026-09-03" },
      { id: "f5", title: "完整回测：手续费/涨跌停/停牌/剔除 ST", status: "pending", targetDate: "2026-09-05" },
      { id: "f6", title: "组合中性化 + 风险指标输出", status: "pending", targetDate: "2026-09-06" },
      { id: "f7", title: "策略报告 + GitHub 发布", status: "pending", targetDate: "2026-09-07" },
    ],
  },
  {
    id: "project-pair",
    name: "项目2：配对交易 / 统计套利（或 ML 收益预测）",
    goal: "二选一：A. 配对交易（推荐，吃控制背景——用卡尔曼滤波估计时变价差，面试很出彩）：协整检验 → 价差 OU 建模 → 信号 → 回测；B. ML 收益预测：特征工程 → XGBoost/LightGBM → 严格时间切分防泄漏。9/28 前完成。",
    status: "active",
    output: "",
    milestones: [
      { id: "p1", title: "确定方向（A 配对交易 / B ML 预测）", status: "active", targetDate: "2026-09-10" },
      { id: "p2", title: "数据获取与协整检验", status: "pending", targetDate: "2026-09-14" },
      { id: "p3", title: "价差 OU 过程建模（卡尔曼滤波）", status: "pending", targetDate: "2026-09-18" },
      { id: "p4", title: "交易信号 + 回测", status: "pending", targetDate: "2026-09-24" },
      { id: "p5", title: "报告 + GitHub 发布", status: "pending", targetDate: "2026-09-28" },
    ],
  },
];

// 知识体系：文档 §三（按优先级）
export const seedKnowledge: KnowledgeTopic[] = [
  // 数学 / 统计
  { id: "k-prob", category: "数学/统计", name: "概率论：条件概率/期望/随机游走/鞅", priority: "高频", status: "未开始" },
  { id: "k-test", category: "数学/统计", name: "假设检验", priority: "必考", status: "未开始" },
  { id: "k-reg", category: "数学/统计", name: "相关性、回归", priority: "必考", status: "未开始" },
  { id: "k-overfit", category: "数学/统计", name: "过拟合与多重检验（因子回测必考）", priority: "必考", status: "未开始" },
  { id: "k-stoch", category: "数学/统计", name: "随机过程：布朗运动/伊藤引理/GARCH", priority: "高频", status: "未开始" },
  { id: "k-ts", category: "数学/统计", name: "时间序列：平稳性/ACF/PACF/ARIMA/协整", priority: "高频", status: "未开始" },
  { id: "k-kalman", category: "数学/统计", name: "状态空间与卡尔曼滤波（个人强项，重点发挥）", priority: "高频", status: "未开始" },
  { id: "k-opt", category: "数学/统计", name: "凸优化与组合优化", priority: "加分", status: "未开始" },
  // 编程
  { id: "k-py", category: "编程", name: "Python：numpy/pandas/matplotlib/sklearn", priority: "必考", status: "未开始" },
  { id: "k-data", category: "编程", name: "tushare / akshare 取数", priority: "必考", status: "未开始" },
  { id: "k-sql", category: "编程", name: "SQL", priority: "加分", status: "未开始" },
  { id: "k-cpp", category: "编程", name: "C++（开发岗硬性要求）", priority: "加分", status: "未开始" },
  // 金融与量化
  { id: "k-factor", category: "金融与量化", name: "因子投资：Fama-French/Barra/IC/ICIR/分层回测", priority: "必考", status: "未开始" },
  { id: "k-risk", category: "金融与量化", name: "风险指标：夏普/最大回撤/VaR/换手", priority: "必考", status: "未开始" },
  { id: "k-strategy", category: "金融与量化", name: "经典策略：动量/反转/均值回归/配对交易/多因子", priority: "高频", status: "未开始" },
  { id: "k-micro", category: "金融与量化", name: "市场微观结构（进阶）", priority: "加分", status: "未开始" },
  // 机器学习
  { id: "k-tree", category: "机器学习", name: "树模型：XGBoost / LightGBM", priority: "加分", status: "未开始" },
  { id: "k-feat", category: "机器学习", name: "正则化与特征工程", priority: "加分", status: "未开始" },
  { id: "k-leak", category: "机器学习", name: "防止数据泄漏（量化里最致命的坑，答好极加分）", priority: "必考", status: "未开始" },
  // 面试准备
  { id: "k-prob100", category: "面试准备", name: "概率题 100 题（每天 3–5 题）", priority: "高频", status: "未开始" },
  { id: "k-lc", category: "面试准备", name: "LeetCode 热题 100", priority: "高频", status: "未开始" },
  { id: "k-finance", category: "面试准备", name: "金融概念：CAPM/Alpha/Beta/回撤/夏普", priority: "必考", status: "未开始" },
  { id: "k-behavior", category: "面试准备", name: "行为面：为什么做量化 / 项目讲述（问题→方案→结果→重来）", priority: "必考", status: "未开始" },
  { id: "k-qa-doc", category: "面试准备", name: "高频面试题文档（W8 整理）", priority: "必考", status: "未开始" },
];

export function createSeedState(): AppState {
  return {
    applications: seedApplications,
    interviews: [],
    weeklyPlans: seedWeeklyPlans,
    projects: seedProjects,
    knowledge: seedKnowledge,
    settings: {
      targetName: "求职者",
      startDate: "2026-08-18",
      dailySubmitTarget: 5,
      totalTarget: 100,
      aiProvider: "mock",
    },
  };
}

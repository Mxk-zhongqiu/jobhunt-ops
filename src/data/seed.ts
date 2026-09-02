import type {
  AppState,
  Application,
  KnowledgePoint,
  KnowledgeTopic,
  QuantProject,
  TopicPriority,
  WeeklyPlan,
} from "../types/domain";

// ─── 种子数据：直接来自《求职规划内部文档》 ───
// 这是"真实作战数据"的初始清单，不是演示数据。用户可以自由修改、删除、补充。
//
// ⚠️ 本模块必须保持"零顶层副作用"（顶层只有函数/纯常量声明，没有函数调用），保持模块纯净。新增数据请放进对应构造函数（build*）里。

function now(): string {
  return new Date().toISOString();
}

function application(
  company: string,
  tier: Application["tier"],
  positionKind: Application["positionKind"] = "量化研究",
  platform: Application["platform"] = "官网",
): Application {
  return {
    id: `seed-app-${company}`,
    company,
    tier,
    platform,
    position: "量化研究员（2026 届）",
    positionKind,
    status: "计划投递",
    createdAt: now(),
    updatedAt: now(),
  };
}

// 第一层（冲刺）：投但不报期望。数据来源：文档 §五 投递分层。
const sprintCompanies = ["幻方", "九坤", "明汯", "衍复", "宽德", "灵均", "启林", "因诺", "蒙玺", "迎水", "佳期", "DTL"];

function buildSeedApplications(): Application[] {
  return sprintCompanies.map((company) => application(company, "冲刺"));
}

function task(id: string, text: string, done = false) {
  return { id, text, done };
}

// 十周行动清单：文档 §七（周次与日期范围）
function buildSeedWeeklyPlans(): WeeklyPlan[] {
  return [
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
}

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
// ⚠️ 知识点内容默认留空（v0.3 搭框架）：在「知识」页逐条填写，或用 AI 助手生成。
// 「概率论」主题下保留了 3 条示例知识点，用于演示格式，可修改或删除。
export const seedKnowledge: KnowledgeTopic[] = [
  // 数学 / 统计
  knowledgeTopic("k-prob", "数学/统计", "概率论：条件概率/期望/随机游走/鞅", "高频", [
    point("kp-1", "条件概率与全概率公式", "P(A|B)=P(AB)/P(B)；全概率：P(A)=ΣP(A|Bᵢ)P(Bᵢ)，按完备事件组加权求和。面试常配「盒子取球」题。", "基础"),
    point("kp-2", "贝叶斯公式", "P(A|B)=P(B|A)P(A)/P(B)；辨析先验/后验/似然。必考「疾病检测假阳性」题。", "基础"),
    point("kp-3", "全期望公式", "E[X]=E[E[X|Y]]；分层求期望的利器，例如「先掷骰子再抛硬币的次数期望」。", "基础"),
  ]),
  knowledgeTopic("k-test", "数学/统计", "假设检验", "必考"),
  knowledgeTopic("k-reg", "数学/统计", "相关性、回归", "必考"),
  knowledgeTopic("k-overfit", "数学/统计", "过拟合与多重检验（因子回测必考）", "必考"),
  knowledgeTopic("k-stoch", "数学/统计", "随机过程：布朗运动/伊藤引理/GARCH", "高频"),
  knowledgeTopic("k-ts", "数学/统计", "时间序列：平稳性/ACF/PACF/ARIMA/协整", "高频"),
  knowledgeTopic("k-kalman", "数学/统计", "状态空间与卡尔曼滤波（个人强项，重点发挥）", "高频"),
  knowledgeTopic("k-opt", "数学/统计", "凸优化与组合优化", "加分"),
  // 编程
  knowledgeTopic("k-py", "编程", "Python：numpy/pandas/matplotlib/sklearn", "必考"),
  knowledgeTopic("k-data", "编程", "tushare / akshare 取数", "必考"),
  knowledgeTopic("k-sql", "编程", "SQL", "加分"),
  knowledgeTopic("k-cpp", "编程", "C++（开发岗硬性要求）", "加分"),
  // 金融与量化
  knowledgeTopic("k-factor", "金融与量化", "因子投资：Fama-French/Barra/IC/ICIR/分层回测", "必考"),
  knowledgeTopic("k-risk", "金融与量化", "风险指标：夏普/最大回撤/VaR/换手", "必考"),
  knowledgeTopic("k-strategy", "金融与量化", "经典策略：动量/反转/均值回归/配对交易/多因子", "高频"),
  knowledgeTopic("k-micro", "金融与量化", "市场微观结构（进阶）", "加分"),
  // 机器学习
  knowledgeTopic("k-tree", "机器学习", "树模型：XGBoost / LightGBM", "加分"),
  knowledgeTopic("k-feat", "机器学习", "正则化与特征工程", "加分"),
  knowledgeTopic("k-leak", "机器学习", "防止数据泄漏（量化里最致命的坑，答好极加分）", "必考"),
  // 面试准备
  knowledgeTopic("k-prob100", "面试准备", "概率题 100 题（每天 3–5 题）", "高频"),
  knowledgeTopic("k-lc", "面试准备", "LeetCode 热题 100", "高频"),
  knowledgeTopic("k-finance", "面试准备", "金融概念：CAPM/Alpha/Beta/回撤/夏普", "必考"),
  knowledgeTopic("k-behavior", "面试准备", "行为面：为什么做量化 / 项目讲述（问题→方案→结果→重来）", "必考"),
  knowledgeTopic("k-qa-doc", "面试准备", "高频面试题文档（W8 整理）", "必考"),
];

/** 知识点构造（内容留空时只传标题与要点） */
function point(id: string, title: string, summary: string, depth?: KnowledgePoint["depth"]): KnowledgePoint {
  return { id, title, summary, depth, mastered: false };
}

/** 知识主题构造：默认未开始、无知识点 */
function knowledgeTopic(
  id: string,
  category: string,
  name: string,
  priority: TopicPriority,
  points: KnowledgePoint[] = [],
): KnowledgeTopic {
  return { id, category, name, priority, status: "未开始", points };
}

export function createSeedState(): AppState {
  // 真实数据即全部构建（本地与公网）的默认状态；「游客预览」虚构演示数据由 appStore 独立切换。
  return createRealSeedState();
}

function createRealSeedState(): AppState {
  return {
    applications: buildSeedApplications(),
    interviews: [],
    weeklyPlans: buildSeedWeeklyPlans(),
    projects: seedProjects,
    knowledge: seedKnowledge,
    settings: {
      targetName: "求职者",
      startDate: "2026-08-18",
      dailySubmitTarget: 5,
      totalTarget: 100,
      aiProvider: "mock",
    },
    questionBankMastered: [],
  };
}

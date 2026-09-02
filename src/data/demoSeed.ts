// 公网展示版专用演示数据（仅当 `npm run build:demo` 构建时启用）
// 目的：把"完整界面 + 看起来活的演示数据"公开给别人体验，绝不泄露个人真实求职策略。
// 原则：公司/项目/记录全部虚构或通用化；日期相对"今天"动态生成，任何时候打开都像在正常使用中。
//
// ⚠️ 本模块必须保持"零顶层副作用"（顶层只有函数声明与类型导入，没有任何函数调用）：
// 真实构建时 __DEMO_MODE__=false，Rollup 才能把整个模块判定为纯净并整体摇掉，
// 演示数据才不会混进真实构建产物。新增数据时请全部放进 createDemoState 调用的构造函数里。

import type { AppState, Application, InterviewLog, KnowledgeTopic, QuantProject, WeeklyPlan } from "../types/domain";

/** 相对今天偏移 N 天的 ISO 日期（yyyy-MM-dd），让演示数据永远"新鲜" */
function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 周起始日标签，例如「8/18–8/24」 */
function weekRange(week: number): string {
  const start = new Date();
  start.setDate(start.getDate() - 21 + (week - 1) * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${fmt(start)}–${fmt(end)}`;
}

function buildApplications(now: string): Application[] {
  let seq = 0;
  const application = (
    company: string,
    tier: Application["tier"],
    platform: Application["platform"],
    status: Application["status"],
    positionKind: Application["positionKind"] = "量化研究",
    extra: Partial<Pick<Application, "deadline" | "appliedAt" | "position" | "url" | "note" | "nextAction">> = {},
  ): Application => {
    seq += 1;
    return {
      id: `demo-app-${seq}`,
      company,
      tier,
      platform,
      position: extra.position ?? "量化研究员（2026 届）",
      positionKind,
      status,
      ...extra,
      createdAt: now,
      updatedAt: now,
    };
  };
  // 虚构公司，状态覆盖全漏斗，含 7 天内截止以演示"紧急红字"
  return [
    application("北辰量化", "冲刺", "官网", "已投递", "量化研究", { appliedAt: daysFromNow(-6) }),
    application("青禾资本", "冲刺", "官网", "笔试", "量化研究", { appliedAt: daysFromNow(-10), deadline: daysFromNow(2) }),
    application("澜舟资产", "冲刺", "牛客", "一面", "量化研究", { appliedAt: daysFromNow(-12), deadline: daysFromNow(4) }),
    application("南岭基金", "冲刺", "官网", "二面", "量化研究", { appliedAt: daysFromNow(-15), deadline: daysFromNow(6) }),
    application("云帆投资", "冲刺", "应届生", "终面", "量化研究", { appliedAt: daysFromNow(-20), deadline: daysFromNow(9) }),
    application("星海资管", "主攻", "官网", "计划投递", "量化研究", { deadline: daysFromNow(5) }),
    application("白泽科技", "主攻", "官网", "计划投递", "量化开发", { deadline: daysFromNow(3), position: "量化开发工程师（2026 届）" }),
    application("昆仑资本", "主攻", "学校就业网", "已投递", "量化研究", { appliedAt: daysFromNow(-3) }),
    application("观澜基金", "主攻", "牛客", "笔试", "量化研究", { appliedAt: daysFromNow(-8), deadline: daysFromNow(1) }),
    application("玄武投资", "主攻", "官网", "已投递", "金融科技", { appliedAt: daysFromNow(-5) }),
    application("赤霄资管", "保底", "官网", "计划投递", "数据分析", { deadline: daysFromNow(8) }),
    application("天枢金控", "保底", "应届生", "已投递", "量化研究", { appliedAt: daysFromNow(-2) }),
    application("伏羲数据", "保底", "内推", "Offer", "量化开发", { appliedAt: daysFromNow(-18), position: "量化开发工程师（2026 届）", url: "https://example.com" }),
    application("无涯金融", "保底", "官网", "已拒绝", "量化研究", { appliedAt: daysFromNow(-14) }),
  ];
}

function buildWeeklyPlans(): WeeklyPlan[] {
  const task = (id: string, text: string, done = false) => ({ id, text, done });
  return [
    { week: 1, label: `第 1 周（${weekRange(1)}）定方向与启动`, tasks: [task("d1t1", "明确冲刺 / 主攻 / 保底分层", true), task("d1t2", "搭建 Python 环境，刷 pandas 基础", true), task("d1t3", "简历初稿", true), task("d1t4", "投出第一批 5–10 家", true)] },
    { week: 2, label: `第 2 周（${weekRange(2)}）项目 1 核心`, tasks: [task("d2t1", "项目 1：因子扩充", true), task("d2t2", "项目 1：单因子 IC 分析", true), task("d2t3", "每天投递 2–5 家", true)] },
    { week: 3, label: `第 3 周（${weekRange(3)}）项目 1 收尾`, tasks: [task("d3t1", "项目 1：回测框架 + 分层回测", true), task("d3t2", "项目 1：策略报告 + GitHub 发布", false), task("d3t3", "简历定稿", true)] },
    { week: 4, label: `第 4 周（${weekRange(4)}）项目 2 启动`, tasks: [task("d4t1", "项目 2：确定方向", true), task("d4t2", "项目 2：数据获取与协整检验", false), task("d4t3", "笔试准备：LeetCode 热题 100 开刷", false)] },
    { week: 5, label: `第 5 周（${weekRange(5)}）项目 2 核心`, tasks: [task("d5t1", "项目 2：价差 OU 建模", false), task("d5t2", "准备自我介绍 + 项目讲述框架", false)] },
    { week: 6, label: `第 6 周（${weekRange(6)}）项目 2 收尾`, tasks: [task("d6t1", "项目 2：回测 + 报告 + GitHub", false), task("d6t2", "面试复盘迭代", false)] },
    { week: 7, label: `第 7 周（${weekRange(7)}）冲刺`, tasks: [task("d7t1", "项目打磨", false), task("d7t2", "题库冲刺：概率 + LeetCode", false)] },
    { week: 8, label: `第 8 周（${weekRange(8)}）面试高峰`, tasks: [task("d8t1", "持续投递 + 面试", false), task("d8t2", "整理高频面试题文档", false)] },
    { week: 9, label: `第 9 周（${weekRange(9)}）复盘补漏`, tasks: [task("d9t1", "复盘失败环节，补漏洞", false), task("d9t2", "跟进流程中公司", false)] },
    { week: 10, label: `第 10 周（${weekRange(10)}）收尾`, tasks: [task("d10t1", "秋招收尾：跟进剩余流程", false), task("d10t2", "准备春招", false)] },
  ];
}

function buildProjects(): QuantProject[] {
  return [
    {
      id: "demo-project-factor",
      name: "项目1：A股多因子选股策略",
      goal: "从数据到可复现策略：因子计算 → 单因子检验 → 合成选股 → 完整回测（手续费/涨跌停/停牌/剔除 ST）→ 输出夏普/回撤/换手。",
      status: "active",
      output: "https://github.com/example/multi-factor",
      milestones: [
        { id: "df1", title: "数据获取（tushare / akshare）", status: "done", targetDate: daysFromNow(-18) },
        { id: "df2", title: "因子计算：价值/动量/反转/波动率", status: "done", targetDate: daysFromNow(-12) },
        { id: "df3", title: "单因子检验：IC 均值、ICIR、分层回测", status: "done", targetDate: daysFromNow(-6) },
        { id: "df4", title: "因子合成打分选股", status: "active", targetDate: daysFromNow(2) },
        { id: "df5", title: "完整回测（交易成本/涨跌停/停牌）", status: "pending", targetDate: daysFromNow(6) },
        { id: "df6", title: "策略报告 + GitHub 发布", status: "pending", targetDate: daysFromNow(9) },
      ],
    },
    {
      id: "demo-project-pair",
      name: "项目2：配对交易 / 统计套利",
      goal: "协整检验 → 价差 OU 建模 → 交易信号 → 回测，输出完整策略报告。",
      status: "active",
      output: "",
      milestones: [
        { id: "dp1", title: "确定方向与数据获取", status: "active", targetDate: daysFromNow(4) },
        { id: "dp2", title: "协整检验", status: "pending", targetDate: daysFromNow(8) },
        { id: "dp3", title: "价差 OU 建模", status: "pending", targetDate: daysFromNow(12) },
        { id: "dp4", title: "交易信号 + 回测", status: "pending", targetDate: daysFromNow(18) },
        { id: "dp5", title: "报告 + GitHub 发布", status: "pending", targetDate: daysFromNow(22) },
      ],
    },
  ];
}

function buildKnowledge(): KnowledgeTopic[] {
  return [
    { id: "dk1", category: "数学/统计", name: "概率论：条件概率/期望/随机游走", priority: "高频", status: "学习中", points: [
      { id: "dkp1", title: "条件概率与全概率公式", summary: "P(A|B)=P(AB)/P(B)；全概率：按完备事件组加权求和。", depth: "基础", mastered: true },
      { id: "dkp2", title: "贝叶斯公式", summary: "P(A|B)=P(B|A)P(A)/P(B)；先验/后验/似然辨析。", depth: "基础", mastered: false },
    ] },
    { id: "dk2", category: "数学/统计", name: "假设检验", priority: "必考", status: "学习中", points: [] },
    { id: "dk3", category: "数学/统计", name: "相关性、回归", priority: "必考", status: "已掌握", points: [] },
    { id: "dk4", category: "数学/统计", name: "过拟合与多重检验（因子回测必考）", priority: "必考", status: "学习中", points: [] },
    { id: "dk5", category: "数学/统计", name: "时间序列：平稳性/ACF/PACF/协整", priority: "高频", status: "未开始", points: [] },
    { id: "dk6", category: "编程", name: "Python：numpy/pandas/matplotlib/sklearn", priority: "必考", status: "学习中", points: [] },
    { id: "dk7", category: "编程", name: "tushare / akshare 取数", priority: "必考", status: "已掌握", points: [] },
    { id: "dk8", category: "编程", name: "SQL", priority: "加分", status: "未开始", points: [] },
    { id: "dk9", category: "金融与量化", name: "因子投资：Fama-French/IC/ICIR/分层回测", priority: "必考", status: "学习中", points: [] },
    { id: "dk10", category: "金融与量化", name: "风险指标：夏普/最大回撤/VaR/换手", priority: "必考", status: "已掌握", points: [] },
    { id: "dk11", category: "金融与量化", name: "经典策略：动量/反转/均值回归/配对交易", priority: "高频", status: "学习中", points: [] },
    { id: "dk12", category: "机器学习", name: "树模型：XGBoost / LightGBM", priority: "加分", status: "未开始", points: [] },
    { id: "dk13", category: "机器学习", name: "防止数据泄漏（量化里最致命的坑）", priority: "必考", status: "学习中", points: [] },
    { id: "dk14", category: "面试准备", name: "概率题 100 题（每天 3–5 题）", priority: "高频", status: "学习中", points: [] },
    { id: "dk15", category: "面试准备", name: "LeetCode 热题 100", priority: "高频", status: "未开始", points: [] },
    { id: "dk16", category: "面试准备", name: "金融概念：CAPM/Alpha/Beta/回撤/夏普", priority: "必考", status: "已掌握", points: [] },
    { id: "dk17", category: "面试准备", name: "行为面：为什么做量化 / 项目讲述框架", priority: "必考", status: "未开始", points: [] },
  ];
}

function buildInterviews(now: string): InterviewLog[] {
  return [
    {
      id: "demo-interview-1",
      company: "北辰量化",
      round: "笔试",
      date: daysFromNow(-12),
      questions: "最小二乘法与极大似然估计的区别？\n一个骰子掷两次，至少出现一次 6 的概率？",
      review: "复盘总结：笔试整体顺利\n做得好：\n· 概率题计算准确\n不足：\n· 统计推断概念表述不够严谨\n下一步：\n· 复习极大似然估计的推导",
      nextAction: "等待一面通知",
      createdAt: now,
    },
    {
      id: "demo-interview-2",
      company: "青禾资本",
      round: "一面",
      date: daysFromNow(-8),
      questions: "什么是夏普比率？它有什么局限性？\nPython 中 list 和 tuple 的区别？",
      review: "复盘总结：基础概念回答流畅\n做得好：\n· 夏普比率公式与含义清晰\n不足：\n· Python 语言细节准备不足\n下一步：\n· 刷 30 道 Python 基础题",
      createdAt: now,
    },
    {
      id: "demo-interview-3",
      company: "澜舟资产",
      round: "一面",
      date: daysFromNow(-5),
      questions: "什么是夏普比率？\n解释一下过拟合与多重检验问题？",
      review: "复盘总结：项目相关问题回答较好\n做得好：\n· 结合项目讲清多重检验\n不足：\n· 夏普比率局限回答不够深入\n下一步：\n· 准备夏普比率三连问",
      createdAt: now,
    },
    {
      id: "demo-interview-4",
      company: "南岭基金",
      round: "二面",
      date: daysFromNow(-2),
      questions: "讲讲你的项目中如何防止数据泄漏？",
      review: "复盘总结：时间切分逻辑讲述完整\n做得好：\n· 严格时间切分与特征滞后\n不足：\n· 没有主动提到滚动预测\n下一步：\n· 补充 walk-forward 验证的讲述",
      createdAt: now,
    },
  ];
}

// 演示设置：起点设为 3 周前，让"当前周 = 第 4 周"
export function createDemoState(): AppState {
  const now = new Date().toISOString();
  return {
    applications: buildApplications(now),
    interviews: buildInterviews(now),
    weeklyPlans: buildWeeklyPlans(),
    projects: buildProjects(),
    knowledge: buildKnowledge(),
    settings: {
      targetName: "求职者",
      startDate: daysFromNow(-21),
      dailySubmitTarget: 5,
      totalTarget: 100,
      aiProvider: "mock",
    },
    questionBankMastered: [],
  };
}

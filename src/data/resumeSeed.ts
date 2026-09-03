// 简历板块种子数据：素材库 + 两个默认版本（量化岗版 / 视觉算法岗版）
// 内容来源：.edge-profile/resume/resume-2026.md（2026 量化秋招简历整合版）
// 版本挑选逻辑：
//   - 量化岗版：量化项目（多因子/配对交易）+ 量化技能，不含视觉项目
//   - 视觉算法岗版：视觉项目（FD-BEVFusion/无人机追踪）+ 深度学习技能，自我评价用版本定制

import type { ResumeMaterial, ResumeState, ResumeVersion } from "../types/resume";

const now = Date.now();

export function createSeedResumeState(): ResumeState {
  const materials: ResumeMaterial[] = [
    // ── 基本信息 ──
    {
      id: "basic-1",
      category: "basic",
      title: "张三",
      fields: {
        性别: "男",
        政治面貌: "中共党员",
        电话: "13800000000",
        邮箱: "zhangsan@example.com",
        GitHub: "https://github.com/example/fd-bevfusion",
      },
      content: [],
      tags: ["通用"],
      createdAt: now,
      updatedAt: now,
    },
    // ── 教育背景 ──
    {
      id: "edu-1",
      category: "education",
      title: "某大学",
      subtitle: "硕士（在读）· 控制科学与工程",
      fields: { 时间: "2024.9~至今" },
      content: ["国家励志奖学金", "专业排名前 10%"],
      tags: ["通用"],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "edu-2",
      category: "education",
      title: "某大学",
      subtitle: "本科 · 机器人工程",
      fields: { 时间: "2019.9~2023.6" },
      content: [],
      tags: ["通用"],
      createdAt: now,
      updatedAt: now,
    },
    // ── 实习经历 ──
    {
      id: "exp-1",
      category: "experience",
      title: "航空孔探检测 App · AI 全栈开发（计算机视觉方向）",
      subtitle: "某科技有限公司",
      fields: { 时间: "2026.03.23~2026.06.24", 角色: "独立全栈开发（架构设计 + 编码落地）" },
      content: [
        "独立完成基于计算机视觉的航空孔探缺陷检测 Android 应用全栈开发：从需求拆解、架构设计到编码落地全流程负责",
        "采用 Kotlin + Jetpack Compose + MVVM 架构，自研多相机引擎，实现多路相机接入与实时取流，满足孔探检测多角度成像需求",
        "设计 TFLite / ONNX Runtime 双 AI 推理模块，实现缺陷检测模型端侧部署与双引擎动态切换，覆盖不同硬件与模型格式场景",
        "实现案例管理、缺陷复核、PDF 报告生成、Room 本地数据库等完整业务闭环，保障现场离线场景可用",
      ],
      tags: ["通用"],
      createdAt: now,
      updatedAt: now,
    },
    // ── 项目经历 ──
    {
      id: "proj-1",
      category: "project",
      title: "A股多因子选股策略",
      subtitle: "2026.08~2026.09",
      fields: { 代码: "https://github.com/example/a-share-multi-factor-strategy" },
      content: [
        "从数据到可复现策略的完整研究管线：数据获取（沪深300+中证500 并集 800 只 × 2017-2026）→ 三层数据 QA（修复 28 处数据源缺陷）→ 因子构建 → 单因子检验 → 因子合成 → 行业/市值双中性化 → 完整回测 → 容量估计",
        "构建低换手 / 低波动 / 短期反转 / 流动性四因子库，经单因子 IC、ICIR、分层回测与样本外分段检验（合成因子 2017-2026 逐年正 IC、样本外不衰减）",
        "自研回测框架（股数记账+现金预算无杠杆），纳入手续费（印花税日期分段）/ 涨跌停 / 停牌 / 剔除 ST / 流动性约束等真实交易约束，并做行业+市值双重中性化",
        "回测结果（2017-2026 净收益）：+216%（年化 12.7%、夏普 0.61），同期沪深300 为 +38%（夏普 0.28）；16 组参数敏感性全绿（年化 13-23%）；容量估计 1-3 亿元",
      ],
      tags: ["量化"],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "proj-2",
      category: "project",
      title: "配对交易 / 统计套利策略",
      subtitle: "2026.08~2026.09",
      fields: {},
      content: [
        "基于协整检验（两级 FDR 多重检验校正）筛选股票对，构建配对交易（统计套利）策略，利用价差的均值回归特性捕捉交易机会",
        "采用卡尔曼滤波对时变 β 进行状态空间建模，实证发现静态 β 样本外 0/16 对存活、重估后 6/16 复活——时变估计是 A股配对交易的必需项而非加分项",
        "完成交易信号、回测流程与止损/仓位风控设计，样本外（2022-2026）逐笔回合 P&L 重建验证；诚实披露成本结构（毛利 vs 交易费+融券费）与容量限制",
      ],
      tags: ["量化"],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "proj-3",
      category: "project",
      title: "FD-BEVFusion：基于谱感知与时空对齐的多模态 3D 感知研究（RA-L 在投）",
      fields: { 角色: "第一作者 / 核心研究员" },
      content: [
        "背景：针对现有 BEV 融合方案在恶劣天气及动态场景下特征提取鲁棒性不足的问题，提出一种基于频域分析的雷达-相机融合架构",
        "核心工作（频域动态融合 Frequency Dynamic Fusion）：设计频谱感知模块，利用雷达数据在频域的稀疏特性与相机的纹理特征互补；通过快速傅里叶变换（FFT）将图像特征转换至频域，实现雷达与相机特征在频率维度的动态门控融合，有效抑制高频噪声干扰，提升融合特征一致性",
        "工程优化：基于 CUDA 优化 FFT 算子的推理效率，分析不同分辨率特征图对显存和推理速度的影响，在保持精度的前提下将推理延迟控制在 8ms 以内",
        "工程落地：基于 MMDetection3D 框架复现并改进 BEVFusion 基线，编写完整的训练与推理 Pipeline，在 nuScenes 数据集上进行消融实验",
        "实验验证：相比 Baseline（BEVFusion），优化高频长尾型物体检测效果，ConstructionVehicles 和 Barriers 检测精度分别提升 1.4% 和 1.3%，整体 mAP 提升 0.4%，证明频域融合在噪声抑制方面的鲁棒性",
      ],
      tags: ["视觉"],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "proj-4",
      category: "project",
      title: "无人机俯拍视角下的行人路径追踪算法",
      subtitle: "2022.10~2023.06",
      fields: {},
      content: [
        "针对无人机俯拍视角小目标检测难点，改进 YOLOv5 网络结构，设计多尺度注意力模块，增强对微小特征的提取能力",
        "集成 Strong-SORT 追踪算法，针对目标遮挡导致的 ID 频繁跳变，优化 Kalman 滤波器运动模型参数，结合 ReID 特征重识别，将追踪稳定性提升 9.5%",
        "设计数据增强策略（Mosaic+Mixup），提升模型在复杂背景下的泛化能力",
      ],
      tags: ["视觉"],
      createdAt: now,
      updatedAt: now,
    },
    // ── 核心技能（按方向拆分，便于版本挑选） ──
    {
      id: "skill-1",
      category: "skill",
      title: "编程语言与开发工具",
      content: [
        "Python（熟练）、C++（熟悉）、Kotlin、MATLAB、Linux Shell",
        "Docker、Git、LaTeX、Rosbag、TensorBoard、Android Studio",
        "数学基础：概率统计、随机过程、状态空间与卡尔曼滤波（个人强项，控制背景）",
      ],
      fields: {},
      tags: ["通用"],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "skill-2",
      category: "skill",
      title: "量化与数据分析",
      content: [
        "pandas / NumPy（数据分析）、Matplotlib、tushare / akshare（行情数据）",
        "statsmodels（协整检验 / 时间序列）",
        "多因子选股（IC / ICIR / 分层回测）、配对交易 / 统计套利（协整 / OU 建模）",
        "回测与风控指标（夏普 / 最大回撤 / 换手）",
      ],
      fields: {},
      tags: ["量化"],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "skill-3",
      category: "skill",
      title: "深度学习 / 3D 感知",
      content: [
        "PyTorch（深度应用）、MMDetection3D（核心工具）、OpenPCDet、TFLite、ONNX Runtime",
        "熟悉 3D Object Detection（BEVFusion、CenterPoint、DETR3D）",
        "熟悉多模态融合策略（Camera-LiDAR、Camera-Radar）及 Sensor Calibration",
        "熟悉常用 Backbone（ResNet、Swin-Transformer、VovNet）",
      ],
      fields: {},
      tags: ["视觉"],
      createdAt: now,
      updatedAt: now,
    },
    // ── 任职经历（可选板块：可单独纳入/移出版本） ──
    {
      id: "lead-1",
      category: "leadership",
      title: "党支部组织委员",
      fields: {},
      content: [],
      tags: ["通用"],
      createdAt: now,
      updatedAt: now,
    },
    // ── 奖励证书 ──
    {
      id: "honor-1",
      category: "honor",
      title: "“互联网+”大学生创新创业大赛 校级二等奖",
      fields: {},
      content: [],
      tags: ["通用"],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "honor-2",
      category: "honor",
      title: "“挑战杯”全国大学生课外学术科技作品竞赛 校级三等奖",
      fields: {},
      content: [],
      tags: ["通用"],
      createdAt: now,
      updatedAt: now,
    },
    // ── 自我评价 ──
    {
      id: "self-1",
      category: "selfIntro",
      title: "自我评价",
      fields: {},
      content: [
        "控制科学与工程背景，熟悉状态估计与优化方法，兼具科研与全栈工程落地能力",
        "量化研究：完成 A股多因子与配对交易两个完整闭环项目，具备从数据、因子到回测、风控的全流程经验",
        "视觉算法：第一作者研究（RA-L 在投），熟悉 3D 感知与多模态融合，工程上完成端侧 AI 部署（TFLite / ONNX Runtime）",
        "自驱、诚实披露局限，乐于把复杂问题拆解为可验证的实验步骤",
      ],
      tags: ["通用"],
      createdAt: now,
      updatedAt: now,
    },
  ];

  const versions: ResumeVersion[] = [
    {
      id: "version-quant",
      name: "量化岗版",
      targetRole: "量化研究实习生 / 量化开发实习生（2026 届量化秋招）",
      jobIntent: {
        positions: "量化研究实习生 / 量化开发实习生",
        city: "北京 / 上海 / 深圳",
        expectSalary: "面议",
        availability: "2026 年 9 月起可全职实习",
        tags: "Python、多因子、统计套利、机器学习、PyTorch、回测框架",
      },
      blocks: ["basic-1", "edu-1", "edu-2", "exp-1", "proj-1", "proj-2", "lead-1", "skill-1", "skill-2", "honor-1", "honor-2", "self-1"].map(
        (materialId, index) => ({ materialId, order: index }),
      ),
      attachment: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "version-vision",
      name: "视觉算法岗版",
      targetRole: "3D 感知 / 自动驾驶算法实习生（2026 届秋招）",
      jobIntent: {
        positions: "3D 感知算法实习生 / 自动驾驶算法实习生",
        city: "北京 / 上海 / 深圳",
        expectSalary: "面议",
        availability: "2026 年 9 月起可全职实习",
        tags: "PyTorch、3D 目标检测、多模态融合、BEVFusion、端侧部署",
      },
      blocks: [
        { materialId: "basic-1", order: 0 },
        { materialId: "edu-1", order: 1 },
        { materialId: "edu-2", order: 2 },
        { materialId: "exp-1", order: 3 },
        { materialId: "proj-3", order: 4 },
        { materialId: "proj-4", order: 5 },
        { materialId: "lead-1", order: 6 },
        { materialId: "skill-1", order: 7 },
        { materialId: "skill-3", order: 8 },
        { materialId: "honor-1", order: 9 },
        { materialId: "honor-2", order: 10 },
        {
          materialId: "self-1",
          order: 11,
          // 版本定制示例：视觉岗版自我评价聚焦视觉与工程，展示"已定制"能力
          override: {
            content: [
              "控制科学与工程背景，熟悉状态估计与优化方法，兼具科研与全栈工程落地能力",
              "视觉算法：第一作者研究（RA-L 在投），提出频域动态融合的雷达-相机融合架构，熟悉 3D 感知与多模态融合",
              "工程落地：基于 MMDetection3D 完成完整训练与推理 Pipeline，端侧 AI 部署经验（TFLite / ONNX Runtime）",
              "自驱、诚实披露局限，乐于把复杂问题拆解为可验证的实验步骤",
            ],
          },
        },
      ],
      attachment: null,
      createdAt: now,
      updatedAt: now,
    },
  ];

  return { materials, versions };
}

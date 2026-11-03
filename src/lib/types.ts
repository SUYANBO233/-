import type { EvaluationContext, ResponseResult, EvaluationItem, EvaluationCriterion } from './response';
/**
 * 系统总览板块的领域类型定义。
 * 该类型同时作为「前端组件数据契约」与「后端接口返回体」，
 * 后续接入真实后端时保持此结构不变，前端无需改动。
 */

/** 隧道纵断面单个衬砌分段 */
export interface TunnelSegment {
  id: number;
  /** 起始桩号 */
  start: string;
  /** 终止桩号 */
  end: string;
  /** 衬砌类型，如 S4a / S5d / SMa */
  type: string;
  /** 分段长度 (m) */
  len: number;
  /** 围岩描述 */
  rock: string;
  /** 钢拱架配置 */
  steel: string;
  /** 喷射混凝土配置 */
  shot: string;
  /** 系统锚杆配置 */
  anchor: string;
  /** 推荐开挖工法 */
  method: string;
  /** 色带颜色 */
  color: string;
}

/** 成效指标看板单条 KPI */
export interface AchievementMetric {
  label: string;
  value: string;
  suffix?: string;
  unit?: string;
  sub: string;
  /** 主数值颜色：brand / ok / info / warn */
  tone: 'brand' | 'ok' | 'info' | 'warn';
}

/** 示范工程卡片信息 */
export interface ProjectInfo {
  name: string;
  badge: string;
  sub: string;
  tags: string[];
  chainage: string;
  length: string;
  progress: number;
  excavated: string;
  remaining: string;
}

/** 工法与支护统计 KPI */
export interface SupportKpi {
  label: string;
  value: string;
  suffix?: string;
  delta: string;
  tone: 'brand' | 'info' | 'warn' | 'violet';
}

/** 纵断面图例项 */
export interface LegendItem {
  color: string;
  label: string;
}

/** 柱状图数据 */
export interface BarSeries {
  labels: string[];
  data: number[];
  colors: string[];
}

/** 环形图数据 */
export interface PieSeries {
  labels: string[];
  data: number[];
  colors: string[];
}

/** 主洞 / 平导切换时变化的汇总指标 */
export interface TunnelViewSummary {
  methodPct: string;
  methodName: string;
  methodSub: string;
  advLen: string;
  advPct: string;
}

/* ============================================================
   智能决策中心领域类型
   ============================================================ */

/** 决策模式：联合感知（自动同步）/ 手动推演 */
export type DecisionMode = 'joint' | 'manual';

/** 围岩级别（罗马数字） */
export type RockGrade = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI';

/** 单个候选开挖工法 */
export interface ConstructionMethod {
  key: string;
  name: string;
  /** 适用围岩，如 "Ⅳ 级围岩" */
  rock: string;
  /** 单循环耗时 */
  cycle: string;
  /** 单循环进尺 */
  adv: string;
  /** 喷砼厚度 */
  shot: string;
  /** 月度考核指标 */
  month: string;
  /** 工法描述 */
  desc: string;
  /** 装备配套 */
  equip: string;
}

/** 工法匹配评分结果 */
export interface MethodMatch extends ConstructionMethod {
  /** 匹配度 0~100 */
  score: number | null;
  status?: 'recommended' | 'candidate' | 'inapplicable' | 'insufficient' | 'uncovered' | null;
  reasons?: string[];
  rules?: { code: string; version: number; priority: number }[];
  priority?: number | null;
  /** 是否为当前围岩的推荐匹配项 */
  matched: boolean;
}

/** 支护构件类型 */
export type SupportComponentType = 'steel' | 'shot' | 'anchor' | 'advance';

/** 单项支护构件设计 */
export interface SupportComponent {
  key: SupportComponentType;
  label: string;
  spec: string;
  layout: string;
  /** 可调数值（钢架间距/喷厚/锚杆长度/环距） */
  valNum: number;
  unit: string;
  basis: string;
  /** 置信度 0~1 */
  conf: number | null;
  parameters?: Record<string, string | number> | null;
  color: string;
}

/** 成拱力学机理参数 */
export interface ArchMechanism {
  /** 压力拱平衡高度，如 "8.2 m" */
  height: string;
  /** 围岩成拱应力释放率，如 "65 %" */
  release: string;
  /** 最佳初支封闭时机，如 "0.7 D" */
  closeTime: string;
}

/** 分项安全裕度雷达图数据 */
export interface SafetyRadar {
  labels: string[];
  data: number[];
}

/** 初期支护安全度评估结果 */
export interface SafetyAssessment {
  response?: ResponseResult | null;
  items?: EvaluationItem[];
  criteriaSnapshot?: EvaluationCriterion[];
  isTest?: boolean;
  status?: 'reference' | 'unavailable' | 'satisfied' | 'unsatisfied';
  scope?: string;
  algorithm?: AlgorithmInfo;
  /** 综合安全度 0~100 */
  score: number | null;
  tag: string;
  reason: string;
  radar: SafetyRadar | null;
}

/** 方案报告单行 */
export interface SchemeRow {
  process: string;
  spec: string;
  quantity: string;
  basis: string;
}

/** 完整施工配置方案报告 */
export interface SchemeReport {
  evaluation?: SafetyAssessment | null;
  baselineEvaluation?: SafetyAssessment | null;
  algorithm?: AlgorithmInfo;
  no: string;
  time: string;
  mile: string;
  grade: string;
  method: string;
  rows: SchemeRow[];
}

/** 一次支护设计或人工微调的输入，结果由服务端重新校核后保存。 */
export interface TemplateReference { code: string; version: number }

export interface DecisionRevisionInput {
  template?: TemplateReference | null;
  manualReason?: string;
  methodKey: 'full' | 'bench' | 'core';
  values: Record<SupportComponentType, number>;
  reason: string;
}

export interface SaveDecisionRequest {
  evaluationContext?: EvaluationContext | null;
  observationId?: string | null;
  algorithm?: AlgorithmInfo;
  requestKey: string;
  mode: DecisionMode;
  workface: string;
  mileage: string;
  params: Partial<GeoParams>;
  revisions: DecisionRevisionInput[];
}

export interface SaveDecisionResult {
  report: SchemeReport;
  recordId: number;
  decisionRunId: string;
}

/** 施工工作面选项 */
export interface WorkfaceOption {
  value: string;
  label: string;
  /** 该工作面默认围岩级别 */
  grade: RockGrade;
}

/** 开挖里程选项 */
export interface MileageOption {
  value: string;
  label: string;
  /** 提取出的桩号，如 K3601+200 */
  mile: string;
}

/** 16 项工程参数；数值字段采用明确单位。 */
export interface GeoParams {
  hardness: string;
  integrity: string;
  thickness: string;
  water: string;
  grade: RockGrade;
  depth: number;
  section: string;
  density: number;
  sharePrimary: number;
  shareSecondary: number;
  friction: number;
  elastic: number;
  cohesion: number;
  poisson: number;
  stressV: number;
  stressH: number;
}

/** 工作面与里程元数据 */
export interface DecisionMeta {
  algorithm?: AlgorithmInfo;
  workfaces: WorkfaceOption[];
  mileages: MileageOption[];
}

/** 服务返回的算法标识；请求走 Python 并不意味着模型已经过工程标定。 */
export interface AlgorithmInfo {
  capabilities?: string[];
  id: string;
  version: string;
  reference: boolean;
  description: string;
}

export interface InferMethodsResult {
  methods: MethodMatch[];
  algorithm: AlgorithmInfo;
}

export interface SupportDesignResult {
  support: SupportComponent[];
  safety: SafetyAssessment;
  mechanism: ArchMechanism | null;
  template?: TemplateReference | null;
  algorithm: AlgorithmInfo;
}

/** 系统总览聚合数据体 */
export interface OverviewData {
  title: string;
  subtitle?: string;
  badges: string[];
  achievementTitle: string;
  achievementTag?: string;
  achievements: AchievementMetric[];
  projects: ProjectInfo[];
  tunnel: {
    main: {
      title: string;
      totalLen: number;
      segments: TunnelSegment[];
    };
    pilot: {
      title: string;
      totalLen: number;
      segments: TunnelSegment[];
    };
    legend: LegendItem[];
    summaries: {
      main: TunnelViewSummary;
      pilot: TunnelViewSummary;
    };
  };
  supportKpis: SupportKpi[];
  charts: {
    schemeLen: BarSeries;
    steelDist: PieSeries;
  };
}

/* ============================================================
   经验数据库
   ============================================================ */

/** 核心施工装备 */
export interface EquipmentItem {
  id: number;
  name: string;
  model: string;
  num: number;
  unit: string;
  pos: string;
  stage: string;
  /** 是否为用户新增/导入的记录（非内置标准项） */
  custom?: boolean;
}

/** 标准工法库卡片 */
export interface MethodCard {
  name: string;
  tone: 'ok' | 'brand' | 'warn';
  geology: string;
  section: string;
  advantage: string;
  equipment: string;
}

/** 地质环境特征 - 知识方案映射 */
export interface KnowledgeMapping {
  /** 数据库主键；静态种子不依赖该字段。 */
  id?: number;
  no: number;
  code: string;
  hard: string;
  intact: string;
  water: string;
  depth: string;
  stress: string;
  rock: string;
  scheme: string;
  /** 是否为用户新增/导入的记录（非内置标准项） */
  custom?: boolean;
}

/** 围岩级别筛选值（支护方案库） */
export type RockFilter = 'all' | 'IV' | 'V';

/** 支护体系与优选方案 */
export interface SupportScheme {
  id?: number;
  no: number;
  rock: string;
  type: string;
  depth: string;
  advType: string;
  advRing: string;
  advLen: string;
  advScope: string;
  anchor: string;
  steel: string;
  shot: string;
  conc: string;
  thick: string;
  mode: string;
  advRate: string;
  benchLen: string;
  /** 是否为用户新增/导入的方案（非内置标准项） */
  custom?: boolean;
}

/** 经验数据库聚合数据 */
export interface KnowledgeData {
  equipmentTitle: string;
  equipment: EquipmentItem[];
  methodTitle: string;
  methods: MethodCard[];
  mappingTitle: string;
  mappings: KnowledgeMapping[];
  schemeTitle: string;
  schemes: SupportScheme[];
}

/* ============================================================
   方案报告与历史决策台账
   ============================================================ */

/** 单次历史决策记录（对应参考 HTML 的 HISTORY_DB_DATA） */
export interface HistoryRecord {
  id: number;
  /** 决策时间，格式 YYYY-MM-DD（日期） */
  time: string;
  /** 隧道工作面 */
  face: string;
  /** 起始里程桩号 */
  startMile: string;
  /** 终止里程桩号 */
  endMile: string;
  /** 循环进尺，如 "3.0m" */
  advance: string;
  /** 围岩级别，如 "Ⅳ级" / "Ⅴ级" */
  rock: string;
  /** 开挖工法 */
  method: string;
  /** 衬砌类型 */
  type: string;
  /** 安全度评分（0~100） */
  score: number | null;
  evaluationStatus?: string | null;
  /** 单次决策完整配置参数明细 */
  detail: string;
  /** 是否为用户新增/导入的记录（非内置标准项） */
  custom?: boolean;
  source?: string;
  schemeReportId?: string;
  decisionRunId?: string;
}

/** 历史决策台账聚合数据 */
export interface SchemeHistoryData {
  title: string;
  subtitle: string;
  /** 工作面筛选项 */
  faces: string[];
  records: HistoryRecord[];
}

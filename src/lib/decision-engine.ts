/**
 * 决策引擎 —— 前端内置规则引擎（与后端 Python 接口同构）。
 *
 * 设计目的：
 * 在 Python 后端就绪前，保证智能决策中心可端到端运行；
 * 后端接入后，页面只需把调用从本模块切换到 src/lib/api.ts 中的请求函数，
 * 入参与返回结构完全一致，组件零改动。
 *
 * 推理规则与原参考 HTML 保持一致：
 * - 工法匹配：Ⅳ级 → 台阶法，Ⅴ级 → 环形开挖预留核心土法。
 * - 支护设计：按围岩级别给出四构件标准配置。
 * - 安全校核：支护微调后按构件数值修正综合安全度。
 */
import {
  buildSupportComponents,
  CONSTRUCTION_METHODS,
} from '@/data/decision';
import type {
  ArchMechanism,
  GeoParams,
  MethodMatch,
  RockGrade,
  SafetyAssessment,
  SchemeReport,
  SchemeRow,
  SupportComponent,
} from '@/lib/types';

/** 根据围岩级别返回推荐工法 key */
export function recommendMethodKey(grade: RockGrade): string {
  if (grade === 'V' || grade === 'VI') return 'core';
  if (grade === 'I' || grade === 'II' || grade === 'III') return 'full';
  return 'bench';
}

/**
 * Step 2：工法推理。
 * 为三种标准工法计算匹配度并标记当前围岩推荐项。
 */
export function inferMethods(params: GeoParams): MethodMatch[] {
  const recommendedKey = recommendMethodKey(params.grade);

  return CONSTRUCTION_METHODS.map((m) => {
    const matched = m.key === recommendedKey;
    let score: number;
    if (matched) score = 98;
    else if (m.key === 'full') score = 45;
    else score = 60;

    return { ...m, score, matched };
  });
}

/**
 * 成拱力学机理参数（按围岩级别）。
 */
export function getArchMechanism(grade: RockGrade): ArchMechanism {
  if (grade === 'V' || grade === 'VI') {
    return { height: '12.4 m', release: '48 %', closeTime: '0.9 D' };
  }
  return { height: '8.2 m', release: '65 %', closeTime: '0.7 D' };
}

/**
 * Step 3：生成初期支护四构件设计。
 */
export function designSupport(
  params: GeoParams,
  _methodKey: string,
): SupportComponent[] {
  return buildSupportComponents(params.grade);
}

/**
 * 根据支护构件当前数值，计算综合安全度。
 *
 * 规则（与原 HTML 一致并细化微调影响）：
 * - 钢架间距减小 → 承载更安全（间距越大越不利）；
 * - 喷层厚度增加 → 抗剪更安全；
 * - 锚杆长度增加 → 抗拔更安全；
 * - 超前小导管环距减小 → 预加固更安全。
 * 以标准配置为基准 100，综合折算到 0~100。
 */
export function assessSafety(
  params: GeoParams,
  support: SupportComponent[],
): SafetyAssessment {
  const isV = params.grade === 'V' || params.grade === 'VI';

  // 基准值（标准配置）
  const baseline: Record<SupportComponent['key'], number> = isV
    ? { steel: 60, shot: 26, anchor: 3.5, advance: 40 }
    : { steel: 80, shot: 22, anchor: 3.0, advance: 40 };

  // 各构件相对基准的安全贡献系数（间距/环距越小越安全，厚度/长度越大越安全）
  const factors = support.map((c) => {
    const base = baseline[c.key];
    if (c.key === 'steel' || c.key === 'advance') {
      // 间距类：基准 / 实际，限制在合理区间
      return clamp(base / c.valNum, 0.7, 1.3);
    }
    // 厚度/长度类：实际 / 基准
    return clamp(c.valNum / base, 0.7, 1.3);
  });

  const avgFactor = factors.reduce((a, b) => a + b, 0) / factors.length;

  // 围岩基准安全度：Ⅳ 91.3，Ⅴ 85.8（与原 HTML 一致）
  const baseScore = isV ? 85.8 : 91.3;
  let score = round1(baseScore * avgFactor);
  score = clamp(score, 40, 99);

  const tag =
    score > 75 ? `参考评分较高 (${score})` : score >= 60 ? `参考评分一般 (${score})` : `参考评分较低 (${score})`;

  const reason =
    score > 75
      ? '演示评分处于模板参考区间；未计算实际荷载、承载力或规范安全系数，不能据此认定结构安全。'
      : score >= 60
        ? '演示评分低于模板基准，需要使用真实模型重新校核；此处不构成工程安全结论。'
        : '演示评分较低，需要使用真实模型重新校核；此结果不代表实际结构安全结论。';

  // 分项雷达值，随综合系数等比浮动并限制在 0~100
  const baseRadar = isV
    ? [85, 88, 90, 84, 82, 86]
    : [92, 90, 93, 88, 91, 94];
  const data = baseRadar.map((v) => clamp(Math.round(v * avgFactor), 0, 100));

  return {
    score,
    tag,
    reason,
    radar: {
      labels: ['钢架承载', '喷层抗剪', '锚杆抗拔', '抗大变形', '成拱闭合', '支护时效'],
      data,
    },
  };
}

/** 支护构件数值变化后，更新其 layout 文案 */
export function applySupportValue(
  component: SupportComponent,
  value: number,
): SupportComponent {
  if (component.parameters) {
    const fields = { steel:'spacingCm',shot:'thicknessCm',anchor:'lengthM',advance:'ringSpacingCm' };
    const p = { ...component.parameters,[fields[component.key]]:value };
    const layouts = {
      steel:`间距 ${p.spacingCm} cm`,shot:`厚度 ${p.thicknessCm} cm`,
      anchor:`长度 ${p.lengthM} m；纵向 ${p.longitudinalSpacingCm} cm × 环向 ${p.circumferentialSpacingCm} cm`,
      advance:`长度 ${p.lengthM} m；环距 ${p.ringSpacingCm} cm；${p.scope}`,
    };
    return { ...component,valNum:value,parameters:p,layout:layouts[component.key] };
  }
  let layout = component.layout;
  switch (component.key) {
    case 'steel':
      layout = `间距 ${value} cm`;
      break;
    case 'shot':
      layout = `厚度 ${value} cm`;
      break;
    case 'anchor':
      layout = `L=${value}m (已修改)`;
      break;
    case 'advance':
      layout = `环距 ${value} cm`;
      break;
  }
  return { ...component, valNum: value, layout };
}

/** 补零 */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * Step 4：生成完整施工配置方案报告。
 */
export function generateScheme(
  params: GeoParams,
  mileage: string,
  methodKey: string,
  support: SupportComponent[],
): SchemeReport {
  const method = CONSTRUCTION_METHODS.find((m) => m.key === methodKey);
  const d = new Date();
  const no = `预览-${crypto.randomUUID()}`;
  const time = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

  const byKey = (k: string): SupportComponent | undefined =>
    support.find((s) => s.key === k);

  const steel = byKey('steel');
  const shot = byKey('shot');
  const anchor = byKey('anchor');
  const advance = byKey('advance');

  const rows: SchemeRow[] = [
    {
      process: '开挖工法',
      spec: method?.name ?? '',
      quantity: `单循环进尺 ${method?.adv ?? ''}`,
      basis: `单循环总耗时 ${method?.cycle ?? ''} · 预期月进尺 ${method?.month ?? ''}`,
    },
    {
      process: '炸药器材',
      spec: '2# 岩石乳化炸药',
      quantity: 'Φ32×300mm×300g',
      basis: 'YT-28手持风钻打眼，实施光面爆破',
    },
    {
      process: '超前支护',
      spec: advance?.spec ?? '',
      quantity: advance?.layout ?? '',
      basis: advance?.basis ?? '',
    },
    {
      process: '型钢钢架',
      spec: steel?.spec ?? '',
      quantity: steel?.layout ?? '',
      basis: steel?.basis ?? '',
    },
    {
      process: '喷射混凝土',
      spec: shot?.spec ?? '',
      quantity: shot?.layout ?? '',
      basis: shot?.basis ?? '',
    },
    {
      process: '系统锚杆',
      spec: anchor?.spec ?? '',
      quantity: anchor?.layout ?? '',
      basis: anchor?.basis ?? '',
    },
    {
      process: '核心施工装备',
      spec: '装载机 + 挖掘机 + 自卸汽车 + 湿喷台车',
      quantity: 'ZL50C 2台 + CAT320D 4台 + 自卸车8台 + 湿喷台车2台',
      basis: '全工序大型机械化配套高效协同作业',
    },
  ];

  return {
    no,
    time,
    mile: mileage,
    grade: `${params.grade} 级`,
    method: method?.name ?? '',
    rows,
  };
}

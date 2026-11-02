'use client';

import { cn } from '@/lib/utils';
import type { DecisionMeta, DecisionMode, GeoParams, RockGrade } from '@/lib/types';

interface DecisionWorkbenchProps {
  meta: DecisionMeta;
  mileage: string;
  ready: boolean;
  mode: DecisionMode;
  workface: string;
  params: GeoParams;
  onModeChange: (m: DecisionMode) => void;
  onWorkfaceChange: (value: string, grade: RockGrade) => void;
  onMileageChange: (value: string) => void;
  onParamChange: <K extends keyof GeoParams>(key: K, value: GeoParams[K]) => void;
  onResetParams: () => void;
  onRunInfer: () => void;
}

const MODE_ITEMS: { key: DecisionMode; label: string; color: string }[] = [
  { key: 'joint', label: '联合决策', color: '#2dd4bf' },
  { key: 'manual', label: '手动决策', color: '#f7b955' },
];

/** 数字输入参数配置 */
interface NumField {
  key: keyof GeoParams;
  label: string;
  unit: string;
  step?: number;
  required?: boolean;
}

const NUM_FIELDS_GROUP2: NumField[] = [
  { key: 'depth', label: '隧道埋深', unit: 'm' },
  { key: 'density', label: '岩体密度', unit: 'kg/m³' },
  { key: 'sharePrimary', label: '初支承担比例', unit: 'ratio', step: 0.01 },
  { key: 'shareSecondary', label: '二衬承担比例', unit: 'ratio', step: 0.01 },
];

const NUM_FIELDS_GROUP3: NumField[] = [
  { key: 'friction', label: '内摩擦角 φ', unit: '°', required: true },
  { key: 'elastic', label: '弹性模量 E', unit: 'GPa', step: 0.01, required: true },
  { key: 'cohesion', label: '粘聚力 c', unit: 'kPa', required: true },
  { key: 'poisson', label: '泊松比 μ', unit: '-', step: 0.01, required: true },
  { key: 'stressV', label: '竖向应力 σv', unit: 'MPa', step: 0.1, required: true },
  { key: 'stressH', label: '水平应力 σh', unit: 'MPa', step: 0.1 },
];

const SELECT_FIELDS: {
  key: keyof GeoParams;
  label: string;
  options: string[];
}[] = [
  {
    key: 'hardness',
    label: '坚硬程度',
    options: ['硬 (变质灰岩)', '较硬', '较软 (千枚岩)', '软'],
  },
  {
    key: 'integrity',
    label: '完整程度',
    options: ['较完整', '较破碎', '破碎', '极破碎'],
  },
  {
    key: 'thickness',
    label: '岩层厚度',
    options: ['巨厚层', '厚层', '中厚层', '薄层'],
  },
  {
    key: 'water',
    label: '地下水量',
    options: ['干燥', '潮湿', '滴水', '淋水', '涌水'],
  },
];

const SECTION_OPTIONS = [
  { value: '主洞标准断面', label: '沙益主洞 (10×5m)' },
  { value: '平导标准断面', label: '沙益平导 (4×4.5m)' },
  { value: '主洞紧急停车带', label: '停车带加宽 (12.5m)' },
];

export function DecisionWorkbench({
  meta, mileage, ready,
  mode,
  workface,
  params,
  onModeChange,
  onWorkfaceChange,
  onMileageChange,
  onParamChange,
  onResetParams,
  onRunInfer,
}: DecisionWorkbenchProps) {
  return (
    <div className="engine-workbench">
      {/* 头部工具栏 */}
      <div className="engine-top-bar">
        <div className="engine-badge-title">
          <span className="ico-engine">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#062c27" strokeWidth="2.4" aria-hidden>
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </span>
          <h2>开挖工法与初期支护参数推理引擎</h2>
        </div>
        <div className="mode-capsule-switch">
          {MODE_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onModeChange(item.key)}
              className={cn('mc-item', mode === item.key && 'active')}
            >
              <span className="status-dot" style={{ background: item.color }} />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* 模式状态提示 */}
      <div className={cn('engine-mode-alert', mode === 'joint' ? 'alert-joint' : 'alert-manual')}>
        <div>
          {mode === 'joint' ? (
            <>
              <b>【联合决策模式】</b>{' '}
              选择工作面及开挖里程即可一键协同同步
            </>
          ) : (
            <>
              <b>【手动决策模式】</b>{' '}
              支持自由修改微调下方 16 项地质力学参数
            </>
          )}
        </div>
        {mode === 'joint' && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-[5px] bg-gradient-to-br from-[#1fb8a4] to-[#0e8f96] px-3 py-[3px] text-[12px] font-semibold text-white shadow-[0_3px_14px_rgba(45,212,191,.22)] transition-transform hover:-translate-y-px"
            onClick={() => {
              const wf = meta.workfaces.find((w) => w.value === workface);
              if (wf) onWorkfaceChange(wf.value, wf.grade);
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6" />
            </svg>
            同步数据
          </button>
        )}
      </div>

      {/* 工作面与开挖里程选择栏 */}
      <div className="workface-ctrl-box">
        <div className="wf-field">
          <label>施工工作面:</label>
          <select
            value={workface}
            onChange={(e) => {
              const wf = meta.workfaces.find((w) => w.value === e.target.value);
              if (wf) onWorkfaceChange(wf.value, wf.grade);
            }}
            className="flex-1 cursor-pointer rounded border border-line bg-panel px-2.5 py-1.5 text-[12px] text-ink outline-none"
          >
            {meta.workfaces.map((wf) => (
              <option key={wf.value} value={wf.value}>
                {wf.label}
              </option>
            ))}
          </select>
        </div>
        <div className="wf-field">
          <label>开挖里程桩号:</label>
          <select
            value={meta.mileages.find((item) => item.mile === mileage)?.value ?? ""}
            onChange={(e) => {
              const m = meta.mileages.find((x) => x.value === e.target.value);
              if (m) onMileageChange(m.mile);
            }}
            className="flex-1 cursor-pointer rounded border border-line bg-panel px-2.5 py-1.5 text-[12px] text-ink outline-none"
          >
            {meta.mileages.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] text-ink-3">
          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-medium text-brand">自动标定</span>
        </span>
      </div>

      {/* 18 项参数三栏 */}
      <div className="param-groups-grid">
        {/* 组 1 */}
        <div className="param-group-box">
          <div className="pg-head">
            <span style={{ color: '#2dd4bf' }}>01</span> 地质定性与赋存特征
          </div>
          {SELECT_FIELDS.map((f) => (
            <div key={f.key} className="pg-item">
              <span className="pg-lbl">{f.label}</span>
              <div className="pg-val">
                <select
                  value={params[f.key] as string}
                  onChange={(e) => onParamChange(f.key, e.target.value as GeoParams[typeof f.key])}
                  className="cursor-pointer rounded border border-line/60 bg-panel px-1 py-0.5 text-[11.5px] font-semibold text-ink outline-none"
                >
                  {f.options.map((opt) => (
                    <option key={opt} value={opt.split(' ')[0]}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          <div className="pg-item">
            <span className="pg-lbl">围岩级别</span>
            <div className="pg-val">
              <select
                value={params.grade}
                onChange={(e) => onParamChange('grade', e.target.value as RockGrade)}
                className="cursor-pointer rounded border border-line/60 bg-panel px-1 py-0.5 text-[11.5px] font-semibold text-ink outline-none"
              >
                <option value="IV">Ⅳ 级 (主洞 3237m)</option>
                <option value="V">Ⅴ 级 (主洞 1500m)</option>
              </select>
            </div>
          </div>
        </div>

        {/* 组 2 */}
        <div className="param-group-box">
          <div className="pg-head">
            <span style={{ color: '#5aa2f8' }}>02</span> 断面几何与荷载分配
          </div>
          {NUM_FIELDS_GROUP2.map((f) => (
            <div key={f.key} className="pg-item">
              <span className="pg-lbl">{f.label}</span>
              <div className="pg-val">
                <input
                  type="number"
                  step={f.step}
                  value={params[f.key] as number}
                  onChange={(e) => onParamChange(f.key, Number(e.target.value) as GeoParams[typeof f.key])}
                />
                <span className="unit">{f.unit}</span>
              </div>
            </div>
          ))}
          <div className="pg-item">
            <span className="pg-lbl">断面类型 (跨度)</span>
            <div className="pg-val">
              <select
                value={params.section}
                onChange={(e) => onParamChange('section', e.target.value)}
                className="cursor-pointer rounded border border-line/60 bg-panel px-1 py-0.5 text-[11.5px] font-semibold text-ink outline-none"
              >
                {SECTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 组 3 */}
        <div className="param-group-box">
          <div className="pg-head">
            <span style={{ color: '#f7b955' }}>03</span> 岩体力学与地应力场
          </div>
          {NUM_FIELDS_GROUP3.map((f) => (
            <div key={f.key} className="pg-item">
              <span className="pg-lbl">{f.label}</span>
              <div className="pg-val">
                <input
                  type="number"
                  step={f.step}
                  value={params[f.key] as number}
                  onChange={(e) => onParamChange(f.key, Number(e.target.value) as GeoParams[typeof f.key])}
                />
                <span className="unit">{f.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 底部操作 */}
      <div className="flex items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={onResetParams}
          className="inline-flex items-center justify-center rounded-[7px] border border-line bg-white/5 px-4 py-2 text-[13px] font-semibold text-ink-2 transition-all hover:border-line-strong hover:bg-white/[0.09] hover:text-ink"
        >
          重置参数
        </button>
        <button
          type="button"
          onClick={onRunInfer}
          disabled={!ready}
          className="inline-flex items-center justify-center gap-1.5 rounded-[7px] bg-gradient-to-br from-[#1fb8a4] to-[#0e8f96] px-[22px] py-[9px] text-[13.5px] font-semibold text-white shadow-[0_3px_14px_rgba(45,212,191,.22)] transition-transform hover:-translate-y-px hover:shadow-[0_5px_18px_rgba(45,212,191,.35)]"
        >
          启动智能推理与决策
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <path d="M12 3v12M5 10l7 7 7-7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

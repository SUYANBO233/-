'use client';

import { useEffect, useState } from 'react';
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts';
import type { ArchMechanism, SafetyAssessment, SupportComponent } from '@/lib/types';
import { cn } from '@/lib/utils';

interface SupportDesignProps {
  checking?: boolean;
  reporting?: boolean;
  reference?: boolean;
  mechanism: ArchMechanism;
  support: SupportComponent[];
  safety: SafetyAssessment | null;
  adjusted: Set<SupportComponent['key']>;
  onAdjust: (key: SupportComponent['key'], value: number) => void;
  onRecheck: () => void;
  onBack: () => void;
  onGenerate: () => void;
}

export function SupportDesign({
  checking = false,
  reporting = false,
  reference = true,
  mechanism,
  support,
  safety,
  adjusted,
  onAdjust,
  onRecheck,
  onBack,
  onGenerate,
}: SupportDesignProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const score = safety?.score ?? 0;
  const scoreColor = score > 75 ? '#3ddc97' : score >= 60 ? '#f7b955' : '#f87171';
  const arcLength = 2 * Math.PI * 55;
  const offset = arcLength * (1 - score / 100);

  const radarData =
    safety?.radar.labels.map((label, i) => ({
      label,
      value: safety.radar.data[i],
    })) ?? [];

  return (
    <div className="mb">
      <div className="sec-title">
        Step 3 · 初期支护设计与评估
        <span className="sub">{reference ? '参考模板与演示评分 · 未经工程标定' : '算法服务返回的设计与评估结果'}</span>
      </div>

      {/* 成拱力学机理 */}
      <div
        className="card mb"
        style={{ background: 'linear-gradient(180deg,rgba(45,212,191,.04),rgba(255,255,255,.01))' }}
      >
        <div className="card-title mb-3 flex items-center gap-2 text-[14.5px] font-semibold text-ink">
          围岩成拱参数
          <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11.5px] font-medium text-warn">
            {reference ? '参考模板' : '算法结果'}
          </span>
        </div>
        <div className="mech-grid">
          <div className="mech-cell">
            <div className="mv text-brand">{mechanism.height}</div>
            <div className="ml">压力拱高度{reference && '（参考）'}</div>
          </div>
          <div className="mech-cell">
            <div className="mv text-warn">{mechanism.release}</div>
            <div className="ml">围岩成拱应力释放率</div>
          </div>
          <div className="mech-cell">
            <div className="mv text-ok">{mechanism.closeTime}</div>
            <div className="ml">初支封闭时机{reference && '（参考）'}</div>
          </div>
          <div className="mech-cell">
            <div className="mv leading-snug text-violet" style={{ fontSize: 15 }}>
              {reference ? '项目参考规则' : '后端算法服务'}
            </div>
            <div className="ml">地质参数 → 四类支护配置</div>
          </div>
        </div>
      </div>

      {/* 四大支护构件 */}
      <div className="mb grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {support.map((s) => (
          <div key={s.key} className="support-card" style={{ ['--sc' as string]: s.color }}>
            <div className="sc-head">
              <span className="st">{s.label}</span>
              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-medium text-brand">
                {reference ? '参考模板' : `${Math.round(s.conf * 100)}% 置信`}
              </span>
            </div>
            <div className="sc-p">
              <span className="l">规格型号</span>
              <span className="v">{s.spec}</span>
            </div>
            <div className="sc-p">
              <span className="l">当前配置</span>
              <b className="v text-brand">{s.layout}</b>
            </div>
            <div className="sc-p">
              <span className="l">设计依据</span>
              <span className="v text-[11.5px] font-normal text-ink-3">{s.basis}</span>
            </div>

            <div className="sc-input-edit-box">
              <div className="sc-input-row">
                <span className="text-ink-2">
                  数值修改
                  {adjusted.has(s.key) && (
                    <span className="ml-1 text-[10px] text-warn">(已微调)</span>
                  )}
                  :
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={s.valNum}
                    step={s.key === 'anchor' ? 0.1 : 1}
                    onChange={(e) => onAdjust(s.key, Number(e.target.value))}
                  />
                  <span className="text-[10.5px] text-ink-3">{s.unit}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 安全度评估 + 雷达图 */}
      <div className="mb grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <div className="card" style={{ borderTop: '3px solid #3ddc97' }}>
          <div className="card-title mb-3 flex items-center gap-2 text-[14.5px] font-semibold text-ink">
            {reference ? '支护参数参考评分' : '初期支护安全度评估'}
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11.5px] font-medium',
                score > 75
                  ? 'bg-ok-soft text-ok'
                  : score >= 60
                    ? 'bg-warn-soft text-warn'
                    : 'bg-danger-soft text-danger',
              )}
            >
              {checking ? '正在重新评估…' : safety?.tag ?? '等待评估'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-[18px]">
            <div className="gauge">
              <svg viewBox="0 0 140 140" className="h-[140px] w-[140px]">
                <circle cx="70" cy="70" r="55" fill="none" stroke="rgba(120,165,230,.12)" strokeWidth="9" />
                <circle
                  cx="70"
                  cy="70"
                  r="55"
                  fill="none"
                  stroke={scoreColor}
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={arcLength}
                  strokeDashoffset={offset}
                  transform="rotate(-90 70 70)"
                  style={{ transition: 'all .8s ease' }}
                />
              </svg>
              <div className="g-num">
                <div className="v" style={{ color: scoreColor }}>
                  {safety ? score : '—'}
                </div>
                <div className="l">{reference ? '参考评分' : '综合安全度'}</div>
              </div>
            </div>
            <div className="min-w-[180px] flex-1">
              <div className="text-[12px] leading-relaxed text-ink-2">{safety?.reason}</div>
              <div className="mt-2 flex justify-between text-[10.5px] text-ink-3">
                <span className="text-danger">{reference ? '较低' : '危险'} &lt; 60</span>
                <span className="text-warn">{reference ? '一般' : '注意'} 60~75</span>
                <span className="text-ok">{reference ? '较高' : '安全'} &gt; 75</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title mb-3 text-[14.5px] font-semibold text-ink">
            {reference ? '支护参数参考指标雷达图' : '支护结构分项安全裕度雷达图'}
          </div>
          <div className="h-[190px] w-full">
            {mounted && (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="72%">
                  <PolarGrid stroke="rgba(120,165,230,.2)" />
                  <PolarAngleAxis dataKey="label" tick={{ fill: '#a9bdd8', fontSize: 10.5 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar
                    name={reference ? '参考指标' : '安全裕度指标'}
                    dataKey="value"
                    stroke="#2dd4bf"
                    fill="rgba(45,212,191,.18)"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onRecheck}
          disabled={checking || reporting}
          className="inline-flex items-center gap-1.5 rounded-[7px] border border-line bg-white/5 px-4 py-2 text-[13px] font-semibold text-ink-2 transition-all hover:border-line-strong hover:bg-white/[0.09] hover:text-ink"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6" />
          </svg>
          {checking ? '正在评估…' : reference ? '重新计算参考评分' : '重新校核安全度'}
        </button>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center justify-center rounded-[7px] border border-line bg-white/5 px-4 py-2 text-[13px] font-semibold text-ink-2 transition-all hover:border-line-strong hover:bg-white/[0.09] hover:text-ink"
          >
            返回修改工法
          </button>
          <button
            type="button"
            onClick={onGenerate}
            disabled={checking || reporting || !safety}
            className="inline-flex items-center justify-center gap-1.5 rounded-[7px] bg-gradient-to-br from-[#1fb8a4] to-[#0e8f96] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_3px_14px_rgba(45,212,191,.22)] transition-transform hover:-translate-y-px hover:shadow-[0_5px_18px_rgba(45,212,191,.35)]"
          >
            {reporting ? '正在生成报告…' : '生成全套施工配置报告'}
          </button>
        </div>
      </div>
    </div>
  );
}

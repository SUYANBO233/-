'use client';

import { cn } from '@/lib/utils';
import type { DecisionStep } from '@/hooks/use-decision';

interface FlowBarProps {
  step: DecisionStep;
  onJump: (step: DecisionStep) => void;
  /** 各步骤是否已产生产物，决定能否跳转 */
  reachable: { method: boolean; support: boolean; scheme: boolean };
}

const STEPS: { step: DecisionStep; title: string; desc: string }[] = [
  { step: 1, title: '地质参数', desc: '工程参数与来源' },
  { step: 2, title: '钻爆工法对比匹配', desc: '台阶法 / 环形核心土法 / 全断面法' },
  { step: 3, title: '支护参数设计', desc: '完整配置与人工调整' },
  { step: 4, title: '施工配置方案报告', desc: '报告生成与归档' },
];

function Arrow() {
  return (
    <span className="flow-arrow">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </span>
  );
}

export function FlowBar({ step, onJump, reachable }: FlowBarProps) {
  const canJump = (s: DecisionStep): boolean => {
    if (s === 1) return true;
    if (s === 2) return reachable.method;
    if (s === 3) return reachable.support;
    if (s === 4) return reachable.scheme;
    return false;
  };

  return (
    <div className="flow-bar" id="flowBar">
      {STEPS.map((s, i) => {
        const state = s.step < step ? 'done' : s.step === step ? 'active' : '';
        const enabled = canJump(s.step);
        return (
          <div key={s.step} className="contents">
            <div
              role="button"
              tabIndex={enabled ? 0 : -1}
              onClick={() => enabled && onJump(s.step)}
              onKeyDown={(e) => {
                if (enabled && (e.key === 'Enter' || e.key === ' ')) onJump(s.step);
              }}
              className={cn('flow-step', state, !enabled && 'cursor-default')}
            >
              <div className="fc">{s.step < step ? '✓' : s.step}</div>
              <div className="fi">
                <div className="t">{s.title}</div>
                <div className="d">{s.desc}</div>
              </div>
            </div>
            {i < STEPS.length - 1 && <Arrow />}
          </div>
        );
      })}
    </div>
  );
}

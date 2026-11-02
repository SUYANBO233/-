'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { DecisionPlaceholder } from '@/components/decision/decision-placeholder';
import { DecisionLoadingModal } from '@/components/decision/decision-loading-modal';
import { DecisionWorkbench } from '@/components/decision/decision-workbench';
import { FlowBar } from '@/components/decision/flow-bar';
import { MethodSelect } from '@/components/decision/method-select';
import { SchemeReportView } from '@/components/decision/scheme-report';
import { SupportDesign } from '@/components/decision/support-design';
import { TopBar } from '@/components/overview/top-bar';
import { useDecision, type DecisionStep } from '@/hooks/use-decision';
import { saveDecisionScheme } from '@/lib/api';
import { DECISION_CHANNEL } from '@/lib/decision-adapter';
import type { SaveDecisionResult } from '@/lib/types';

export default function DecisionPage() {
  const d = useDecision();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saved, setSaved] = useState<{ key: string; result: SaveDecisionResult } | null>(null);

  // 各步骤区块的滚动锚点
  const workbenchRef = useRef<HTMLDivElement>(null);
  const methodRef = useRef<HTMLDivElement>(null);
  const supportRef = useRef<HTMLDivElement>(null);
  const schemeRef = useRef<HTMLDivElement>(null);

  const scrollTo = (el: HTMLElement | null) => {
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleJump = (s: DecisionStep) => {
    if (s === 1) scrollTo(workbenchRef.current);
    if (s === 2) scrollTo(methodRef.current);
    if (s === 3) scrollTo(supportRef.current);
    if (s === 4) scrollTo(schemeRef.current);
  };


  const handleSave = async () => {
    const request = d.saveRequest;
    if (!request || savingRef.current || saved?.key === request.requestKey) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await saveDecisionScheme(request);
      setSaved({ key: request.requestKey, result });
      toast.success('方案已保存至方案与决策台账', { description: `报告编号 ${result.report.no}` });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : '方案未保存，请重试');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <TopBar />
      <main className="mx-auto max-w-[1600px] px-6 pb-16 pt-5">
        {/* 页面头部 */}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2.5 text-[21px] font-bold tracking-wide">
              <span
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg"
                style={{ background: 'rgba(45,212,191,.12)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="2" aria-hidden>
                  <path d="M12 3v18M5 8l7-5 7 5M5 16l7 5 7-5" />
                </svg>
              </span>
              智能决策中心
            </h1>
          </div>
        </div>

        {d.error && <div role="alert" className="mb-3 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {d.error}
        </div>}
        <div className="mb-3 text-xs text-ink-3">
          {d.algorithm || d.meta.algorithm ? `${(d.algorithm ?? d.meta.algorithm)?.id} · ${(d.algorithm ?? d.meta.algorithm)?.version}` : '正在连接决策服务…'}
          {(d.algorithm ?? d.meta.algorithm)?.reference && <span className="ml-2 text-warn">参考规则演示 · 未经工程标定</span>}
          {!d.metaReady && <button type="button" className="ml-3 underline" onClick={d.retryMeta}>重新连接后端</button>}
        </div>

        <FlowBar
          step={d.step}
          onJump={handleJump}
          reachable={{
            method: d.methods.length > 0,
            support: d.support.length > 0,
            scheme: d.scheme !== null,
          }}
        />

        <div ref={workbenchRef} className="scroll-mt-20">
          <DecisionWorkbench
            meta={d.meta}
            mileage={d.mileage}
            ready={d.metaReady}
            mode={d.mode}
            workface={d.workface}
            params={d.params}
            onModeChange={d.changeMode}
            onWorkfaceChange={d.changeWorkface}
            onMileageChange={d.changeMileage}
            onParamChange={d.updateParam}
            onResetParams={d.resetParams}
            onRunInfer={async () => {
              await d.runInfer();
              scrollTo(methodRef.current);
            }}
          />
        </div>

        {/* 决策产物区 */}
        {d.step === 1 && <DecisionPlaceholder />}

        {d.step >= 2 && (
          <div ref={methodRef} className="scroll-mt-20">
            <MethodSelect
              methods={d.methods}
              selectedKey={d.selectedMethodKey}
              onSelect={d.selectMethod}
              onConfirm={async () => {
                await d.confirmMethod();
                scrollTo(supportRef.current);
              }}
              onReset={d.reset}
            />
          </div>
        )}

        {d.step >= 3 && (
          <div ref={supportRef} className="scroll-mt-20">
            <SupportDesign
              mechanism={d.mechanism ?? { height: "—", release: "—", closeTime: "—" }}
              checking={d.checking}
              reporting={d.reporting}
              reference={d.algorithm?.reference ?? true}
              support={d.support}
              safety={d.safety}
              adjusted={d.adjusted}
              onAdjust={d.adjustSupport}
              onRecheck={d.recheck}
              onBack={d.backToMethod}
              onGenerate={async () => {
                await d.buildScheme();
                setTimeout(() => scrollTo(schemeRef.current), 80);
              }}
            />
          </div>
        )}

        {d.step >= 4 && d.scheme && (
          <div ref={schemeRef} className="scroll-mt-20">
            <SchemeReportView
              scheme={saved && saved.key === d.saveRequest?.requestKey ? saved.result.report : d.scheme}
              onSave={DECISION_CHANNEL === 'backend' ? handleSave : undefined}
              saving={saving}
              saved={saved?.key === d.saveRequest?.requestKey}
            />
            {DECISION_CHANNEL === 'mock' && <p className="mt-2 text-xs text-ink-3">离线演示仅提供预览；切换 Python 通道并重新计算后可保存。</p>}
          </div>
        )}
      </main>

      {/* 决策工法 / 支护参数 推理等待弹窗 */}
      <DecisionLoadingModal kind={d.loading} />
    </div>
  );
}

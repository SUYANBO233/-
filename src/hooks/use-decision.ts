'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_GEO_PARAMS_IV, DEFAULT_GEO_PARAMS_V, DECISION_META } from '@/data/decision';
import { applySupportValue } from '@/lib/decision-engine';
import { designSupportCandidates, inferMethodCandidates, loadDecisionMeta, recheckSupport, buildSchemeReport } from '@/lib/decision-adapter';
import type {
  AlgorithmInfo, ArchMechanism, DecisionMeta, DecisionMode, DecisionRevisionInput, GeoParams,
  MethodMatch, RockGrade, SafetyAssessment, SaveDecisionRequest, SchemeReport, SupportComponent,
} from '@/lib/types';

export type DecisionStep = 1 | 2 | 3 | 4;
export type DecisionLoadingPhase = 'method' | 'support' | null;
export interface DecisionState {
  step: DecisionStep; methods: MethodMatch[]; selectedMethodKey: string | null;
  support: SupportComponent[]; safety: SafetyAssessment | null; mechanism: ArchMechanism | null;
  algorithm: AlgorithmInfo | null; scheme: SchemeReport | null;
  adjusted: Set<SupportComponent['key']>; revisions: DecisionRevisionInput[];
  saveRequest: SaveDecisionRequest | null; needsCheck: boolean;
}
function initialState(): DecisionState {
  return { step: 1, methods: [], selectedMethodKey: null, support: [], safety: null, mechanism: null,
    algorithm: null, scheme: null, adjusted: new Set(), revisions: [], saveRequest: null, needsCheck: false };
}
function revision(methodKey: string, support: SupportComponent[], reason: string): DecisionRevisionInput {
  if (methodKey !== 'full' && methodKey !== 'bench' && methodKey !== 'core') throw new Error('未知工法');
  const value = (key: SupportComponent['key']): number => {
    const component = support.find((item) => item.key === key);
    if (!component) throw new Error(`缺少支护构件：${key}`);
    return component.valNum;
  };
  return { methodKey, values: { steel: value('steel'), shot: value('shot'), anchor: value('anchor'), advance: value('advance') }, reason };
}
const message = (error: unknown): string => error instanceof Error ? error.message : '决策服务请求失败';
function sameAlgorithm(left: AlgorithmInfo | null, right: AlgorithmInfo | undefined): boolean {
  return Boolean(left && right && left.id === right.id && left.version === right.version && left.reference === right.reference);
}

export function useDecision() {
  const [input, setInput] = useState({ mode: 'joint' as DecisionMode, workface: 'shayi_main', mileage: 'K3601+200', params: DEFAULT_GEO_PARAMS_IV });
  const [state, setState] = useState<DecisionState>(initialState);
  const [meta, setMeta] = useState<DecisionMeta>(DECISION_META);
  const [metaReady, setMetaReady] = useState(false);
  const [metaRetry, setMetaRetry] = useState(0);
  const [loading, setLoading] = useState<DecisionLoadingPhase>(null);
  const [checking, setChecking] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [checkTick, setCheckTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const epoch = useRef(0);

  const invalidate = useCallback(() => {
    epoch.current += 1; setState(initialState()); setLoading(null); setChecking(false); setReporting(false); setError(null);
  }, []);

  useEffect(() => {
    let live = true;
    setMetaReady(false);
    void loadDecisionMeta().then((data) => {
      if (!live) return;
      invalidate(); setMeta(data);
      setInput((prev) => ({ ...prev,
        workface: data.workfaces.some((item) => item.value === prev.workface) ? prev.workface : data.workfaces[0].value,
        mileage: data.mileages.some((item) => item.mile === prev.mileage) ? prev.mileage : data.mileages[0].mile,
      }));
      setMetaReady(true);
    }).catch((reason: unknown) => { if (live) setError(message(reason)); });
    return () => { live = false; };
  }, [invalidate, metaRetry]);

  const changeMode = useCallback((mode: DecisionMode) => { invalidate(); setInput((prev) => ({ ...prev, mode })); }, [invalidate]);
  const updateParam = useCallback(<K extends keyof GeoParams>(key: K, value: GeoParams[K]) => {
    invalidate(); setInput((prev) => ({ ...prev, params: { ...prev.params, [key]: value } }));
  }, [invalidate]);
  const changeWorkface = useCallback((workface: string, grade: RockGrade) => {
    invalidate(); setInput((prev) => ({ ...prev, workface, params: grade === 'V' ? DEFAULT_GEO_PARAMS_V : DEFAULT_GEO_PARAMS_IV }));
  }, [invalidate]);
  const changeMileage = useCallback((mileage: string) => { invalidate(); setInput((prev) => ({ ...prev, mileage })); }, [invalidate]);
  const resetParams = useCallback(() => {
    invalidate(); setInput((prev) => ({ ...prev, params: prev.params.grade === 'V' ? DEFAULT_GEO_PARAMS_V : DEFAULT_GEO_PARAMS_IV }));
  }, [invalidate]);

  const runInfer = useCallback(async () => {
    if (!metaReady) return;
    const current = ++epoch.current;
    setLoading('method'); setError(null);
    try {
      const result = await inferMethodCandidates(input);
      if (epoch.current === current) setState({ ...initialState(), methods: result.methods, algorithm: result.algorithm,
        selectedMethodKey: result.methods.find((item) => item.matched)?.key ?? result.methods[0]?.key ?? null, step: 2 });
    } catch (reason: unknown) { if (epoch.current === current) setError(message(reason)); }
    finally { if (epoch.current === current) setLoading(null); }
  }, [input, metaReady]);

  const selectMethod = useCallback((key: string) => {
    epoch.current += 1; setLoading(null); setChecking(false); setReporting(false); setError(null);
    setState((prev) => ({ ...prev, selectedMethodKey: key, support: [], safety: null, mechanism: null,
      scheme: null, saveRequest: null, needsCheck: false, step: 2 }));
  }, []);

  const confirmMethod = useCallback(async () => {
    const methodKey = state.selectedMethodKey;
    if (!methodKey) return;
    const current = ++epoch.current;
    setLoading('support'); setError(null);
    try {
      const result = await designSupportCandidates({ ...input, methodKey });
      if (!sameAlgorithm(state.algorithm, result.algorithm)) throw new Error('算法版本已变化，请重新推理');
      if (epoch.current === current) setState((prev) => ({ ...prev, ...result, scheme: null, saveRequest: null,
        needsCheck: false, adjusted: new Set(), step: 3,
        revisions: [...prev.revisions, revision(methodKey, result.support, '初始支护设计')] }));
    } catch (reason: unknown) { if (epoch.current === current) setError(message(reason)); }
    finally { if (epoch.current === current) setLoading(null); }
  }, [input, state.selectedMethodKey, state.algorithm]);

  const adjustSupport = useCallback((key: SupportComponent['key'], value: number) => {
    const limit = { steel: 1000, shot: 200, anchor: 100, advance: 1000 }[key];
    if (!Number.isFinite(value) || value <= 0 || value > limit) { setError(`请输入大于 0 且不超过 ${limit} 的${key}数值`); return; }
    epoch.current += 1; setReporting(false); setError(null);
    setState((prev) => {
      if (!prev.selectedMethodKey || prev.support.length === 0) return prev;
      const support = prev.support.map((item) => item.key === key ? applySupportValue(item, value) : item);
      return { ...prev, support, safety: null, scheme: null, saveRequest: null, step: 3, needsCheck: true,
        adjusted: new Set([...prev.adjusted, key]), revisions: [...prev.revisions, revision(prev.selectedMethodKey, support, `调整${key}`)] };
    });
  }, []);

  useEffect(() => {
    if (!state.needsCheck || !state.selectedMethodKey) { setChecking(false); return; }
    const current = epoch.current;
    let live = true;
    setChecking(true);
    const timer = setTimeout(() => {
      void recheckSupport({ ...input, methodKey: state.selectedMethodKey!, support: state.support }).then((safety) => {
        if (!live || epoch.current !== current) return;
        if (!sameAlgorithm(state.algorithm, safety.algorithm)) throw new Error('算法版本已变化，请重新推理');
        setState((prev) => ({ ...prev, safety, needsCheck: false })); setError(null);
      }).catch((reason: unknown) => { if (live && epoch.current === current) setError(message(reason)); })
        .finally(() => { if (live && epoch.current === current) setChecking(false); });
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [input, state.needsCheck, state.support, state.selectedMethodKey, state.algorithm, checkTick]);

  const recheck = useCallback(() => {
    epoch.current += 1; setReporting(false);
    setError(null); setCheckTick((value) => value + 1);
    setState((prev) => !prev.selectedMethodKey || prev.support.length === 0 ? prev : ({ ...prev, safety: null,
      scheme: null, saveRequest: null, needsCheck: true, step: 3,
      revisions: [...prev.revisions, revision(prev.selectedMethodKey, prev.support, '人工重新校核')] }));
  }, []);

  const buildScheme = useCallback(async () => {
    if (!state.selectedMethodKey || !state.safety || state.needsCheck || checking) return;
    const current = ++epoch.current;
    setReporting(true); setError(null);
    try {
      const scheme = await buildSchemeReport({ ...input, methodKey: state.selectedMethodKey, support: state.support });
      if (!sameAlgorithm(state.algorithm, scheme.algorithm)) throw new Error('算法版本已变化，请重新推理');
      const saveRequest: SaveDecisionRequest = { ...input, requestKey: crypto.randomUUID(), revisions: structuredClone(state.revisions),
        ...(state.algorithm ? { algorithm: state.algorithm } : {}) };
      if (epoch.current === current) setState((prev) => ({ ...prev, scheme, step: 4, saveRequest }));
    } catch (reason: unknown) { if (epoch.current === current) setError(message(reason)); }
    finally { if (epoch.current === current) setReporting(false); }
  }, [input, state, checking]);

  const backToMethod = useCallback(() => {
    epoch.current += 1; setChecking(false); setReporting(false);
    setState((prev) => ({ ...prev, step: 2, scheme: null, saveRequest: null, needsCheck: false }));
  }, []);
  const selectedMethod = useMemo(() => state.methods.find((method) => method.key === state.selectedMethodKey) ?? null, [state.methods, state.selectedMethodKey]);
  return { ...input, ...state, selectedMethod, loading, checking, reporting, error, meta, metaReady,
    retryMeta: () => setMetaRetry((value) => value + 1), changeMode, updateParam, changeWorkface, changeMileage,
    runInfer, selectMethod, confirmMethod, adjustSupport, recheck, buildScheme, backToMethod, reset: invalidate, resetParams };
}

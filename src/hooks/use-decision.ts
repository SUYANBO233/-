'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_EVALUATION_CONTEXT, type EvaluationContext } from '@/lib/response';
import { DEFAULT_GEO_PARAMS_IV, DECISION_META } from '@/data/decision';
import { synchronizeDecision, fetchSupportOptions } from '@/lib/api';
import { geoParamsSchema } from '@/lib/validation/geo';
import type { SupportTemplate } from '@/lib/decision-catalog';
import { applySupportValue } from '@/lib/decision-engine';
import { designSupportCandidates, inferMethodCandidates, loadDecisionMeta, recheckSupport, buildSchemeReport } from '@/lib/decision-adapter';
import type {
  AlgorithmInfo, ArchMechanism, DecisionMeta, DecisionMode, DecisionRevisionInput, GeoParams,
  MethodMatch, RockGrade, SafetyAssessment, SaveDecisionRequest, SchemeReport, SupportComponent, TemplateReference,
} from '@/lib/types';

export type DecisionStep = 1 | 2 | 3 | 4;
export type DecisionLoadingPhase = 'method' | 'support' | null;
export interface DecisionState {
  step: DecisionStep; methods: MethodMatch[]; selectedMethodKey: string | null;
  support: SupportComponent[]; safety: SafetyAssessment | null; mechanism: ArchMechanism | null;
  baselineSafety: SafetyAssessment | null;
  algorithm: AlgorithmInfo | null; scheme: SchemeReport | null;
  adjusted: Set<SupportComponent['key']>; revisions: DecisionRevisionInput[];
  saveRequest: SaveDecisionRequest | null; needsCheck: boolean;
  template: TemplateReference | null; templateOptions: SupportTemplate[]; manualReason: string;
}
function initialState(): DecisionState {
  return { step: 1, methods: [], selectedMethodKey: null, support: [], safety: null, mechanism: null,
    baselineSafety:null,algorithm: null, scheme: null, adjusted: new Set(), revisions: [], saveRequest: null, needsCheck: false, template:null, templateOptions:[], manualReason:'' };
}
function revision(methodKey: string, support: SupportComponent[], reason: string, template: TemplateReference | null, manualReason: string): DecisionRevisionInput {
  if (methodKey !== 'full' && methodKey !== 'bench' && methodKey !== 'core') throw new Error('未知工法');
  const value = (key: SupportComponent['key']): number => {
    const component = support.find((item) => item.key === key);
    if (!component) throw new Error(`缺少支护构件：${key}`);
    return component.valNum;
  };
  return { methodKey, template, manualReason, values: { steel: value('steel'), shot: value('shot'), anchor: value('anchor'), advance: value('advance') }, reason };
}
const emptyParams: GeoParams = { hardness:'',integrity:'',thickness:'',water:'',grade:'IV',section:'',depth:0,density:0,sharePrimary:0,shareSecondary:0,friction:0,elastic:0,cohesion:0,poisson:0,stressV:0,stressH:0 };
interface InputOrigin { observationId:string | null; label:string; observedAt:string | null; missing:string[]; modified:boolean }
const defaultOrigin = (): InputOrigin => ({ observationId:null,label:'页面初始值，尚未同步采集记录',observedAt:null,missing:[],modified:false });
const suppliedParams = (params:GeoParams,missing:string[]) => geoParamsSchema.partial().parse(Object.fromEntries(Object.entries(params).filter(([key]) => !missing.includes(key))));
const message = (error: unknown): string => error instanceof Error ? error.message : '决策服务请求失败';
function sameAlgorithm(left: AlgorithmInfo | null, right: AlgorithmInfo | undefined): boolean {
  return Boolean(left && right && left.id === right.id && left.version === right.version && left.reference === right.reference);
}

export function useDecision() {
  const [input, setInput] = useState({ evaluationContext:DEFAULT_EVALUATION_CONTEXT,mode: 'joint' as DecisionMode, workface: '', mileage: 'K3601+200', params: DEFAULT_GEO_PARAMS_IV });
  const [origin,setOrigin] = useState<InputOrigin>(defaultOrigin);
  const baseline = useRef({ params:DEFAULT_GEO_PARAMS_IV,origin:defaultOrigin() });
  const [syncing,setSyncing] = useState(false);
  const [state, setState] = useState<DecisionState>(initialState);
  const [meta, setMeta] = useState<DecisionMeta>(DECISION_META);
  const [metaReady, setMetaReady] = useState(false);
  const [metaRetry, setMetaRetry] = useState(0);
  const [loading, setLoading] = useState<DecisionLoadingPhase>(null);
  const [checking, setChecking] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const epoch = useRef(0);

  const invalidate = useCallback(() => {
    epoch.current += 1; setState(initialState()); setLoading(null); setChecking(false); setReporting(false); setSyncing(false); setError(null);
  }, []);

  useEffect(() => {
    let live = true;
    setMetaReady(false);
    void loadDecisionMeta().then((data) => {
      if (!live) return;
      invalidate(); setMeta(data);
      setInput((prev) => ({ ...prev,
        workface: data.workfaces.some((item) => item.value === prev.workface) ? prev.workface : data.workfaces[0]?.value ?? '',
        mileage: data.mileages.some((item) => item.mile === prev.mileage) ? prev.mileage : data.mileages[0]?.mile ?? prev.mileage,
      }));
      setMetaReady(true);
    }).catch((reason: unknown) => { if (live) setError(message(reason)); });
    return () => { live = false; };
  }, [invalidate, metaRetry]);

  const changeEvaluationContext = useCallback((evaluationContext:EvaluationContext) => { invalidate();setInput((prev) => ({ ...prev,evaluationContext })); },[invalidate]);
  const changeMode = useCallback((mode: DecisionMode) => { invalidate(); setInput((prev) => ({ ...prev, mode })); }, [invalidate]);
  const updateParam = useCallback(<K extends keyof GeoParams>(key: K, value: GeoParams[K]) => {
    invalidate(); setInput((prev) => ({ ...prev, params: { ...prev.params, [key]: value } }));
    setOrigin((prev) => ({ ...prev,modified:true,missing:prev.missing.filter((name) => name !== key) }));
  }, [invalidate]);
  const clearLocation = useCallback(() => {
    invalidate();setOrigin({ ...defaultOrigin(),missing:Object.keys(emptyParams) });baseline.current={ params:DEFAULT_GEO_PARAMS_IV,origin:defaultOrigin() };
  },[invalidate]);
  const changeWorkface = useCallback((workface: string,_grade: RockGrade) => {
    clearLocation();setInput((prev) => ({ ...prev,workface,params:emptyParams }));
  },[clearLocation]);
  const changeMileage = useCallback((mileage: string) => {
    clearLocation();setInput((prev) => ({ ...prev,mileage,params:emptyParams }));
  },[clearLocation]);
  const resetParams = useCallback(() => {
    invalidate();setInput((prev) => ({ ...prev,params:structuredClone(baseline.current.params) }));setOrigin(structuredClone(baseline.current.origin));
  },[invalidate]);
  const synchronize = useCallback(async () => {
    invalidate();const current=epoch.current;setSyncing(true);
    try {
      const result=await synchronizeDecision(input.workface,input.mileage);
      if (epoch.current !== current) return;
      const observation=result.observation;
      const params: GeoParams={ ...emptyParams,...observation?.params };
      const nextOrigin: InputOrigin={ observationId:observation?.id ?? null,
        label:observation ? `${observation.source === 'simulation' ? '临时测试资料' : observation.source} · ${observation.testBatchId ?? observation.id}` : result.message,
        observedAt:observation?.observedAt ?? null,missing:observation ? result.missing : Object.keys(emptyParams),modified:false };
      setInput((prev) => ({ ...prev,params }));setOrigin(nextOrigin);baseline.current={ params,origin:nextOrigin };
      if (result.status !== 'found') setError(result.message);
    } catch (reason: unknown) {
      if (epoch.current === current) { setError(message(reason));setOrigin(defaultOrigin());setInput((prev) => ({ ...prev,params:emptyParams })); }
    } finally { if (epoch.current === current) setSyncing(false); }
  },[input.workface,input.mileage,invalidate]);

  const runInfer = useCallback(async () => {
    if (!metaReady || syncing) return;
    if (input.mode === 'joint' && !origin.observationId && meta.algorithm?.capabilities?.includes('observation-sync')) { setError('联合模式请先同步对应位置资料，或切换手动模式明确录入');return; }
    const parsed=geoParamsSchema.partial().safeParse(Object.fromEntries(Object.entries(input.params).filter(([key]) => !origin.missing.includes(key))));
    if (!parsed.success) { setError(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('；'));return; }
    const current = ++epoch.current;
    setState(initialState());setChecking(false);setReporting(false);setLoading('method'); setError(null);
    try {
      const result = await inferMethodCandidates({ ...input,params:parsed.data });
      const recommended=result.methods.filter((item) => item.matched);
      if (epoch.current === current) setState({ ...initialState(),methods:result.methods,algorithm:result.algorithm,
        selectedMethodKey:recommended.length === 1 ? recommended[0].key : null,step:2 });
    } catch (reason: unknown) { if (epoch.current === current) setError(message(reason)); }
    finally { if (epoch.current === current) setLoading(null); }
  }, [input, metaReady,origin,syncing,meta.algorithm]);

  const selectMethod = useCallback((key: string) => {
    epoch.current += 1; setLoading(null); setChecking(false); setReporting(false); setError(null);
    setState((prev) => prev.methods.find((item) => item.key === key)?.status === 'inapplicable' ? prev : ({ ...prev,selectedMethodKey:key,support:[],safety:null,mechanism:null,
      scheme:null,saveRequest:null,needsCheck:false,step:2,template:null,templateOptions:[],manualReason:'' }));
  }, []);

  const setManualReason = useCallback((manualReason: string) => {
    epoch.current+=1;setLoading(null);setError(null);
    setState((prev) => ({ ...prev,manualReason,support:[],safety:null,scheme:null,saveRequest:null,step:2 }));
  },[]);
  const selectTemplate = useCallback((template: TemplateReference) => {
    epoch.current+=1;setLoading(null);setError(null);
    setState((prev) => ({ ...prev,template,support:[],safety:null,scheme:null,saveRequest:null,step:2 }));
  },[]);
  const confirmMethod = useCallback(async () => {
    const methodKey=state.selectedMethodKey;
    if (!methodKey) { setError('请先确认工法；并列推荐不会替你选择');return; }
    const current=++epoch.current;setLoading('support');setError(null);
    try {
      let template=state.template;
      const request={ ...input,params:suppliedParams(input.params,origin.missing),methodKey,manualReason:state.manualReason,algorithm:state.algorithm ?? undefined };
      if (state.algorithm?.capabilities?.includes('template-selection')) {
        const options=await fetchSupportOptions(request);
        if (epoch.current !== current) return;
        if (!sameAlgorithm(state.algorithm,options.algorithm)) throw new Error('资料版本变化，请重新匹配');
        setState((prev) => ({ ...prev,templateOptions:options.options }));
        if (!options.options.length) throw new Error('没有适用的已启用完整模板，请在经验库维护规则和模板');
        if (options.options.length === 1) template={ code:options.options[0].code,version:options.options[0].version };
        else if (!options.options.some((item) => item.code === template?.code && item.version === template.version)) throw new Error('存在同优先级模板，请在下方选择后再次确认');
      }
      const result=await designSupportCandidates({ ...request,template });
      if (!sameAlgorithm(state.algorithm,result.algorithm)) throw new Error('规则或模板版本变化，请重新匹配');
      if (epoch.current === current) setState((prev) => ({ ...prev,...result,baselineSafety:result.safety,template,scheme:null,saveRequest:null,needsCheck:false,adjusted:new Set(),step:3,
        revisions:[...prev.revisions,revision(methodKey,result.support,'初始支护设计',template,state.manualReason)] }));
    } catch (reason: unknown) { if (epoch.current === current) setError(message(reason)); }
    finally { if (epoch.current === current) setLoading(null); }
  },[input,state,origin.missing]);

  const adjustSupport = useCallback((key: SupportComponent['key'], value: number) => {
    const limit = { steel: 1000, shot: 200, anchor: 100, advance: 1000 }[key];
    if (!Number.isFinite(value) || value <= 0 || value > limit) { setError(`请输入大于 0 且不超过 ${limit} 的${key}数值`); return; }
    epoch.current += 1; setReporting(false);setChecking(false); setError(null);
    setState((prev) => {
      if (!prev.selectedMethodKey || prev.support.length === 0) return prev;
      const support = prev.support.map((item) => item.key === key ? applySupportValue(item, value) : item);
      return { ...prev, support, safety: null, scheme: null, saveRequest: null, step: 3, needsCheck: true,
        adjusted: new Set([...prev.adjusted, key]), revisions: [...prev.revisions, revision(prev.selectedMethodKey, support, `调整${key}`,prev.template,prev.manualReason)] };
    });
  }, []);

  const recheck = useCallback(async () => {
    if (!state.selectedMethodKey || !state.support.length) return;
    const current=++epoch.current;setChecking(true);setReporting(false);setError(null);setState((prev) => ({ ...prev,safety:null,scheme:null,saveRequest:null,needsCheck:true }));
    try {
      const safety=await recheckSupport({ ...input,params:suppliedParams(input.params,origin.missing),methodKey:state.selectedMethodKey,support:state.support,
        template:state.template,manualReason:state.manualReason,algorithm:state.algorithm ?? undefined });
      if (!sameAlgorithm(state.algorithm,safety.algorithm)) throw new Error('资料版本变化，请重新匹配');
      if (epoch.current === current) setState((prev) => ({ ...prev,safety,needsCheck:false,scheme:null,saveRequest:null,
        revisions:[...prev.revisions,revision(state.selectedMethodKey!,state.support,'人工重新检查',state.template,state.manualReason)] }));
    } catch (reason: unknown) { if (epoch.current === current) setError(message(reason)); }
    finally { if (epoch.current === current) setChecking(false); }
  },[input,state,origin.missing]);

  const buildScheme = useCallback(async () => {
    if (!state.selectedMethodKey || !state.safety || state.needsCheck || checking) return;
    const current = ++epoch.current;
    setReporting(true); setError(null);
    try {
      const scheme = await buildSchemeReport({ ...input,params:suppliedParams(input.params,origin.missing), methodKey: state.selectedMethodKey, support: state.support,template:state.template,manualReason:state.manualReason,algorithm:state.algorithm ?? undefined });
      if (!sameAlgorithm(state.algorithm, scheme.algorithm)) throw new Error('算法版本已变化，请重新推理');
      const saveRequest: SaveDecisionRequest = { ...input,params:suppliedParams(input.params,origin.missing),observationId:origin.observationId, requestKey: crypto.randomUUID(), revisions: structuredClone(state.revisions),
        ...(state.algorithm ? { algorithm: state.algorithm } : {}) };
      if (epoch.current === current) setState((prev) => ({ ...prev, scheme:{ ...scheme,baselineEvaluation:state.baselineSafety }, step: 4, saveRequest }));
    } catch (reason: unknown) { if (epoch.current === current) setError(message(reason)); }
    finally { if (epoch.current === current) setReporting(false); }
  }, [input, state, checking,origin.observationId,origin.missing]);

  const backToMethod = useCallback(() => {
    epoch.current += 1; setChecking(false); setReporting(false);
    setState((prev) => ({ ...prev, step: 2, scheme: null, saveRequest: null, needsCheck: false }));
  }, []);
  const selectedMethod = useMemo(() => state.methods.find((method) => method.key === state.selectedMethodKey) ?? null, [state.methods, state.selectedMethodKey]);
  return { ...input, ...state,origin,syncing,synchronize,selectTemplate,setManualReason, selectedMethod, loading, checking, reporting, error, meta, metaReady,
    changeEvaluationContext, retryMeta: () => setMetaRetry((value) => value + 1), changeMode, updateParam, changeWorkface, changeMileage,
    runInfer, selectMethod, confirmMethod, adjustSupport, recheck, buildScheme, backToMethod, reset: invalidate, resetParams };
}

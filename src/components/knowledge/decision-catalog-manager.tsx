'use client';

import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { catalogImportSchema, ruleSchema, templateSchema, observationSchema, FIELD_LABELS, type DecisionRule, type SupportTemplate, type StructuredSupport } from '@/lib/decision-catalog';
import { D1_FIXTURES } from '@/data/d1-fixtures';
import { DEFAULT_GEO_PARAMS_IV } from '@/data/decision';

const catalogSchema=z.object({ rules:z.array(ruleSchema),templates:z.array(templateSchema),observations:z.array(observationSchema),dataSource:z.string() });
type Catalog=z.infer<typeof catalogSchema>;
const emptyRule: DecisionRule={ ...D1_FIXTURES.rules[1],code:'new_rule',name:'新建工法规则',enabled:false };
const parameterLabels:Record<string,string>={ model:'型号',spacingCm:'纵向间距 cm',strength:'强度等级',thicknessCm:'厚度 cm',type:'类型',diameterMm:'直径 mm',lengthM:'长度 m',longitudinalSpacingCm:'纵向间距 cm',circumferentialSpacingCm:'环向间距 cm',ringSpacingCm:'环向间距 cm',scope:'布置范围' };
const groupLabels={ steel:'型钢钢架',shot:'喷射混凝土',anchor:'系统锚杆',advance:'超前支护' };
async function request(url:string,init?:RequestInit):Promise<unknown> {
  const response=await fetch(url,{ ...init,headers:{ 'Content-Type':'application/json',...init?.headers },cache:'no-store' });
  const data:unknown=await response.json();
  if (!response.ok) {
    const error=z.object({ message:z.string().optional(),issues:z.array(z.object({ path:z.array(z.union([z.string(),z.number()])),message:z.string() })).optional() }).safeParse(data);
    throw new Error(error.success ? `${error.data.message ?? '操作失败'}${error.data.issues?.map((item) => `；${item.path.join('.')}: ${item.message}`).join('') ?? ''}`:'请求失败');
  }
  return data;
}
export function DecisionCatalogManager({ focus='rules' }:{ focus?:'rules'|'templates'|'observations' }) {
  const [catalog,setCatalog]=useState<Catalog | null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [query,setQuery]=useState('');
  const [open,setOpen]=useState<'rule'|'template'|'import'|'observation' | null>(null);
  const [rule,setRule]=useState<DecisionRule>(emptyRule);
  const [conditions,setConditions]=useState(JSON.stringify(emptyRule.conditions,null,2));
  const [template,setTemplate]=useState<SupportTemplate>({ ...D1_FIXTURES.templates[0],code:'new_template',name:'新建完整支护模板',enabled:false });
  const [text,setText]=useState('');
  const [previewParams,setPreviewParams]=useState(JSON.stringify(DEFAULT_GEO_PARAMS_IV,null,2));
  const reload=useCallback(async () => {
    try { setCatalog(catalogSchema.parse(await request('/api/knowledge/decision-catalog')));setError(''); }
    catch (reason:unknown) { setError(reason instanceof Error ? reason.message:'读取失败'); }
  },[]);
  useEffect(() => { void reload(); },[reload]);
  const execute=async (operation:() => Promise<void>) => {
    setBusy(true);setError('');setNotice('');
    try { await operation(); }
    catch (reason:unknown) { setError(reason instanceof Error ? reason.message:'操作失败'); }
    finally { setBusy(false); }
  };
  const save=async () => execute(async () => {
    const input:unknown=open === 'rule' ? { formatVersion:1,rules:[{ ...rule,conditions:JSON.parse(conditions) }] }
      :open === 'template' ? { formatVersion:1,templates:[template] }
      :open === 'observation' ? { formatVersion:1,observations:[JSON.parse(text)] }:JSON.parse(text);
    const bundle=catalogImportSchema.parse(input);
    await request('/api/knowledge/decision-catalog',{ method:'POST',body:JSON.stringify(bundle) });
    setNotice('资料已保存；新决策读取新版本，历史报告保持原样。');setOpen(null);await reload();
  });
  const toggle=(kind:'rule'|'template',item:DecisionRule | SupportTemplate) => void execute(async () => {
    await request('/api/knowledge/decision-catalog',{ method:'PATCH',body:JSON.stringify({ kind,code:item.code,version:item.version,enabled:!item.enabled }) });
    setNotice('启用状态已保存；同一编码只启用一个版本。');await reload();
  });
  const newRule=(value?:DecisionRule) => {
    const next=value ? { ...value,version:value.version+1,enabled:false }:{ ...emptyRule,source:'simulation' as const,testBatchId:'local_ui' };
    setRule(next);setConditions(JSON.stringify(next.conditions,null,2));setNotice('');setOpen('rule');
  };
  const newTemplate=(value?:SupportTemplate) => {
    setTemplate(value ? { ...structuredClone(value),version:value.version+1,enabled:false }:{ ...structuredClone(D1_FIXTURES.templates[0]),code:'new_template',name:'新建完整模板',enabled:false,
      source:'simulation',testBatchId:'local_ui' });setOpen('template');
  };
  const exportData=() => {
    if (!catalog) return;
    const blob=new Blob([JSON.stringify({ formatVersion:1,rules:catalog.rules,templates:catalog.templates,observations:catalog.observations },null,2)],{ type:'application/json' });
    const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='decision-catalog-v1.json';link.click();URL.revokeObjectURL(url);
  };
  const visible=(item:{ code:string;name:string }) => `${item.code} ${item.name}`.toLowerCase().includes(query.toLowerCase());
  return <section className="space-y-3 rounded-xl border border-line bg-panel p-4" aria-label="可执行决策资料">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{focus === 'rules' ? '可执行工法与支护映射规则':focus === 'templates' ? '完整支护模板':'位置采集资料'}</h2>
      <span className="text-xs text-warn">{catalog?.dataSource === 'local-test' ? '隔离本地测试库 · 合成资料':'数据库资料'} · 规则/规格版本可追溯</span></div>
    <p className="text-xs text-ink-3">新版本启用后替代同编码旧版本。已发布内容不覆盖；“重置”只清除查询。下方旧知识映射为展示资料，不直接当作可执行规则。</p>
    {error && <div role="alert" className="whitespace-pre-wrap text-sm text-danger">{error}</div>}
    {notice && <div role="status" className="text-sm text-brand">{notice}</div>}
    <div className="flex flex-wrap gap-2"><Input aria-label="决策资料查询" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="编码或名称" className="max-w-xs" />
      <Button variant="outline" onClick={() => setQuery('')}>重置查询</Button><Button variant="outline" onClick={() => { void reload(); }}>刷新资料</Button>
      <Button onClick={() => focus === 'templates' ? newTemplate():newRule()} disabled={!catalog}>{focus === 'templates' ? '新增完整模板':'新增执行规则'}</Button>
      <Button variant="outline" onClick={() => { setText('');setOpen('import'); }}>批量导入</Button><Button variant="outline" onClick={exportData} disabled={!catalog}>导出 JSON</Button>
      <Button variant="outline" onClick={() => { setText(JSON.stringify({ ...D1_FIXTURES.observations[0],id:crypto.randomUUID(),testBatchId:'local_ui' },null,2));setOpen('observation'); }}>新增位置资料</Button>
    </div>
    {focus !== 'templates' && <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">规则/版本</th><th>目标与优先级</th><th>条件和依据</th><th>状态</th><th>维护</th></tr></thead>
      <tbody>{catalog?.rules.filter(visible).map((item) => <tr key={`${item.code}:${item.version}`} className="border-t border-line">
        <td className="p-2">{item.name}<br />{item.code} v{item.version}<br />{item.source}{item.testBatchId && ` · ${item.testBatchId}`}</td>
        <td>{item.kind === 'method' ? '工法':'支护'} {item.methodKey}<br />优先级 {item.priority}<br />{item.templateCode && `${item.templateCode} v${item.templateVersion}`}</td>
        <td className="max-w-md p-2">{item.conditions.all.map((condition,index) => <div key={index}>{FIELD_LABELS[condition.field]} {condition.op} {condition.op === 'eq' ? String(condition.value):condition.op === 'in' ? condition.values.join(' / '):`${condition.minInclusive ? '[':'('}${condition.min ?? '-∞'},${condition.max ?? '+∞'}${condition.maxInclusive ? ']':')'}`}</div>)}<p>{item.reason}</p></td>
        <td>{item.enabled ? '已启用':'已停用'}</td><td><div className="flex gap-1"><Button size="sm" variant="outline" disabled={busy} onClick={() => toggle('rule',item)}>{item.enabled ? '停用':'启用'}</Button><Button size="sm" variant="outline" onClick={() => newRule(item)}>新版本</Button></div></td>
      </tr>)}</tbody></table></div>}
    {focus === 'templates' && <div className="grid gap-3 md:grid-cols-2">{catalog?.templates.filter(visible).map((item) => <div key={`${item.code}:${item.version}`} className="rounded-lg border border-line p-3 text-xs">
      <b>{item.name} · {item.code} v{item.version}</b><p>{item.source} · {item.testBatchId ?? '非测试批次'} · {item.enabled ? '已启用':'已停用'}</p>
      {Object.entries(item.parameters).map(([group,parameters]) => <p key={group} className="mt-1">{groupLabels[group as keyof StructuredSupport]}：{Object.entries(parameters).map(([key,value]) => `${parameterLabels[key] ?? key} ${value}`).join('；')}</p>)}
      <div className="mt-2 flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => toggle('template',item)}>{item.enabled ? '停用':'启用'}</Button><Button size="sm" variant="outline" onClick={() => newTemplate(item)}>新版本</Button></div>
    </div>)}</div>}
    <details><summary className="cursor-pointer text-sm">位置采集记录（{catalog?.observations.length ?? 0}）</summary><div className="overflow-x-auto"><table className="mt-2 w-full text-xs"><thead><tr><th>工作面</th><th>里程</th><th>采集时间</th><th>来源</th><th>已提供字段</th></tr></thead><tbody>{catalog?.observations.map((item) => <tr key={item.id}><td>{item.workface}</td><td>{item.mileage}</td><td>{item.observedAt}</td><td>{item.source} · {item.testBatchId}</td><td>{Object.keys(item.params).length}/16</td></tr>)}</tbody></table></div></details>
    <Dialog open={open !== null} onOpenChange={(next) => { if (!next && !busy) setOpen(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{open === 'rule' ? '新增规则版本':open === 'template' ? '新增完整模板版本':open === 'observation' ? '录入位置采集资料':'批量导入决策资料'}</DialogTitle><DialogDescription>资料校验通过后整批保存；失败保留内容。合成测试内容请使用 simulation 来源和测试批次。</DialogDescription></DialogHeader>
      {error && <div role="alert" className="whitespace-pre-wrap text-sm text-destructive">{error}</div>}
      {(open === 'rule' || open === 'template') && <div className="flex flex-wrap gap-3"><label>资料来源<select aria-label="资料来源" value={open === 'rule' ? rule.source:template.source} className="ml-2 rounded border p-1" onChange={(event) => {
        const source=event.target.value as DecisionRule['source'];
        if (open === 'rule') setRule({ ...rule,source,testBatchId:source === 'simulation' ? rule.testBatchId || 'local_ui':null });
        else setTemplate({ ...template,source,testBatchId:source === 'simulation' ? template.testBatchId || 'local_ui':null });
      }}><option value="simulation">合成测试</option><option value="manual">人工录入</option><option value="import">资料导入</option></select></label>
        <span className="text-xs text-muted-foreground">示例初值来自合成资料；录入不等于工程验证。</span></div>}
      {open === 'rule' && <div className="space-y-3"><div className="grid grid-cols-2 gap-3">{(['code','name','version','priority','reason'] as const).map((key) => <label key={key} className="text-sm">{{ code:'编码',name:'名称',version:'版本',priority:'优先级',reason:'推荐依据' }[key]}<Input value={rule[key]} onChange={(event) => setRule({ ...rule,[key]:key === 'version' || key === 'priority' ? Number(event.target.value):event.target.value })} /></label>)}
        <label>规则类型<select aria-label="规则类型" value={rule.kind} onChange={(event) => setRule({ ...rule,kind:event.target.value as DecisionRule['kind'],templateCode:null,templateVersion:null })} className="block rounded border p-2"><option value="method">工法推荐</option><option value="support">支护映射</option></select></label>
        <label>工法<select aria-label="规则目标工法" value={rule.methodKey} onChange={(event) => setRule({ ...rule,methodKey:event.target.value as DecisionRule['methodKey'] })} className="block rounded border p-2"><option value="full">全断面</option><option value="bench">台阶</option><option value="core">预留核心土</option></select></label>
        {rule.kind === 'support' && <label>引用模板<select aria-label="规则引用模板" value={`${rule.templateCode}:${rule.templateVersion}`} onChange={(event) => { const [code,version]=event.target.value.split(':');setRule({ ...rule,templateCode:code,templateVersion:Number(version) }); }} className="block rounded border p-2"><option value="null:null">请选择</option>{catalog?.templates.map((item) => <option key={`${item.code}:${item.version}`} value={`${item.code}:${item.version}`}>{item.name} v{item.version}</option>)}</select></label>}
      </div><label className="flex gap-2"><input type="checkbox" checked={rule.enabled} onChange={(event) => setRule({ ...rule,enabled:event.target.checked })} />保存后启用</label>
      <label className="block text-sm">条件（all 为同时满足；excludeAny 为排除条件；数值区间需明确端点）<Textarea aria-label="规则条件 JSON" value={conditions} onChange={(event) => setConditions(event.target.value)} rows={9} className="mt-1 font-mono text-xs" /></label>
      <details><summary>保存前预览规则</summary><Textarea aria-label="规则预览参数" value={previewParams} onChange={(event) => setPreviewParams(event.target.value)} rows={7} className="mt-2 font-mono text-xs" /><Button type="button" variant="outline" disabled={busy} onClick={() => void execute(async () => {
        const candidate=ruleSchema.parse({ ...rule,conditions:JSON.parse(conditions) });
        const result=z.object({ status:z.enum(['matched','excluded','unmatched','insufficient']) }).parse(await request('/api/decision/preview-rule',{ method:'POST',body:JSON.stringify({ rule:candidate,params:JSON.parse(previewParams) }) }));
        setNotice(`规则预览：${{ matched:'命中',excluded:'排除',unmatched:'未命中',insufficient:'条件不足' }[result.status]}；未写入数据库。`);
      })}>执行预览</Button></details>{notice && <p role="status" className="text-sm">{notice}</p>}</div>}
      {open === 'template' && <div className="space-y-3"><div className="grid grid-cols-2 gap-3">{(['code','name','version'] as const).map((key) => <label key={key}>{{ code:'编码',name:'名称',version:'版本' }[key]}<Input value={template[key]} onChange={(event) => setTemplate({ ...template,[key]:key === 'version' ? Number(event.target.value):event.target.value })} /></label>)}</div>
        <label className="flex gap-2"><input type="checkbox" checked={template.enabled} onChange={(event) => setTemplate({ ...template,enabled:event.target.checked })} />保存后启用</label>
        {(Object.keys(template.parameters) as (keyof StructuredSupport)[]).map((group) => <fieldset key={group} className="rounded border p-3"><legend>{groupLabels[group]}</legend><div className="grid grid-cols-2 gap-3">{Object.entries(template.parameters[group]).map(([key,value]) => <label key={key} className="text-sm">{parameterLabels[key] ?? key}<Input value={value} type={typeof value === 'number' ? 'number':'text'} step="any" onChange={(event) => setTemplate((prev) => ({ ...prev,parameters:{ ...prev.parameters,[group]:{ ...prev.parameters[group],[key]:typeof value === 'number' ? Number(event.target.value):event.target.value } } }))} /></label>)}</div></fieldset>)}
      </div>}
      {(open === 'import' || open === 'observation') && <Textarea aria-label="导入资料 JSON" value={text} onChange={(event) => setText(event.target.value)} rows={17} className="font-mono text-xs" placeholder='{"formatVersion":1,"rules":[],"templates":[],"observations":[]}' />}
      <div className="flex justify-end gap-2">{open === 'import' && <Button variant="outline" disabled={busy} onClick={() => void execute(async () => {
        const input=catalogImportSchema.parse(JSON.parse(text));await request('/api/knowledge/decision-catalog?validate=true',{ method:'POST',body:JSON.stringify(input) });setNotice('整批结构校验通过，尚未保存；引用完整性在事务保存时验证。');
      })}>仅校验</Button>}<Button disabled={busy} onClick={() => { void save(); }}>{busy ? '处理中…':'校验并保存'}</Button></div>
      {notice && open !== 'rule' && <p role="status" className="text-sm">{notice}</p>}
    </DialogContent></Dialog>
  </section>;
}

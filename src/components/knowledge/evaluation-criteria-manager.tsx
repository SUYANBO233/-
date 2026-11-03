'use client';
import { useCallback,useEffect,useState } from 'react';
import { z } from 'zod';
import { criterionSchema,criterionCondition,type EvaluationCriterion } from '@/lib/response';
import { D2_CRITERIA } from '@/data/d2-fixtures';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card,CardHeader,CardTitle,CardContent } from '@/components/ui/card';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/components/ui/dialog';
async function api(method:'GET'|'POST'|'PATCH',body?:unknown):Promise<unknown> {
  const response=await fetch('/api/knowledge/evaluation-criteria',{ method,headers:{ 'Content-Type':'application/json' },body:body===undefined ? undefined:JSON.stringify(body),cache:'no-store' });
  const data:unknown=await response.json();
  if (!response.ok) throw new Error(data && typeof data==='object' && 'message' in data && typeof data.message==='string' ? data.message:'判据操作失败');
  return data;
}
export function EvaluationCriteriaManager() {
  const [criteria,setCriteria]=useState<EvaluationCriterion[]>([]);
  const [error,setError]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
  const [query,setQuery]=useState('');const [draft,setDraft]=useState<EvaluationCriterion | null>(null);const [text,setText]=useState('');
  const reload=useCallback(async () => { const data=z.object({ criteria:z.array(criterionSchema) }).parse(await api('GET'));setCriteria(data.criteria); },[]);
  useEffect(() => { void reload().catch((e:unknown) => setError(e instanceof Error ? e.message:'读取失败')); },[reload]);
  async function execute(work:() => Promise<void>) {
    setBusy(true);setError('');setNotice('');
    try { await work(); } catch(e:unknown) { setError(e instanceof Error ? e.message:'操作失败'); } finally { setBusy(false); }
  }
  function edit(item?:EvaluationCriterion) {
    const next=item ? { ...item,version:Math.max(...criteria.filter((c) => c.code===item.code).map((c) => c.version))+1,enabled:false }:{ ...D2_CRITERIA[0],code:'new_criterion',version:1,enabled:false };
    setDraft(next);setText(JSON.stringify(next,null,2));setError('');
  }
  return <Card className="border-line bg-panel text-ink" aria-label="变形评价判据维护"><CardHeader><CardTitle>变形评价判据</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
    <p className="text-xs text-ink-3">测试控制值不代表工程要求。相同编码只启用一个版本；多个适用编码冲突时不自动择优。版本变更后需重新匹配，旧报告保持原结果。</p>
    <div className="flex flex-wrap gap-2"><Input className="max-w-xs" aria-label="查询判据" placeholder="编码或名称" value={query} onChange={(e) => setQuery(e.target.value)} /><Button variant="outline" disabled={busy} onClick={() => void execute(reload)}>刷新判据</Button><Button variant="outline" onClick={() => setQuery('')}>重置查询</Button><Button onClick={() => edit()}>新增判据</Button></div>
    {!draft && error && <p role="alert" className="text-destructive">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead><tr>{['编码/版本','指标','控制条件','口径','来源','状态','操作'].map((label) => <th className="border-b border-line p-2" key={label}>{label}</th>)}</tr></thead><tbody>
      {criteria.filter((c) => `${c.code} ${c.name}`.includes(query)).map((c) => <tr key={`${c.code}:${c.version}`}><td className="p-2">{c.code} v{c.version}</td><td className="p-2">{c.name}</td><td className="p-2">{criterionCondition(c)}</td><td className="p-2">{c.sectionTypes.join('、')} / {c.stage} / {c.displacementReference}</td><td className="p-2">{c.source} · {c.testBatchId ?? '无批次'}</td><td className="p-2">{c.enabled ? '启用':'停用'}</td><td className="space-x-2 p-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => void execute(async () => { await api('PATCH',{ code:c.code,version:c.version,enabled:!c.enabled });await reload();setNotice('判据状态已保存，新决策使用新版本'); })}>{c.enabled ? '停用':'启用'}</Button><Button size="sm" variant="outline" onClick={() => edit(c)}>新版本</Button></td></tr>)}
      {!criteria.length && <tr><td colSpan={7} className="p-4">暂无判据，无法据此评价通过。D2 测试启动会初始化合成判据。</td></tr>}
    </tbody></table></div>
    <Dialog open={draft!==null} onOpenChange={(open) => { if (!open && !busy) setDraft(null); }}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>发布判据版本</DialogTitle><DialogDescription>编码和版本内容不可覆盖。以下完整 JSON 可编辑单位、口径、运算符、必需性与依据；保存失败保留填写内容。</DialogDescription></DialogHeader>
      <Textarea aria-label="判据完整定义" className="min-h-80 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} />
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setDraft(null)}>取消</Button><Button disabled={busy} onClick={() => void execute(async () => { const value=criterionSchema.parse(JSON.parse(text));await api('POST',value);await reload();setDraft(null);setNotice('判据新版本已保存；启用后影响新一轮评价'); })}>保存判据版本</Button></div>
    </DialogContent></Dialog>
  </CardContent></Card>;
}

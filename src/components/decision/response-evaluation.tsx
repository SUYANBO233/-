'use client';
import { Bar,BarChart,CartesianGrid,Legend,ResponsiveContainer,Tooltip,XAxis,YAxis } from 'recharts';
import { Card,CardContent,CardHeader,CardTitle } from '@/components/ui/card';
import type { SafetyAssessment } from '@/lib/types';
import { criterionCondition } from '@/lib/response';

const labels={ satisfied:'满足',unsatisfied:'不满足',unavailable:'无法评价' };
export function ResponseEvaluation({ safety,baseline,checking=false }:{ safety:SafetyAssessment | null;baseline?:SafetyAssessment | null;checking?:boolean }) {
  const response=safety?.response;
  const data=(safety?.items ?? []).filter((item) => item.unit==='mm').map((item) => ({
    name:item.name,initial:baseline?.items?.find((old) => old.key===item.key && old.unit===item.unit)?.value ?? null,
    current:item.value,upper:item.criterion?.upper ?? null,lower:item.criterion?.lower ?? null,
  }));
  return <Card className="border-line bg-panel text-ink" aria-label="变形控制评价">
    <CardHeader><CardTitle className="text-base">变形控制评价</CardTitle></CardHeader>
    <CardContent className="space-y-4 text-sm">
      <div role="status"><b className={safety?.status==='unsatisfied' ? 'text-red-400':safety?.status==='satisfied' ? 'text-brand':'text-warn'}>{checking ? '正在计算当前配置…':safety?.tag ?? '配置已变化，待重新检查'}</b><p>{safety?.reason ?? '旧响应与评价已失效，请点击重新检查。'}</p></div>
      {response && <div className="space-y-1 rounded border border-line p-3 text-xs">
        <p>{safety?.isTest ? '临时测试结果 · 不作为工程结论':'响应来源'}：{response.provider.description}</p>
        <p>提供器：{response.provider.id} · {response.provider.version}；批次：{response.provider.testBatchId ?? '无'}</p>
        <p>断面：{response.context?.sectionId ?? '未提供'}；阶段：{response.context?.stage==='initial-support' ? '初支完成后':response.context?.stage==='after-excavation' ? '开挖后':'未提供'}；位移基准：{response.context?.displacementReference==='since-excavation' ? '自开挖起增量':response.context?.displacementReference==='total' ? '总位移':'未提供'}</p>
        <p className="break-all text-ink-3">当前完整输入摘要：{response.inputDigest}</p>
        <p>{response.reason}</p>
      </div>}
      {!!safety?.items?.length && <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs" aria-label="变形指标明细"><thead><tr>{['指标','初始响应','当前响应','单位','控制条件','状态','依据与原因'].map((label) => <th key={label} className="border-b border-line p-2">{label}</th>)}</tr></thead>
        <tbody>{safety.items.map((item) => <tr key={item.key}><td className="p-2">{item.name}{item.required ? '（必需）':'（可选）'}</td><td className="p-2">{baseline?.items?.find((old) => old.key===item.key)?.value ?? '—'}</td><td className="p-2">{item.value ?? '—'}</td><td className="p-2">{item.unit}</td><td className="p-2">{item.criterion ? criterionCondition(item.criterion):'未配置'}</td><td className="p-2">{labels[item.status]}</td><td className="max-w-sm p-2">{item.criterion && <div>{item.criterion.code} v{item.criterion.version} · {item.criterion.basis}</div>}{item.reason}</td></tr>)}</tbody>
      </table></div>}
      {data.some((item) => item.current!==null || item.initial!==null || item.upper!==null || item.lower!==null) && <div role="img" aria-label="变形响应与控制值对比图，单位毫米；具体数值见变形指标明细" className="h-72 min-w-0">
        <ResponsiveContainer width="100%" height="100%"><BarChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="#334155" /><XAxis dataKey="name" stroke="#94a3b8" /><YAxis unit=" mm" stroke="#94a3b8" /><Tooltip contentStyle={{ background:'#132035',border:'1px solid #334155' }} /><Legend />
          {baseline && <Bar isAnimationActive={false} dataKey="initial" name="初始响应 mm" fill="#64748b" />}
          <Bar isAnimationActive={false} dataKey="current" name="当前响应 mm" fill="#2dd4bf" />{data.some((item) => item.upper!==null) && <Bar isAnimationActive={false} dataKey="upper" name="控制上限 mm" fill="#f59e0b" />}{data.some((item) => item.lower!==null) && <Bar isAnimationActive={false} dataKey="lower" name="控制下限 mm" fill="#a78bfa" />}
        </BarChart></ResponsiveContainer>
      </div>}
      <p className="text-xs text-ink-3">缺失值显示“—”，不画成零。评价范围仅包含变形控制；支护承载、成拱参数和置信度未接入。</p>
      {safety?.score!==null && safety?.score!==undefined && <p>旧版参考评分：{safety.score}（不是工程安全结论）</p>}
    </CardContent>
  </Card>;
}

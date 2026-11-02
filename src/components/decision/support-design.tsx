'use client';

import type { ArchMechanism, SafetyAssessment, SupportComponent } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  checking?:boolean;reporting?:boolean;reference?:boolean;mechanism:ArchMechanism | null;
  support:SupportComponent[];safety:SafetyAssessment | null;adjusted:Set<SupportComponent['key']>;
  onAdjust:(key:SupportComponent['key'],value:number) => void;onRecheck:() => void;onBack:() => void;onGenerate:() => void;
}
const editable={ steel:'钢架间距',shot:'喷射混凝土厚度',anchor:'锚杆长度',advance:'超前支护环距' };
const parameterLabels:Record<string,string>={ model:'型号',spacingCm:'间距 cm',strength:'强度等级',thicknessCm:'厚度 cm',type:'类型',diameterMm:'直径 mm',lengthM:'长度 m',
  longitudinalSpacingCm:'纵向间距 cm',circumferentialSpacingCm:'环向间距 cm',ringSpacingCm:'环向间距 cm',scope:'布置范围' };
export function SupportDesign({ checking=false,reporting=false,mechanism,support,safety,adjusted,onAdjust,onRecheck,onBack,onGenerate }:Props) {
  return <section className="mb-5 space-y-4" aria-label="完整支护配置">
    <h2 className="text-lg font-semibold">Step 3 · 完整支护配置与人工调整</h2>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{support.map((item) => <Card key={item.key} className="border-line bg-panel text-ink">
      <CardHeader><CardTitle className="text-base">{item.label}{adjusted.has(item.key) && <span className="ml-2 text-xs text-warn">已调整</span>}</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-xs"><p>{item.spec}</p><p className="text-brand">{item.layout}</p>
        {item.parameters && <dl className="space-y-1">{Object.entries(item.parameters).map(([key,value]) => <div key={key} className="flex justify-between gap-2"><dt className="text-ink-3">{parameterLabels[key] ?? key}</dt><dd>{value}</dd></div>)}</dl>}
        <label className="block">{editable[item.key]}（{item.unit}）
          <Input type="number" aria-label={editable[item.key]} value={item.valNum} min={0.1} step={item.key === 'anchor' ? 0.1:1}
            onChange={(event) => onAdjust(item.key,Number(event.target.value))} className="mt-1" /></label>
        <p className="break-words text-ink-3">来源：{item.basis}</p>
      </CardContent>
    </Card>)}</div>
    <Card className="border-line bg-panel text-ink"><CardHeader><CardTitle className="text-base">评价状态</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm" role="status"><b className="text-warn">{checking ? '正在检查当前配置…':safety?.tag ?? '配置已变化，待重新检查'}</b>
        <p>{safety?.reason ?? '参数修改后旧结果已失效，请点击重新检查。'}</p>
        {safety?.score !== undefined && safety.score !== null && <p>旧版参考评分：{safety.score}（不是工程安全结论）</p>}
        {!mechanism && <p className="text-xs text-ink-3">响应预测、承载评价、成拱参数及置信度尚未接入；当前不显示固定评分或雷达图。</p>}
        {mechanism && <p className="text-xs text-ink-3">旧版演示成拱参数：{mechanism.height} / {mechanism.release} / {mechanism.closeTime}</p>}
      </CardContent>
    </Card>
    <div className="flex flex-wrap justify-between gap-3"><Button variant="outline" disabled={checking || reporting} onClick={onRecheck}>重新检查当前配置</Button>
      <div className="flex gap-2"><Button variant="outline" onClick={onBack}>返回修改工法</Button><Button disabled={checking || reporting || !safety} onClick={onGenerate}>{reporting ? '正在生成报告…':'生成待复核配置报告'}</Button></div>
    </div>
  </section>;
}

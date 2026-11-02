'use client';

import type { MethodMatch, TemplateReference } from '@/lib/types';
import type { SupportTemplate } from '@/lib/decision-catalog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface Props {
  methods:MethodMatch[];selectedKey:string | null;onSelect:(key:string) => void;onConfirm:() => void;onReset:() => void;
  manualReason:string;onManualReason:(value:string) => void;templateOptions:SupportTemplate[];template:TemplateReference | null;onTemplate:(value:TemplateReference) => void;
}
const labels={ recommended:'推荐',candidate:'可选',inapplicable:'不适用',insufficient:'条件不足',uncovered:'规则未覆盖' };
export function MethodSelect({ methods,selectedKey,onSelect,onConfirm,onReset,manualReason,onManualReason,templateOptions,template,onTemplate }:Props) {
  const selected=methods.find((item) => item.key === selectedKey);
  const needsReason=selected?.status === 'uncovered' || selected?.status === 'insufficient';
  const recommendations=methods.filter((item) => item.matched).length;
  return <section className="mb-5 space-y-3" aria-label="工法匹配结果">
    <h2 className="text-lg font-semibold">Step 2 · 工法条件匹配与人工确认</h2>
    <p className="text-xs text-ink-3">{recommendations > 1 ? '存在同优先级推荐，请人工确认。' : recommendations === 0 ? '没有唯一推荐，请查看原因后选择。' : '请核对命中依据后确认。'}资料更新后点击重新匹配。</p>
    <div className="grid gap-3 md:grid-cols-3">{methods.map((item) => <button key={item.key} type="button"
      aria-label={`选择${item.name}`} aria-pressed={selectedKey === item.key} disabled={item.status === 'inapplicable'} onClick={() => onSelect(item.key)}
      className={cn('rounded-xl border border-line bg-panel p-4 text-left disabled:cursor-not-allowed disabled:opacity-50',selectedKey === item.key && 'border-brand ring-1 ring-brand')}>
      <div className="flex flex-wrap justify-between gap-2"><b>{item.name}</b><span className={item.matched ? 'text-brand':'text-ink-3'}>{item.status ? labels[item.status] : item.matched ? '参考推荐':'参考候选'}</span></div>
      <p className="mt-2 text-xs text-ink-2">{item.desc}</p>
      <ul className="mt-3 space-y-1 text-xs text-ink-2">{item.reasons?.map((reason,index) => <li key={index}>{reason}</li>)}</ul>
      <p className="mt-3 text-xs text-ink-3">工法库参考：循环 {item.cycle} · 进尺 {item.adv}；并非本轮施工指令。</p>
      <p className="mt-2 text-xs text-ink-3">装备参考：{item.equip}</p>
    </button>)}</div>
    {needsReason && <label className="block text-sm text-warn">人工选择理由（规则未覆盖时必填）
      <Input aria-label="人工选择理由" value={manualReason} maxLength={500} onChange={(event) => onManualReason(event.target.value)} className="mt-2" />
    </label>}
    {templateOptions.length > 0 && <div className="rounded-lg border border-line p-3">
      <p className="mb-2 text-sm">适用完整支护模板{templateOptions.length > 1 && '（并列，需人工选择）'}</p>
      <div className="flex flex-wrap gap-2">{templateOptions.map((item) => <Button key={`${item.code}:${item.version}`} type="button"
        variant={template?.code === item.code && template.version === item.version ? 'default':'outline'} onClick={() => onTemplate({ code:item.code,version:item.version })}>
        {item.name} · v{item.version}{item.testBatchId && ' · 临时测试'}
      </Button>)}</div>
    </div>}
    <div className="flex justify-end gap-3"><Button variant="outline" onClick={onReset}>重新匹配</Button>
      <Button onClick={onConfirm} disabled={!selectedKey || (needsReason && !manualReason.trim())}>确认工法，读取支护模板</Button></div>
  </section>;
}

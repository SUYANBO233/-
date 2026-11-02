'use client';

import { Fragment, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { HistoryRecord, SchemeReport } from '@/lib/types';
import { Field, Modal, Toast, useBriefToast } from '@/components/knowledge/modal';
import { createSchemeHistory, fetchSchemeHistory, fetchSchemeReport, importSchemeHistory } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SchemeReportView } from '@/components/decision/scheme-report';

interface HistoryLedgerProps {
  title: string;
  subtitle: string;
  faces: string[];
  records: HistoryRecord[];
}

/** 取日期部分（YYYY-MM-DD）用于范围比较 */
function datePart(time: string): string {
  return time.slice(0, 10);
}

function RockTag({ rock }: { rock: string }) {
  const isFour = rock.includes('Ⅳ') || rock.startsWith('IV');
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[11px]',
        isFour ? 'bg-brand/15 text-brand' : 'bg-warn/15 text-warn',
      )}
    >
      {rock}
    </span>
  );
}

const ROCK_OPTS = ['Ⅳ级', 'Ⅳ级(加强)', 'Ⅴ级', 'Ⅴ级(深埋)'];
const METHOD_OPTS = ['台阶法', '预留核心土法', '全断面法', '双侧壁导坑法'];

/**
 * 历史决策台账：起止日期 + 工作面筛选，决策记录表，点击 [+] 展开循环进尺与总时长明细；
 * 支持新增记录与 JSON 批量导入（数据落 Supabase）。
 */
export function HistoryLedger({ faces, records: seed }: HistoryLedgerProps) {
  const { msg, show } = useBriefToast();
  const [rows, setRows] = useState<HistoryRecord[]>(seed);
  const [report, setReport] = useState<SchemeReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  async function openReport(id: string) {
    setReportLoading(true);
    try { setReport(await fetchSchemeReport(id)); }
    catch (error: unknown) { show(error instanceof Error ? error.message : '报告读取失败'); }
    finally { setReportLoading(false); }
  }
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const faceOptions = ['全部工作面', ...faces.filter((f) => f && f !== '全部工作面')];
  const [face, setFace] = useState(faceOptions[0]);
  // 已应用的筛选条件（点击「查询」后才生效）
  const [applied, setApplied] = useState({ start, end, face });
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const [openAdd, setOpenAdd] = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [form, setForm] = useState({
    time: '2026-07-08',
    face: faceOptions[1] ?? '沙益1号隧道主洞掌子面',
    startMile: '',
    endMile: '',
    advance: '',
    rock: 'Ⅳ级',
    method: METHOD_OPTS[0],
    type: '',
    score: 90,
    detail: '',
  });

  const list = useMemo(() => {
    return rows.filter((r) => {
      const d = datePart(r.time);
      if (applied.start && d < applied.start) return false;
      if (applied.end && d > applied.end) return false;
      if (applied.face && applied.face !== '全部工作面' && r.face !== applied.face) {
        return false;
      }
      return true;
    });
  }, [rows, applied]);

  function applyFilter() {
    setApplied({ start, end, face });
    setExpanded(new Set());
  }

  function resetFilter() {
    const s = '';
    const e = '';
    const f = faceOptions[0];
    setStart(s);
    setEnd(e);
    setFace(f);
    setApplied({ start: s, end: e, face: f });
    setExpanded(new Set());
  }

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveNew() {
    if (!form.startMile.trim() || !form.endMile.trim() || !form.type.trim()) {
      show('起止桩号与衬砌类型不能为空');
      return;
    }
    try {
      const item = await createSchemeHistory({
        time: form.time,
        face: form.face || faceOptions[1] || '',
        startMile: form.startMile.trim(),
        endMile: form.endMile.trim(),
        advance: form.advance.trim() || '—',
        rock: form.rock,
        method: form.method,
        type: form.type.trim(),
        score: Math.max(0, Math.min(100, Number(form.score) || 0)),
        detail: form.detail.trim() || '人工录入（循环总时长明细）',
      });
      setRows((prev) => [...prev, { ...item, custom: true }]);
      setOpenAdd(false);
      setForm((f) => ({ ...f, startMile: '', endMile: '', advance: '', type: '', detail: '' }));
      show('已新增决策记录');
    } catch (e) {
      show((e as Error).message || '新增失败');
    }
  }

  async function applyImport() {
    try {
      const arr = JSON.parse(importText);
      if (!Array.isArray(arr) || arr.length === 0) {
        show('请粘贴 JSON 数组');
        return;
      }
      const count = await importSchemeHistory(arr);
      const fresh = await fetchSchemeHistory();
      setRows(fresh.records);
      setOpenImport(false);
      setImportText('');
      show(`已导入 ${count} 条决策记录`);
    } catch (e) {
      show((e as Error).message || '导入失败，请检查 JSON 格式');
    }
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <button className="btn btn-sm btn-ghost" onClick={() => setOpenImport(true)}>
          导入
        </button>
        <button className="btn btn-sm btn-primary" onClick={() => setOpenAdd(true)}>
          + 新增记录
        </button>
      </div>

      <div className="card overflow-hidden p-0">
        {/* 筛选栏 */}
        <div
          className="flex flex-wrap items-center gap-3 px-4 py-3"
          style={{ borderBottom: '1px solid var(--line)', background: 'rgba(255,255,255,.02)' }}
        >
          <label className="flex items-center gap-2 text-[12px] text-ink-2">
            <span>决策时间:</span>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="rounded border border-line bg-panel px-2 py-1 text-[12px] text-ink outline-none focus:border-brand"
            />
            <span>至</span>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="rounded border border-line bg-panel px-2 py-1 text-[12px] text-ink outline-none focus:border-brand"
            />
          </label>
          <label className="flex items-center gap-2 text-[12px] text-ink-2">
            <span>隧道工作面:</span>
            <select
              value={face}
              onChange={(e) => setFace(e.target.value)}
              className="rounded border border-line bg-panel px-2 py-1 text-[12px] text-ink outline-none focus:border-brand"
            >
              {faceOptions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={applyFilter}
            className="rounded-md bg-brand px-3 py-1 text-[12px] font-medium text-[#06281f] transition-colors hover:brightness-110"
          >
            查询
          </button>
          <button
            type="button"
            onClick={resetFilter}
            className="rounded-md border border-line bg-transparent px-3 py-1 text-[12px] text-ink-2 transition-colors hover:border-brand/40 hover:text-ink"
          >
            重置
          </button>
          <span className="ml-auto hidden text-[11.5px] text-ink-3 md:inline">
            点击序号左侧 [+] 展开查看该循环进尺与循环总时长明细
          </span>
        </div>

        {/* 记录表 */}
        <div className="tbl-wrap overflow-x-auto rounded-md">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="bg-[rgba(10,19,34,0.6)]">
                <th className="w-[52px] whitespace-nowrap border-b border-line px-3 py-2.5 text-center font-semibold text-ink-2">
                  展开
                </th>
                <th className="whitespace-nowrap border-b border-line px-3 py-2.5 text-center font-semibold text-ink-2">
                  序号
                </th>
                <th className="whitespace-nowrap border-b border-line px-3 py-2.5 text-left font-semibold text-ink-2">
                  决策时间
                </th>
                <th className="whitespace-nowrap border-b border-line px-3 py-2.5 text-left font-semibold text-ink-2">
                  隧道工作面
                </th>
                <th className="whitespace-nowrap border-b border-line px-3 py-2.5 text-left font-semibold text-ink-2">
                  里程桩号（起始 / 终止）
                </th>
                <th className="whitespace-nowrap border-b border-line px-3 py-2.5 text-center font-semibold text-ink-2">
                  循环进尺
                </th>
                <th className="whitespace-nowrap border-b border-line px-3 py-2.5 text-center font-semibold text-ink-2">
                  围岩
                </th>
                <th className="whitespace-nowrap border-b border-line px-3 py-2.5 text-left font-semibold text-ink-2">
                  开挖工法
                </th>
                <th className="whitespace-nowrap border-b border-line px-3 py-2.5 text-center font-semibold text-ink-2">
                  衬砌类型
                </th>
                <th className="whitespace-nowrap border-b border-line px-3 py-2.5 text-center font-semibold text-ink-2">
                  安全度
                </th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-ink-3">
                    当前筛选条件下暂无决策记录
                  </td>
                </tr>
              ) : (
                list.map((h) => {
                  const open = expanded.has(h.id);
                  return (
                    <Fragment key={h.id}>
                      <tr className="border-b border-line/60 transition-colors last:border-0 hover:bg-white/[0.03]">
                        <td className="px-3 py-2.5 text-center align-middle">
                          <button
                            type="button"
                            onClick={() => toggle(h.id)}
                            className="rounded border border-line bg-transparent px-1.5 py-0.5 text-[11px] text-ink-2 transition-colors hover:border-brand/40 hover:text-brand"
                            aria-label={open ? '收起明细' : '展开明细'}
                          >
                            {open ? '[-]' : '[+]'}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-center align-middle text-ink-2 tabular-nums">
                          {h.id}
                        </td>
                        <td className="px-3 py-2.5 align-middle text-[12px] text-ink tabular-nums">
                          {h.time}
                        </td>
                        <td className="px-3 py-2.5 text-left align-middle">
                          <b className="font-medium text-ink">{h.face}</b>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-left align-middle leading-[1.8]">
                          <div className="text-ink">
                            <span className="mr-1.5 text-[10px] text-ink-3">起始</span>
                            <span className="font-semibold text-brand tabular-nums">{h.startMile}</span>
                          </div>
                          <div className="text-ink">
                            <span className="mr-1.5 text-[10px] text-ink-3">终止</span>
                            <span className="font-semibold text-brand tabular-nums">{h.endMile}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center align-middle">
                          <span className="font-medium text-ink tabular-nums">{h.advance ?? "-"}</span>
                        </td>
                        <td className="px-3 py-2.5 text-center align-middle">
                          <RockTag rock={h.rock} />
                        </td>
                        <td className="px-3 py-2.5 align-middle text-ink-2">{h.method}</td>
                        <td className="px-3 py-2.5 text-center align-middle">
                          <b className="font-semibold text-ink">
                            {h.type}
                            {h.source === 'simulation' && <span className="ml-1 text-[10px] text-warn">模拟方案</span>}
                            {h.source === 'seed' && <span className="ml-1 text-[10px] text-ink-3">演示</span>}
                            {h.custom && (
                              <span className="tag tag-teal" style={{ marginLeft: 4 }}>
                                新增
                              </span>
                            )}
                          </b>
                        </td>
                        <td className="px-3 py-2.5 text-center align-middle">
                          <b className="font-semibold text-ok tabular-nums">{h.score}</b>
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-line/40 bg-[rgba(45,212,191,0.04)]">
                          <td colSpan={10} className="px-3 py-3 text-left align-top text-[12px] leading-[1.7] text-ink-2">
                            <b className="text-brand">【单次决策循环明细】</b> {h.detail}
                            {h.schemeReportId && (
                              <Button variant="outline" size="sm" className="ml-3" disabled={reportLoading} onClick={() => openReport(h.schemeReportId!)}>
                                {reportLoading ? '正在读取…' : '查看保存的方案报告'}
                              </Button>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={report !== null} onOpenChange={(open) => { if (!open) setReport(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>已保存的方案报告</DialogTitle>
            <DialogDescription>显示保存时的配置快照。</DialogDescription>
          </DialogHeader>
          {report && <SchemeReportView scheme={report} />}
        </DialogContent>
      </Dialog>

      {/* 新增决策记录 */}
      <Modal
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        title="新增历史决策记录"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setOpenAdd(false)}>
              取消
            </button>
            <button className="btn btn-primary" onClick={saveNew}>
              确认新增
            </button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="决策时间（日期）">
            <input type="date" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
          </Field>
          <Field label="隧道工作面">
            <select value={form.face} onChange={(e) => setForm({ ...form, face: e.target.value })}>
              {faceOptions.filter((f) => f !== '全部工作面').map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>
          <Field label="起始里程桩号">
            <input type="text" value={form.startMile} placeholder="如 K3600+717.80" onChange={(e) => setForm({ ...form, startMile: e.target.value })} />
          </Field>
          <Field label="终止里程桩号">
            <input type="text" value={form.endMile} placeholder="如 K3600+720.80" onChange={(e) => setForm({ ...form, endMile: e.target.value })} />
          </Field>
          <Field label="围岩级别">
            <select value={form.rock} onChange={(e) => setForm({ ...form, rock: e.target.value })}>
              {ROCK_OPTS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="开挖工法">
            <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              {METHOD_OPTS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field label="衬砌类型">
            <input type="text" value={form.type} placeholder="如 S4a" onChange={(e) => setForm({ ...form, type: e.target.value })} />
          </Field>
          <Field label="安全度评分(0~100)">
            <input type="number" min={0} max={100} value={form.score} onChange={(e) => setForm({ ...form, score: Number(e.target.value) })} />
          </Field>
          <Field label="循环进尺">
            <input type="text" value={form.advance} placeholder="如 3.0m" onChange={(e) => setForm({ ...form, advance: e.target.value })} />
          </Field>
          <Field label="循环总时长明细">
            <input type="text" value={form.detail} placeholder="如 循环总时长 24小时" onChange={(e) => setForm({ ...form, detail: e.target.value })} />
          </Field>
        </div>
      </Modal>

      {/* 批量导入 JSON */}
      <Modal
        open={openImport}
        onClose={() => setOpenImport(false)}
        title="批量导入决策记录（JSON 数组）"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setOpenImport(false)}>
              取消
            </button>
            <button className="btn btn-primary" onClick={applyImport}>
              确认导入
            </button>
          </>
        }
      >
        <textarea
          style={{ width: '100%', minHeight: 220, fontFamily: 'monospace', fontSize: 11.5 }}
          placeholder='[{"time":"2026-07-08","face":"沙益1号隧道主洞掌子面","startMile":"K3600+717.80","endMile":"K3600+720.80","rock":"Ⅳ级","method":"台阶法","type":"S4a","score":90.5,"detail":"循环进尺 3.0m | 循环总时长 24小时"}]'
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
        />
        <div style={{ marginTop: 8, fontSize: 11, color: '#7189a8' }}>
          支持字段：time / face / startMile / endMile / rock / method / type / score / detail
        </div>
      </Modal>

      <Toast msg={msg} />
    </section>
  );
}

'use client';

import { useMemo, useState } from 'react';
import type { KnowledgeMapping } from '@/lib/types';
import { createMapping, deleteMapping } from '@/lib/api';
import { DataTable, type DataColumn } from './data-table';
import { Field, Modal, Toast, useBriefToast } from './modal';

type Tone = 'red' | 'amber' | 'teal' | 'gray';

const TONE_CLASS: Record<Tone, string> = {
  red: 'tag tag-red',
  amber: 'tag tag-amber',
  teal: 'tag tag-teal',
  gray: 'tag tag-gray',
};

function MappingTag({
  tone,
  children,
}: {
  tone: Tone;
  children: React.ReactNode;
}) {
  return <span className={TONE_CLASS[tone]}>{children}</span>;
}

const ROCK_OPTS = ['Ⅰ级', 'Ⅱ级', 'Ⅲ级', 'Ⅳ级', 'Ⅳ级(加强)', 'Ⅴ级', 'Ⅴ级(深埋)'];

interface MappingTableProps {
  title: string;
  data: KnowledgeMapping[];
}

export function MappingTable({ title, data }: MappingTableProps) {
  const { msg, show } = useBriefToast();
  const [list, setList] = useState<KnowledgeMapping[]>(data);
  const [kw, setKw] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: '',
    hard: '硬 (变质灰岩)',
    intact: '较完整',
    water: '潮湿',
    depth: '400~600m',
    stress: '中等',
    rock: 'Ⅳ级',
    scheme: '',
  });

  const filtered = useMemo(() => {
    const q = kw.trim().toLowerCase();
    if (!q) return list;
    return list.filter((k) =>
      `${k.code} ${k.hard} ${k.rock} ${k.scheme}`.toLowerCase().includes(q),
    );
  }, [list, kw]);

  async function deleteItem(id: number | undefined) {
    if (id === undefined) return;
    try {
      await deleteMapping(id);
      setList((prev) => prev.filter((k) => k.id !== id));
      show('已删除知识规则');
    } catch {
      show('删除失败，请重试');
    }
  }

  async function save() {
    if (!form.code.trim() || !form.scheme.trim()) {
      show('方案编号与匹配工法衬砌不能为空');
      return;
    }
    try {
      const item = await createMapping({
        code: form.code.trim(),
        hard: form.hard,
        intact: form.intact,
        water: form.water,
        depth: form.depth,
        stress: form.stress,
        rock: form.rock,
        scheme: form.scheme.trim(),
      });
      setList((prev) => [...prev, { ...item, custom: true }]);
      setOpen(false);
      setForm((f) => ({ ...f, code: '', scheme: '' }));
      show('已添加知识规则');
    } catch {
      show('添加失败，请重试');
    }
  }

  const columns: DataColumn<KnowledgeMapping>[] = [
    {
      key: 'no',
      title: '序号',
      render: (row) => <span className="tabular-nums">{row.no}</span>,
    },
    {
      key: 'code',
      title: '方案编号',
      render: (row) =>
        row.custom ? (
          <span className="whitespace-nowrap">
            <b className="font-semibold">{row.code}</b>
            <span className="tag tag-teal" style={{ marginLeft: 4 }}>
              新增
            </span>
          </span>
        ) : (
          <b className="font-semibold">{row.code}</b>
        ),
      className: 'whitespace-nowrap',
    },
    { key: 'hard', title: '坚硬程度' },
    { key: 'intact', title: '完整程度' },
    { key: 'water', title: '地下水量' },
    { key: 'depth', title: '埋深水平', className: 'whitespace-nowrap' },
    {
      key: 'stress',
      title: '构造应力',
      render: (row) => (
        <MappingTag
          tone={
            row.stress.includes('严重')
              ? 'red'
              : row.stress.includes('中等') || row.stress.includes('较重')
                ? 'amber'
                : 'gray'
          }
        >
          {row.stress}
        </MappingTag>
      ),
    },
    {
      key: 'rock',
      title: '对应围岩',
      render: (row) => (
        <MappingTag tone={row.rock.includes('Ⅴ') ? 'amber' : 'teal'}>
          {row.rock}
        </MappingTag>
      ),
    },
    {
      key: 'scheme',
      title: '匹配优选工法与衬砌',
      render: (row) => <span>{row.scheme}</span>,
    },
    {
      key: 'ops',
      title: '操作',
      className: 'whitespace-nowrap',
      render: (row) =>
        row.custom ? (
          <button className="btn btn-sm btn-danger" disabled={row.id === undefined} onClick={() => deleteItem(row.id)}>
            删除
          </button>
        ) : (
          <span style={{ color: '#567092' }}>规则</span>
        ),
    },
  ];

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid rgba(56, 189, 248, 0.16)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            className="search-input"
            placeholder="搜索地质特征/工法..."
            value={kw}
            onChange={(e) => setKw(e.target.value)}
          />
          <button className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>
            + 新增知识规则
          </button>
        </div>
      </div>
      <DataTable<KnowledgeMapping>
        columns={columns}
        data={filtered}
        rowKey={(r) => r.id ?? r.code}
        emptyText="暂无知识规则"
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="新增地质知识映射规则"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>
              取消
            </button>
            <button className="btn btn-primary" onClick={save}>
              确认添加
            </button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="方案编号">
            <input
              type="text"
              value={form.code}
              placeholder="如 ZS-09"
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </Field>
          <Field label="对应围岩">
            <select
              value={form.rock}
              onChange={(e) => setForm({ ...form, rock: e.target.value })}
            >
              {ROCK_OPTS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="坚硬程度">
            <input
              type="text"
              value={form.hard}
              onChange={(e) => setForm({ ...form, hard: e.target.value })}
            />
          </Field>
          <Field label="完整程度">
            <input
              type="text"
              value={form.intact}
              onChange={(e) => setForm({ ...form, intact: e.target.value })}
            />
          </Field>
          <Field label="地下水量">
            <input
              type="text"
              value={form.water}
              onChange={(e) => setForm({ ...form, water: e.target.value })}
            />
          </Field>
          <Field label="埋深水平">
            <input
              type="text"
              value={form.depth}
              onChange={(e) => setForm({ ...form, depth: e.target.value })}
            />
          </Field>
          <Field label="构造应力">
            <select
              value={form.stress}
              onChange={(e) => setForm({ ...form, stress: e.target.value })}
            >
              {['轻微', '中等', '较重', '严重'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="匹配优选工法与衬砌" span>
            <input
              type="text"
              value={form.scheme}
              placeholder="如 台阶法 + S4a"
              onChange={(e) => setForm({ ...form, scheme: e.target.value })}
            />
          </Field>
        </div>
      </Modal>

      <Toast msg={msg} />
    </div>
  );
}

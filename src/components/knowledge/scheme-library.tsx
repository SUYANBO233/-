"use client";

import { useMemo, useState } from "react";
import type { SupportScheme } from "@/lib/types";
import {
  createSupportScheme,
  deleteSupportScheme,
  fetchKnowledge,
  importSupportSchemes,
} from "@/lib/api";
import { Field, Modal, Toast, useBriefToast, downloadJson } from "./modal";

type Filter = "all" | "IV" | "V" | "custom";

const ROCKS = ["Ⅳ级", "Ⅳ级(加强)", "Ⅴ级", "Ⅴ级(深埋)", "Ⅲ级", "Ⅵ级"];
const MODES = ["台阶法", "预留核心土法", "全断面法", "双侧壁导坑法"];

export function SchemeLibrary({ title, data }: { title: string; data: SupportScheme[] }) {
  const { msg, show } = useBriefToast();
  const [list, setList] = useState<SupportScheme[]>(data);
  const [filter, setFilter] = useState<Filter>("all");
  const [kw, setKw] = useState("");
  const [openAdd, setOpenAdd] = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [form, setForm] = useState({
    rock: "Ⅳ级",
    type: "",
    depth: "200~600",
    advType: "Φ42小导管注浆",
    advRing: "40cm",
    advLen: "4.5m",
    advScope: "拱部 120°",
    anchor: "120×80cm (Φ22, L=3.0m)",
    steel: "I18钢架 @80cm",
    shot: "C25, 24cm",
    conc: "C35",
    thick: "40cm",
    mode: "台阶法",
    advRate: "1.5m",
    benchLen: "3~5m",
  });

  const filtered = useMemo(() => {
    let arr = list;
    if (filter === "custom") arr = arr.filter((d) => d.custom);
    else if (filter === "IV") arr = arr.filter((d) => d.rock.includes("Ⅳ"));
    else if (filter === "V")
      arr = arr.filter((d) => d.rock.includes("Ⅴ") && !d.rock.includes("IV"));
    const q = kw.trim().toLowerCase();
    if (q)
      arr = arr.filter((d) =>
        `${d.type} ${d.rock} ${d.steel} ${d.mode} ${d.advType}`.toLowerCase().includes(q),
      );
    return arr;
  }, [list, filter, kw]);

  const countMap = useMemo(() => {
    return {
      all: list.length,
      IV: list.filter((d) => d.rock.includes("Ⅳ")).length,
      V: list.filter((d) => d.rock.includes("Ⅴ") && !d.rock.includes("IV")).length,
      custom: list.filter((d) => d.custom).length,
    };
  }, [list]);

  async function del(id: number | undefined) {
    if (id === undefined) return;
    try {
      await deleteSupportScheme(id);
      setList((prev) => prev.filter((s) => s.id !== id));
      show("已删除方案");
    } catch {
      show("删除失败，请重试");
    }
  }

  async function reset() {
    try {
      const fresh = await fetchKnowledge();
      setList(fresh.schemes);
      setFilter("all");
      show("已刷新方案列表");
    } catch {
      show("刷新失败，请重试");
    }
  }

  async function saveNew() {
    if (!form.type.trim()) {
      show("衬砌类型代号不能为空");
      return;
    }
    try {
      const item = await createSupportScheme({
        rock: form.rock,
        type: form.type.trim(),
        depth: form.depth,
        advType: form.advType,
        advRing: form.advRing,
        advLen: form.advLen,
        advScope: form.advScope,
        anchor: form.anchor,
        steel: form.steel,
        shot: form.shot,
        conc: form.conc,
        thick: form.thick,
        mode: form.mode,
        advRate: form.advRate,
        benchLen: form.benchLen,
      });
      setList((prev) => [...prev, { ...item, custom: true }]);
      setOpenAdd(false);
      show("方案已增添至数据库");
    } catch {
      show("添加失败，请重试");
    }
  }

  async function applyImport() {
    try {
      const arr = JSON.parse(importText);
      if (!Array.isArray(arr) || arr.length === 0) {
        show("请粘贴 JSON 数组");
        return;
      }
      const next = arr.map((r) => ({
        rock: String(r.rock ?? "Ⅳ级"),
        type: String(r.type ?? ""),
        depth: String(r.depth ?? ""),
        advType: String(r.advType ?? ""),
        advRing: String(r.advRing ?? ""),
        advLen: String(r.advLen ?? ""),
        advScope: String(r.advScope ?? ""),
        anchor: String(r.anchor ?? ""),
        steel: String(r.steel ?? ""),
        shot: String(r.shot ?? ""),
        conc: String(r.conc ?? ""),
        thick: String(r.thick ?? ""),
        mode: String(r.mode ?? ""),
        advRate: String(r.advRate ?? ""),
        benchLen: String(r.benchLen ?? ""),
      }));
      const count = await importSupportSchemes(next);
      const fresh = await fetchKnowledge();
      setList(fresh.schemes.map((d) => ({ ...d, custom: d.custom })));
      setOpenImport(false);
      setImportText("");
      setFilter("custom");
      show(`已导入 ${count} 条方案`);
    } catch {
      show("JSON 解析失败或导入出错，请检查格式");
    }
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="db-tab-bar" style={{ padding: "10px 14px 0" }}>
        <FilterBtn active={filter === "all"} onClick={() => setFilter("all")}>
          全部方案 ({countMap.all})
        </FilterBtn>
        <FilterBtn active={filter === "IV"} onClick={() => setFilter("IV")}>
          Ⅳ 级围岩方案 ({countMap.IV})
        </FilterBtn>
        <FilterBtn active={filter === "V"} onClick={() => setFilter("V")}>
          Ⅴ 级围岩方案 ({countMap.V})
        </FilterBtn>
        {countMap.custom > 0 && (
          <FilterBtn active={filter === "custom"} onClick={() => setFilter("custom")}>
            新增方案 ({countMap.custom})
          </FilterBtn>
        )}
      </div>
      <div
        style={{
          padding: "8px 14px 10px",
          borderBottom: "1px solid rgba(56, 189, 248, 0.16)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <input
            className="search-input"
            placeholder="搜索衬砌/钢架/工法..."
            value={kw}
            onChange={(e) => setKw(e.target.value)}
          />
          <button className="btn btn-sm btn-primary" onClick={() => setOpenAdd(true)}>
            + 新增支护方案
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setOpenImport(true)}>
            导入/管理
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => downloadJson("支护方案库.json", list)}>
            导出
          </button>
          <button className="btn btn-sm btn-ghost" onClick={reset}>
            重置
          </button>
        </div>
      </div>

      <div className="tbl-wrap">
        <table className="tbl" style={{ minWidth: 1180 }}>
          <thead>
            <tr>
              <th rowSpan={2}>方案编号</th>
              <th rowSpan={2}>围岩级别</th>
              <th rowSpan={2}>衬砌类型</th>
              <th rowSpan={2}>埋深范围(m)</th>
              <th colSpan={4}>超前支护</th>
              <th colSpan={3}>初期支护</th>
              <th colSpan={2}>二次衬砌</th>
              <th colSpan={3}>开挖工法</th>
              <th rowSpan={2}>操作</th>
            </tr>
            <tr>
              <th>类型规格</th><th>环向间距</th><th>单根长</th><th>适用范围</th>
              <th>系统锚杆(横×纵)</th><th>钢拱架型号/间距</th><th>喷射混凝土</th>
              <th>标号</th><th>厚度</th>
              <th>开挖模式</th><th>循环进尺</th><th>台阶长度</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={16} style={{ color: "#94a9c9" }}>
                  暂无方案
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.id ?? s.no}>
                  <td style={{ color: "#94a9c9" }} className="tabular-nums">
                    {s.no}
                  </td>
                  <td>
                    <span className={`tag ${s.rock.startsWith("Ⅴ") ? "tag-amber" : "tag-teal"}`}>
                      {s.rock}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    {s.type}
                    {s.custom && (
                      <span className="tag tag-blue" style={{ marginLeft: 4 }}>
                        新增
                      </span>
                    )}
                  </td>
                  <td className="tabular-nums">{s.depth}</td>
                  <td>{s.advType}</td><td>{s.advRing}</td><td>{s.advLen}</td><td>{s.advScope}</td>
                  <td>{s.anchor}</td><td>{s.steel}</td><td>{s.shot}</td>
                  <td>{s.conc}</td><td>{s.thick}</td>
                  <td>{s.mode}</td><td>{s.advRate}</td><td>{s.benchLen}</td>
                  <td>
                    {s.custom ? (
                      <button className="btn btn-sm btn-danger" disabled={s.id === undefined} onClick={() => del(s.id)}>
                        删除
                      </button>
                    ) : (
                      <span style={{ color: "#567092" }}>标准</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 新增支护方案 */}
      <Modal
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        title="新增支护优选方案"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setOpenAdd(false)}>
              取消
            </button>
            <button className="btn btn-primary" onClick={saveNew}>
              确认增添
            </button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="围岩级别">
            <select value={form.rock} onChange={(e) => setForm({ ...form, rock: e.target.value })}>
              {ROCKS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="衬砌类型代号">
            <input type="text" value={form.type} placeholder="如 S4d" onChange={(e) => setForm({ ...form, type: e.target.value })} />
          </Field>
          <Field label="埋深范围(m)">
            <input type="text" value={form.depth} onChange={(e) => setForm({ ...form, depth: e.target.value })} />
          </Field>
          <Field label="开挖模式">
            <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field label="超前支护类型">
            <input type="text" value={form.advType} onChange={(e) => setForm({ ...form, advType: e.target.value })} />
          </Field>
          <Field label="超前环向间距">
            <input type="text" value={form.advRing} onChange={(e) => setForm({ ...form, advRing: e.target.value })} />
          </Field>
          <Field label="超前单根长">
            <input type="text" value={form.advLen} onChange={(e) => setForm({ ...form, advLen: e.target.value })} />
          </Field>
          <Field label="适用范围">
            <input type="text" value={form.advScope} onChange={(e) => setForm({ ...form, advScope: e.target.value })} />
          </Field>
          <Field label="系统锚杆(横×纵)">
            <input type="text" value={form.anchor} onChange={(e) => setForm({ ...form, anchor: e.target.value })} />
          </Field>
          <Field label="钢拱架型号/间距">
            <input type="text" value={form.steel} onChange={(e) => setForm({ ...form, steel: e.target.value })} />
          </Field>
          <Field label="喷射混凝土">
            <input type="text" value={form.shot} onChange={(e) => setForm({ ...form, shot: e.target.value })} />
          </Field>
          <Field label="二衬标号">
            <input type="text" value={form.conc} onChange={(e) => setForm({ ...form, conc: e.target.value })} />
          </Field>
          <Field label="二衬厚度">
            <input type="text" value={form.thick} onChange={(e) => setForm({ ...form, thick: e.target.value })} />
          </Field>
          <Field label="循环进尺">
            <input type="text" value={form.advRate} onChange={(e) => setForm({ ...form, advRate: e.target.value })} />
          </Field>
          <Field label="台阶长度">
            <input type="text" value={form.benchLen} onChange={(e) => setForm({ ...form, benchLen: e.target.value })} />
          </Field>
        </div>
      </Modal>

      {/* 导入 JSON */}
      <Modal
        open={openImport}
        onClose={() => setOpenImport(false)}
        title="批量导入支护方案（JSON 数组）"
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
          style={{ width: "100%", minHeight: 220, fontFamily: "monospace", fontSize: 11.5 }}
          placeholder='[{"rock":"Ⅴ级","type":"S5b","depth":"200~600","mode":"预留核心土法",...}]'
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
        />
        <div style={{ marginTop: 8, fontSize: 11, color: "#7189a8" }}>
          支持字段：rock / type / depth / advType / advRing / advLen / advScope / anchor / steel / shot / conc / thick / mode / advRate / benchLen
        </div>
      </Modal>

      <Toast msg={msg} />
    </div>
  );
}

function FilterBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <span className={`db-tab-btn ${active ? "active" : ""}`} onClick={onClick}>
      {children}
    </span>
  );
}

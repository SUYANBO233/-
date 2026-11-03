"use client";

import { useState } from "react";
import type { KnowledgeData } from "@/lib/types";
import { EquipmentTable } from "./equipment-table";
import { MethodLibrary } from "./method-library";
import { MappingTable } from "./mapping-table";
import { SchemeLibrary } from "./scheme-library";
import { EvaluationCriteriaManager } from './evaluation-criteria-manager';
import { DecisionCatalogManager } from './decision-catalog-manager';

type SubTab = "methods" | "support" | "equipment";

const TABS: { key: SubTab; label: string }[] = [
  { key: "methods", label: "标准工法库" },
  { key: "support", label: "支护体系与参数库" },
  { key: "equipment", label: "机械装备库" },
];

export function ExperienceTabs({ data }: { data: KnowledgeData }) {
  const [active, setActive] = useState<SubTab>("methods");

  return (
    <div>
      {/* 页面头部：标题 + 二级胶囊切换（照搬 123 .page-head 结构） */}
      <div
        className="mb-3 flex flex-wrap items-center justify-between gap-3"
      >
        <h1 className="m-0 text-[20px] font-bold tracking-[.3px] text-white">
          经验数据库
        </h1>
        <div className="sub-tab-capsule">
          {TABS.map((t) => (
            <button
              type="button"
              key={t.key}
              className={`st-btn ${active === t.key ? "active" : ""}`}
              onClick={() => setActive(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {active === "methods" && (
          <>
            <MethodLibrary data={data.methods} />
            <DecisionCatalogManager focus="rules" />
            <MappingTable title={data.mappingTitle} data={data.mappings} />
          </>
        )}
        {active === "support" && (
          <><DecisionCatalogManager focus="templates" /><EvaluationCriteriaManager /><SchemeLibrary title={`旧资料展示 · ${data.schemeTitle}`} data={data.schemes} /></>
        )}
        {active === "equipment" && (
          <EquipmentTable title={data.equipmentTitle} data={data.equipment} />
        )}
      </div>
    </div>
  );
}

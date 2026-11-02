# 项目上下文

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本
│   ├── build.sh            # 构建脚本
│   ├── dev.sh              # 开发环境启动脚本
│   ├── prepare.sh          # 预处理脚本
│   ├── start.sh            # 生产环境启动脚本
│   └── validate.sh         # 静态校验脚本
├── src/
│   ├── app/                # 路由层（Next.js App Router 约定）
│   │   ├── layout.tsx      #   根布局（前端壳）
│   │   ├── page.tsx        #   系统总览首页（前端页面）
│   │   └── api/            #   后端 API 路由（HTTP 入口）
│   ├── components/         # 前端：UI 组件
│   │   ├── overview/       #   业务组件（系统总览板块）
│   │   └── ui/             #   Shadcn UI 基础组件库
│   ├── hooks/              # 前端：自定义 Hooks
│   ├── lib/                # 共享：工具 + 类型 + 前端数据访问
│   │   ├── api.ts          #   前端数据访问层（fetchOverview）
│   │   ├── types.ts        #   领域类型契约（前后端共用）
│   │   └── utils.ts        #   通用工具函数 (cn)
│   ├── data/               # 数据层：静态种子数据
│   │   └── overview.ts
│   ├── server/             # 后端：服务端业务逻辑
│   │   └── overview.ts     #   总览业务服务
│   └── server.ts           # 后端：自定义 HTTP 服务入口
├── next.config.ts          # Next.js 配置
├── package.json            # 项目依赖管理
└── tsconfig.json           # TypeScript 配置
```

- 项目文件（如 app 目录、pages 目录、components 等）默认初始化到 `src/` 目录下。
- 分层约定：**路由层**（`src/app`）→ **服务层**（`src/server`）→ **数据层**（`src/data`）；前端视图在 `src/components` + `src/hooks`，共享契约与工具在 `src/lib`。

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。
**常用命令**：
- 安装依赖：`pnpm add <package>`
- 安装开发依赖：`pnpm add -D <package>`
- 安装所有依赖：`pnpm install`
- 移除依赖：`pnpm remove <package>`

## 开发规范

### 编码规范

- 默认按 TypeScript `strict` 心智写代码；优先复用当前作用域已声明的变量、函数、类型和导入，禁止引用未声明标识符或拼错变量名。
- 禁止隐式 `any` 和 `as any`；函数参数、返回值、解构项、事件对象、`catch` 错误在使用前应有明确类型或先完成类型收窄，并清理未使用的变量和导入。

### next.config 配置规范

- 配置的路径不要写死绝对路径，必须使用 path.resolve(__dirname, ...)、import.meta.dirname 或 process.cwd() 动态拼接。

### Hydration 问题防范

1. 严禁在 JSX 渲染逻辑中直接使用 typeof window、Date.now()、Math.random() 等动态数据。**必须使用 'use client' 并配合 useEffect + useState 确保动态内容仅在客户端挂载后渲染**；同时严禁非法 HTML 嵌套（如 <p> 嵌套 <div>）。
2. **禁止使用 head 标签**，优先使用 metadata，详见文档：https://nextjs.org/docs/app/api-reference/functions/generate-metadata
   1. 三方 CSS、字体等资源可在 `globals.css` 中顶部通过 `@import` 引入或使用 next/font
   2. preload, preconnect, dns-prefetch 通过 ReactDOM 的 preload、preconnect、dns-prefetch 方法引入
   3. json-ld 可阅读 https://nextjs.org/docs/app/guides/json-ld

## UI 设计与组件规范 (UI & Styling Standards)

- 模板默认预装核心组件库 `shadcn/ui`，位于`src/components/ui/`目录下
- Next.js 项目**必须默认**采用 shadcn/ui 组件、风格和规范，**除非用户指定用其他的组件和规范。**

## 系统板块结构

当前已实现「系统总览」板块（`/`，首页）与「智能决策中心」板块（`/decision`）。后续将依次实现：标准工法库、支护体系配置、装备配置、方案与报告。

### 智能决策中心（`/decision`）

四步决策流程，组件位于 `src/components/decision/`，状态编排位于 `src/hooks/use-decision.ts`：

| 文件 | 类型 | 职责 |
|---|---|---|
| flow-bar.tsx | client | 四步流程条（可跳转） |
| decision-workbench.tsx | client | Step1 工作台：模式切换 / 工作面选择 / 16 项工程参数 |
| method-select.tsx | client | Step2 候选工法卡片（匹配度 + 选择） |
| support-design.tsx | client | Step3 成拱机理 / 四构件微调 / 安全度仪表 / 雷达图 |
| scheme-report.tsx | client | Step4 施工配置方案报告表 |
| decision-placeholder.tsx | client | 未启动推理时的占位提示 |

- 推理逻辑：`backend/app/algorithms/configurable.py`（D1 数据库规则与完整模板）；`reference.py` 保留为显式旧参考算法；`src/lib/decision-engine.ts` 保留为显式离线演示。
- 静态数据：`src/data/decision.ts`（工法库、工作面、里程、围岩默认参数）。
- 领域类型：`src/lib/types.ts` 中 `DecisionMode` / `GeoParams` / `MethodMatch` / `SupportComponent` / `SafetyAssessment` / `SchemeReport` 等。
- **后端接入约定**：后端为 Python 服务，前端统一通过 `/api/decision/*` 同源路径访问（由部署层转发）。接口契约定义在 `src/lib/api.ts`（`inferMethods` / `designSupport` / `recheckSafety` / `generateSchemeApi`），目前已提供 Python 规则服务，默认由 Next.js 同源代理访问；`decision-engine.ts` 仅用于显式离线演示。保存接口为 `/api/scheme/save-decision`，完整实现与替换方法见文末 Python 后端约定及 `docs/backend.md`。

### 经验数据库板块（`/knowledge`）

| 文件 | 类型 | 职责 |
|---|---|---|
| `src/app/knowledge/page.tsx` | server | 经验数据库页面：装备配置 / 标准工法 / 知识映射 / 支护方案 |
| `src/components/knowledge/equipment-table.tsx` | client | 9 种核心装备配置表（含搜索） |
| `src/components/knowledge/method-library.tsx` | server | 三类标准工法卡片（全断面/台阶/环形预留核心土） |
| `src/components/knowledge/mapping-table.tsx` | client | 地质环境特征→支护知识方案映射表 |
| `src/components/knowledge/scheme-library.tsx` | client | 支护体系与优选方案大表（Ⅳ/Ⅴ级围岩筛选，双行表头） |
| `src/components/knowledge/data-table.tsx` | client | 通用暗色表格（泛型） |
| `src/components/knowledge/{section-title,tag}.tsx` | server | 板块标题、标签组件 |

- 数据层：`src/data/knowledge.ts`（9 装备 + 3 工法 + 8 映射 + 7 支护方案）。
- 服务/接口：`src/server/knowledge.ts` → `GET /api/knowledge`，`fetchKnowledge()`（`src/lib/api.ts`）。
- 后端接入后仅需替换服务层实现，返回 `KnowledgeData` 契约，页面零改动。

### 顶部导航（TopBar）

主导航严格对应参考原型四个主 tab：**系统总览 `/`、智能决策中心 `/decision`、经验数据库 `/knowledge`、方案报告与决策台账（占位）**。装备/工法/支护等内容作为经验数据库页内板块，不单独占主导航项。

### 总览板块组件（src/components/overview/）

| 文件 | 类型 | 职责 |
|---|---|---|
| top-bar.tsx | client | 顶栏：品牌 + 导航 + 状态 + 时钟 |
| overview-header.tsx | server | 页面标题、副标题、徽章 |
| achievement-board.tsx | server | 现场应用成效指标看板（4 KPI） |
| project-panel.tsx | server | 示范工程配置应用卡片 |
| longitudinal-strip.tsx | client | 纵断面衬砌色带（主洞/平导切换 + 选段明细） |
| support-kpi-grid.tsx | server | 工法与支护统计 KPI |
| charts-section.tsx | client | 衬砌类型里程柱状图 + 钢架分布环形图 |

### 数据流与接口预留

```
page.tsx (server，前端页面)
   │
   └──► fetchOverview() (src/lib/api.ts，前端数据访问)
          │
          ├─ 当前：直接返回 src/data/overview.ts 静态数据
          └─ 后端就绪后：改为 fetch('/api/overview')
                  │
                  v
          GET /api/overview (src/app/api/overview/route.ts，HTTP 层)
                  │
                  └──► getOverview() (src/server/overview.ts，后端服务层)
                          │
                          └──► src/data/overview.ts（数据层，种子数据）
```

- 数据契约统一为 `src/lib/types.ts` 中的 `OverviewData`，前端组件只依赖该类型。
- 后端接入后仅需替换 `fetchOverview` 与 `src/server/overview.ts` 内部实现，路由与组件零改动。

## Python 决策后端（已实现）

- 独立服务位于 `backend/`，遵循 API 路由 → services → algorithms/repositories 分层。`backend/app/models.py` 与前端 camelCase 契约保持一致。
- 直接使用 Codespaces 已有 `python3`，不创建虚拟环境。`pnpm dev:all` 使用数据库；`pnpm dev:d1` 显式启用隔离 PGlite 与合成资料，绝不写 Supabase。
- 默认决策计算通过 `/api/decision/*` 由 Next.js 代理到 Python；服务端地址由 `DECISION_BACKEND_URL` 配置。显式离线演示才使用 `NEXT_PUBLIC_DECISION_CHANNEL=mock`。
- 算法实现遵循 `backend/app/algorithms/base.py`，通过 `DECISION_ALGORITHM_FACTORY` 加载。D1 默认 configurable 工厂按规则选择完整模板，允许零推荐、并列和无法评价；旧 reference 工厂仅显式启用。不得伪造评分、置信度或成拱参数。
- 保存入口统一为 `/api/scheme/save-decision`；服务端调用 Python `build-snapshot` 重放版本后，使用已有 Supabase 事务保存。不要在数据库读写代码中复制算法。
- 新算法或模板更改行为时更新版本号。输入/输出、版本变更、异常和算法替换均应测试；运行方法见 `docs/backend.md`。

## D1 决策资料维护

- 规则位于 `decision_rule`，完整规格位于 `support_scheme.parameters`。只有启用且结构完整的资料参与新计算；旧自由文本映射不直接执行。
- 内部资料读取为认证的 `/api/internal/decision-catalog`；维护为 `/api/knowledge/decision-catalog`。数据库一致性快照由 `read_decision_catalog()` 提供，不用多次独立读取伪装同一版本。
- 每次请求冻结资料摘要；后续步骤版本不同返回 409 重新匹配。发布为事务，同编码版本内容不可覆盖，启用新版本停用旧版本。
- 缺失工程参数保持缺失，规则只使用已提供的合法字段；不把缺失值转为零。响应模型未接入时返回 unavailable 和空分数。
- 迁移只追加；当前业务表 14 张。完整运行方法见 `docs/d1.md`，浏览器测试 `pnpm test:d1:browser` 使用独立本地目录与测试端口。

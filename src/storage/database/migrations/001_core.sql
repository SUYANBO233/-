-- 兼容现有四张业务表：保留旧字段，新增结构化字段，不删除旧记录。
CREATE TABLE IF NOT EXISTS public.equipment (
  id serial PRIMARY KEY, name varchar(100) NOT NULL, model varchar(120) NOT NULL,
  num integer NOT NULL DEFAULT 1, unit varchar(20) NOT NULL DEFAULT '台',
  pos text NOT NULL, stage varchar(60) NOT NULL,
  is_custom boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.knowledge_mapping (
  id serial PRIMARY KEY, no integer NOT NULL, code varchar(40) NOT NULL,
  hard varchar(80) NOT NULL, intact varchar(60) NOT NULL, water varchar(60) NOT NULL,
  depth varchar(60) NOT NULL, stress varchar(60) NOT NULL, rock varchar(20) NOT NULL,
  scheme varchar(120) NOT NULL, is_custom boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.support_scheme (
  id serial PRIMARY KEY, no integer NOT NULL, rock varchar(20) NOT NULL,
  type varchar(40) NOT NULL, depth varchar(60) NOT NULL,
  adv_type varchar(120) NOT NULL, adv_ring varchar(40) NOT NULL,
  adv_len varchar(40) NOT NULL, adv_scope varchar(60) NOT NULL,
  anchor varchar(120) NOT NULL, steel varchar(120) NOT NULL,
  shot varchar(120) NOT NULL, conc varchar(120) NOT NULL, thick varchar(40) NOT NULL,
  mode varchar(60) NOT NULL, adv_rate varchar(40) NOT NULL, bench_len varchar(40) NOT NULL,
  is_custom boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.scheme_history (
  id serial PRIMARY KEY, time varchar(40) NOT NULL, face varchar(200) NOT NULL,
  start_mile varchar(40) NOT NULL, end_mile varchar(40) NOT NULL,
  advance varchar(20) NOT NULL, rock varchar(20) NOT NULL, method varchar(60) NOT NULL,
  type varchar(20) NOT NULL, score numeric(6,2) NOT NULL, detail text NOT NULL,
  custom boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS seed_key text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'legacy';
ALTER TABLE public.knowledge_mapping
  ADD COLUMN IF NOT EXISTS seed_key text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS conditions jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.support_scheme
  ADD COLUMN IF NOT EXISTS seed_key text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parameters jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.scheme_history
  ADD COLUMN IF NOT EXISTS seed_key text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS advance_m numeric(12,3),
  ADD COLUMN IF NOT EXISTS cycle_duration_minutes integer;

CREATE UNIQUE INDEX IF NOT EXISTS equipment_seed_key_uidx ON public.equipment(seed_key);
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_mapping_seed_key_uidx ON public.knowledge_mapping(seed_key);
CREATE UNIQUE INDEX IF NOT EXISTS support_scheme_seed_key_uidx ON public.support_scheme(seed_key);
CREATE UNIQUE INDEX IF NOT EXISTS scheme_history_seed_key_uidx ON public.scheme_history(seed_key);
CREATE INDEX IF NOT EXISTS scheme_history_face_time_idx ON public.scheme_history(face, time);
CREATE INDEX IF NOT EXISTS equipment_stage_idx ON public.equipment(stage);
CREATE INDEX IF NOT EXISTS support_scheme_rock_idx ON public.support_scheme(rock);

-- 序号由数据库分配，替代服务端 MAX(no)+1（并发请求会产生相同序号）。
CREATE SEQUENCE IF NOT EXISTS public.knowledge_mapping_no_seq;
CREATE SEQUENCE IF NOT EXISTS public.support_scheme_no_seq;
ALTER SEQUENCE public.knowledge_mapping_no_seq OWNED BY public.knowledge_mapping.no;
ALTER SEQUENCE public.support_scheme_no_seq OWNED BY public.support_scheme.no;
ALTER TABLE public.knowledge_mapping ALTER COLUMN no SET DEFAULT nextval('public.knowledge_mapping_no_seq');
ALTER TABLE public.support_scheme ALTER COLUMN no SET DEFAULT nextval('public.support_scheme_no_seq');

-- 不对历史的日期/里程建立唯一约束：不同工作面、版本可以具有相同日期与里程。
-- 初始化改用独立 seed_key；迁移只同步序列，不重排历史编号。
DO $$
DECLARE
  v_table text; v_column text; v_seq text; v_max bigint; v_last bigint; v_called boolean;
BEGIN
  FOR v_table,v_column IN SELECT * FROM (VALUES ('equipment','id'),('knowledge_mapping','id'),
    ('support_scheme','id'),('scheme_history','id'),('knowledge_mapping','no'),('support_scheme','no')) AS items(t,c)
  LOOP
    v_seq := pg_get_serial_sequence('public.' || v_table,v_column);
    EXECUTE format('SELECT coalesce(max(%I),0) FROM public.%I',v_column,v_table) INTO v_max;
    EXECUTE format('SELECT last_value,is_called FROM %s',v_seq) INTO v_last,v_called;
    PERFORM setval(v_seq::regclass,GREATEST(v_max,v_last,1),v_called OR v_max>0);
  END LOOP;
END $$;

CREATE TABLE public.project (
  id serial PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL,
  location text, status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.tunnel (
  id serial PRIMARY KEY, project_id integer NOT NULL REFERENCES public.project(id),
  code text NOT NULL UNIQUE, name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('main','pilot')),
  start_chainage_m numeric(14,3) NOT NULL, end_chainage_m numeric(14,3) NOT NULL,
  length_m numeric(14,3) NOT NULL CHECK (length_m > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.workface (
  id serial PRIMARY KEY, tunnel_id integer NOT NULL REFERENCES public.tunnel(id),
  code text NOT NULL UNIQUE, name text NOT NULL,
  direction integer NOT NULL DEFAULT 1 CHECK (direction IN (-1,1)),
  current_chainage_m numeric(14,3), status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workface_tunnel_idx ON public.workface(tunnel_id);
CREATE TABLE public.construction_method (
  id serial PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  geology text NOT NULL, section text NOT NULL, advantage text NOT NULL,
  equipment_text text NOT NULL, rock_grades jsonb NOT NULL,
  cycle_hours numeric(8,2) NOT NULL CHECK (cycle_hours > 0),
  advance_m numeric(8,3) NOT NULL CHECK (advance_m > 0),
  shotcrete_thickness_mm numeric(8,2) NOT NULL CHECK (shotcrete_thickness_mm > 0),
  monthly_advance_m numeric(10,3) NOT NULL CHECK (monthly_advance_m > 0),
  description text NOT NULL, tone text NOT NULL DEFAULT 'brand',
  source text NOT NULL DEFAULT 'manual', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.tunnel_segment (
  id serial PRIMARY KEY, tunnel_id integer NOT NULL REFERENCES public.tunnel(id),
  seed_key text UNIQUE, start_chainage_m numeric(14,3) NOT NULL,
  end_chainage_m numeric(14,3) NOT NULL, length_m numeric(14,3) NOT NULL CHECK (length_m > 0),
  method_id integer REFERENCES public.construction_method(id),
  support_scheme_id integer REFERENCES public.support_scheme(id),
  design_version integer NOT NULL DEFAULT 1 CHECK (design_version > 0),
  snapshot jsonb NOT NULL, source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_chainage_m > start_chainage_m)
);
CREATE INDEX tunnel_segment_tunnel_start_idx ON public.tunnel_segment(tunnel_id,start_chainage_m);
CREATE TABLE public.geo_observation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workface_id integer NOT NULL REFERENCES public.workface(id),
  seed_key text UNIQUE, chainage_m numeric(14,3) NOT NULL,
  observed_at timestamptz NOT NULL, source text NOT NULL,
  rock_grade text NOT NULL CHECK (rock_grade IN ('I','II','III','IV','V','VI')),
  params jsonb NOT NULL CHECK (jsonb_typeof(params) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX geo_observation_workface_time_idx ON public.geo_observation(workface_id,observed_at);
CREATE TABLE public.decision_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_key uuid NOT NULL UNIQUE,
  payload_hash text NOT NULL,
  workface_id integer NOT NULL REFERENCES public.workface(id),
  geo_observation_id uuid REFERENCES public.geo_observation(id),
  mode text NOT NULL CHECK (mode IN ('joint','manual')),
  execution_channel text NOT NULL CHECK (execution_channel IN ('mock','real')),
  algorithm_version text NOT NULL, source text NOT NULL,
  input_snapshot jsonb NOT NULL CHECK (jsonb_typeof(input_snapshot) = 'object'),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX decision_run_workface_time_idx ON public.decision_run(workface_id,created_at);
CREATE TABLE public.decision_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_run_id uuid NOT NULL REFERENCES public.decision_run(id),
  revision integer NOT NULL CHECK (revision > 0),
  method_id integer NOT NULL REFERENCES public.construction_method(id),
  support_scheme_id integer REFERENCES public.support_scheme(id),
  method_snapshot jsonb NOT NULL, candidates_snapshot jsonb NOT NULL,
  support_snapshot jsonb NOT NULL, safety_snapshot jsonb NOT NULL,
  reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(decision_run_id,revision)
);
CREATE TABLE public.scheme_report (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), no text NOT NULL UNIQUE,
  decision_revision_id uuid NOT NULL UNIQUE REFERENCES public.decision_revision(id),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  file_url text, generated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.knowledge_mapping
  ADD COLUMN IF NOT EXISTS support_scheme_id integer REFERENCES public.support_scheme(id);
ALTER TABLE public.scheme_history
  ADD COLUMN IF NOT EXISTS workface_id integer REFERENCES public.workface(id),
  ADD COLUMN IF NOT EXISTS method_id integer REFERENCES public.construction_method(id),
  ADD COLUMN IF NOT EXISTS decision_run_id uuid REFERENCES public.decision_run(id),
  ADD COLUMN IF NOT EXISTS scheme_report_id uuid REFERENCES public.scheme_report(id);
CREATE UNIQUE INDEX scheme_history_report_uidx ON public.scheme_history(scheme_report_id);
CREATE INDEX scheme_history_workface_time_idx ON public.scheme_history(workface_id,time);

-- 新建数据通过服务端访问。已有四表的 RLS 策略保持部署方现状。
ALTER TABLE public.project ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tunnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workface ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.construction_method ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tunnel_segment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_observation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheme_report ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT USAGE ON SCHEMA public TO service_role;
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.project,public.tunnel,public.workface,
      public.construction_method,public.tunnel_segment,public.geo_observation,
      public.decision_run,public.decision_revision,public.scheme_report,
      public.equipment,public.knowledge_mapping,public.support_scheme,public.scheme_history TO service_role;
    GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
  END IF;
END $$;

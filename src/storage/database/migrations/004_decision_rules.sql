-- D1: executable, versioned rules and complete support specifications.
ALTER TABLE public.support_scheme ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.support_scheme ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.support_scheme ADD COLUMN IF NOT EXISTS test_batch_id text;
CREATE UNIQUE INDEX IF NOT EXISTS support_scheme_code_version_uidx ON public.support_scheme(code,version);
CREATE UNIQUE INDEX IF NOT EXISTS support_scheme_enabled_code_uidx ON public.support_scheme(code) WHERE enabled;
ALTER TABLE public.support_scheme ADD CONSTRAINT support_scheme_enabled_complete CHECK (
  NOT enabled OR (code IS NOT NULL AND parameters ?& ARRAY['steel','shot','anchor','advance'])
);
ALTER TABLE public.geo_observation ADD COLUMN IF NOT EXISTS test_batch_id text;
ALTER TABLE public.geo_observation ALTER COLUMN rock_grade DROP NOT NULL;

CREATE TABLE public.decision_rule (
  id serial PRIMARY KEY, code text NOT NULL, version integer NOT NULL CHECK (version>0),
  name text NOT NULL, kind text NOT NULL CHECK (kind IN ('method','support')),
  method_key text NOT NULL REFERENCES public.construction_method(code),
  priority integer NOT NULL CHECK (priority BETWEEN 0 AND 100000), enabled boolean NOT NULL DEFAULT false,
  conditions jsonb NOT NULL CHECK (jsonb_typeof(conditions)='object'), reason text NOT NULL,
  template_code text, template_version integer,
  source text NOT NULL CHECK (source IN ('manual','import','simulation')), test_batch_id text,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(code,version),
  FOREIGN KEY(template_code,template_version) REFERENCES public.support_scheme(code,version),
  CHECK ((kind='method' AND template_code IS NULL AND template_version IS NULL)
      OR (kind='support' AND template_code IS NOT NULL AND template_version IS NOT NULL)),
  CHECK (source<>'simulation' OR test_batch_id IS NOT NULL)
);
CREATE UNIQUE INDEX decision_rule_enabled_code_uidx ON public.decision_rule(code) WHERE enabled;
ALTER TABLE public.decision_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheme_history ALTER COLUMN score DROP NOT NULL;
ALTER TABLE public.scheme_history ADD COLUMN evaluation_status text;
ALTER TABLE public.scheme_history ADD CONSTRAINT scheme_history_evaluation_status_check
  CHECK (evaluation_status IS NULL OR evaluation_status IN ('unavailable','satisfied','unsatisfied'));

-- Atomic import: immutable code/version content, idempotent retries, all-or-nothing.
CREATE FUNCTION public.publish_decision_catalog(p_bundle jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v jsonb; old jsonb; s public.support_scheme%ROWTYPE; r public.decision_rule%ROWTYPE;
  o public.geo_observation%ROWTYPE; face_id integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('decision_catalog_publish_v1'));
  FOR v IN SELECT value FROM jsonb_array_elements(p_bundle->'templates') LOOP
    SELECT * INTO s FROM public.support_scheme WHERE code=v->>'code' AND version=(v->>'version')::integer;
    IF FOUND THEN
      IF s.type IS DISTINCT FROM v->>'name' OR s.parameters IS DISTINCT FROM v->'parameters'
        OR s.source IS DISTINCT FROM v->>'source' OR s.test_batch_id IS DISTINCT FROM v->>'testBatchId' THEN
        RAISE EXCEPTION 'template version already contains different content' USING ERRCODE='23505';
      END IF;
      CONTINUE;
    END IF;
    IF (v->>'enabled')::boolean THEN UPDATE public.support_scheme SET enabled=false WHERE code=v->>'code'; END IF;
    INSERT INTO public.support_scheme(code,version,type,rock,depth,adv_type,adv_ring,adv_len,adv_scope,anchor,steel,shot,conc,thick,mode,adv_rate,bench_len,
      is_custom,source,enabled,parameters,test_batch_id)
    VALUES(v->>'code',(v->>'version')::integer,v->>'name','规则确定','规则确定',
      v->'parameters'->'advance'->>'type',v->'parameters'->'advance'->>'ringSpacingCm',
      v->'parameters'->'advance'->>'lengthM',v->'parameters'->'advance'->>'scope',
      (v->'parameters'->'anchor')::text,(v->'parameters'->'steel')::text,(v->'parameters'->'shot')::text,
      '待确定','待确定','规则模板','待确定','待确定',true,v->>'source',(v->>'enabled')::boolean,v->'parameters',v->>'testBatchId');
  END LOOP;
  FOR v IN SELECT value FROM jsonb_array_elements(p_bundle->'rules') LOOP
    SELECT * INTO r FROM public.decision_rule WHERE code=v->>'code' AND version=(v->>'version')::integer;
    IF FOUND THEN
      old := jsonb_build_object('code',r.code,'version',r.version,'name',r.name,'kind',r.kind,'methodKey',r.method_key,
        'priority',r.priority,'conditions',r.conditions,'reason',r.reason,'templateCode',r.template_code,
        'templateVersion',r.template_version,'source',r.source,'testBatchId',r.test_batch_id);
      IF old IS DISTINCT FROM (v-'enabled') THEN RAISE EXCEPTION 'rule version already contains different content' USING ERRCODE='23505'; END IF;
      CONTINUE;
    END IF;
    IF (v->>'enabled')::boolean THEN UPDATE public.decision_rule SET enabled=false WHERE code=v->>'code'; END IF;
    INSERT INTO public.decision_rule(code,version,name,kind,method_key,priority,enabled,conditions,reason,template_code,template_version,source,test_batch_id)
      VALUES(v->>'code',(v->>'version')::integer,v->>'name',v->>'kind',v->>'methodKey',(v->>'priority')::integer,
        (v->>'enabled')::boolean,v->'conditions',v->>'reason',v->>'templateCode',(v->>'templateVersion')::integer,v->>'source',v->>'testBatchId');
  END LOOP;
  FOR v IN SELECT value FROM jsonb_array_elements(p_bundle->'observations') LOOP
    SELECT * INTO o FROM public.geo_observation WHERE id=(v->>'id')::uuid;
    SELECT id INTO STRICT face_id FROM public.workface WHERE code=v->>'workface';
    IF FOUND AND o.id IS NOT NULL THEN
      IF o.params IS DISTINCT FROM v->'params' OR o.workface_id IS DISTINCT FROM face_id
        OR o.observed_at IS DISTINCT FROM (v->>'observedAt')::timestamptz
        OR o.chainage_m IS DISTINCT FROM (substring(split_part(v->>'mileage','+',1) FROM 2)::numeric*1000+split_part(v->>'mileage','+',2)::numeric)
        OR o.source IS DISTINCT FROM v->>'source' OR o.test_batch_id IS DISTINCT FROM v->>'testBatchId' THEN
        RAISE EXCEPTION 'observation is immutable' USING ERRCODE='23505';
      END IF;
      CONTINUE;
    END IF;
    INSERT INTO public.geo_observation(id,workface_id,chainage_m,observed_at,source,rock_grade,params,test_batch_id)
      VALUES((v->>'id')::uuid,face_id,substring(split_part(v->>'mileage','+',1) FROM 2)::numeric*1000+split_part(v->>'mileage','+',2)::numeric,
        (v->>'observedAt')::timestamptz,v->>'source',v->'params'->>'grade',v->'params',v->>'testBatchId');
  END LOOP;
  RETURN jsonb_build_object('templates',jsonb_array_length(p_bundle->'templates'),'rules',jsonb_array_length(p_bundle->'rules'),'observations',jsonb_array_length(p_bundle->'observations'));
END $$;

CREATE FUNCTION public.set_decision_catalog_enabled(p_kind text,p_code text,p_version integer,p_enabled boolean) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE found_id integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('decision_catalog_publish_v1'));
  IF p_kind='rule' THEN
    SELECT id INTO STRICT found_id FROM public.decision_rule WHERE code=p_code AND version=p_version;
    IF p_enabled THEN UPDATE public.decision_rule SET enabled=false WHERE code=p_code; END IF;
    UPDATE public.decision_rule SET enabled=p_enabled WHERE id=found_id;
  ELSIF p_kind='template' THEN
    SELECT id INTO STRICT found_id FROM public.support_scheme WHERE code=p_code AND version=p_version;
    IF p_enabled THEN UPDATE public.support_scheme SET enabled=false WHERE code=p_code; END IF;
    UPDATE public.support_scheme SET enabled=p_enabled WHERE id=found_id;
  ELSE RAISE EXCEPTION 'unknown entity' USING ERRCODE='22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.publish_decision_catalog(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_decision_catalog_enabled(text,text,integer,boolean) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    GRANT ALL ON public.decision_rule TO service_role;
    GRANT USAGE,SELECT ON SEQUENCE public.decision_rule_id_seq TO service_role;
    GRANT EXECUTE ON FUNCTION public.publish_decision_catalog(jsonb) TO service_role;
    GRANT EXECUTE ON FUNCTION public.set_decision_catalog_enabled(text,text,integer,boolean) TO service_role;
  END IF;
END $$;

ALTER TABLE public.decision_revision ADD COLUMN template_snapshot jsonb;
ALTER TABLE public.decision_revision ADD COLUMN rules_snapshot jsonb;

-- 保存算法服务实际返回的工法信息，与数据库目录元数据分开留痕。
-- 不修改已发布迁移，兼容已经执行 002 的数据库。
CREATE OR REPLACE FUNCTION public.save_decision(p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_request uuid := (p_payload->>'requestKey')::uuid;
  v_hash text := md5(p_payload::text);
  v_run uuid; v_revision uuid; v_report uuid; v_record integer;
  v_workface public.workface%ROWTYPE;
  v_method public.construction_method%ROWTYPE;
  v_existing public.decision_run%ROWTYPE;
  v_item jsonb; v_index integer := 0; v_content jsonb;
  v_no text; v_now timestamptz := now();
BEGIN
  IF v_request IS NULL OR jsonb_array_length(p_payload->'revisions') < 1 THEN
    RAISE EXCEPTION 'requestKey and revisions are required' USING ERRCODE = '22023';
  END IF;
  -- 同一请求的并发重试只产生一条报告，避免重复点击或网络重试重复入库。
  PERFORM pg_advisory_xact_lock(hashtextextended(v_request::text,0));
  SELECT * INTO v_existing FROM public.decision_run WHERE request_key = v_request;
  IF FOUND THEN
    IF v_existing.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'requestKey already used for a different decision' USING ERRCODE = '23505';
    END IF;
    SELECT sr.content,sh.id INTO v_content,v_record
      FROM public.scheme_report sr JOIN public.scheme_history sh ON sh.scheme_report_id = sr.id
      WHERE sh.decision_run_id = v_existing.id;
    RETURN jsonb_build_object('report',v_content,'recordId',v_record,'decisionRunId',v_existing.id);
  END IF;
  SELECT * INTO STRICT v_workface FROM public.workface WHERE code = p_payload->>'workface';
  INSERT INTO public.decision_run(request_key,payload_hash,workface_id,mode,execution_channel,
    algorithm_version,source,input_snapshot)
    VALUES(v_request,v_hash,v_workface.id,p_payload->>'mode',p_payload->>'channel',
      p_payload->>'algorithmVersion',p_payload->>'source',p_payload->'input') RETURNING id INTO v_run;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'revisions') LOOP
    v_index := v_index + 1;
    SELECT * INTO STRICT v_method FROM public.construction_method WHERE code = v_item->>'methodKey';
    INSERT INTO public.decision_revision(decision_run_id,revision,method_id,method_snapshot,
      candidates_snapshot,support_snapshot,safety_snapshot,reason,template_snapshot,rules_snapshot)
      VALUES(v_run,v_index,v_method.id,jsonb_build_object('catalog',to_jsonb(v_method),'algorithmCandidate',
        (SELECT candidate FROM jsonb_array_elements(p_payload->'candidates') AS candidate WHERE candidate->>'key'=v_item->>'methodKey')),p_payload->'candidates',
        v_item->'support',v_item->'safety',v_item->>'reason',v_item->'template',v_item->'rules') RETURNING id INTO v_revision;
  END LOOP;
  v_no := 'SY1-SC-' || to_char(v_now AT TIME ZONE 'Asia/Shanghai','YYYYMMDD') || '-' || v_run::text;
  v_content := (p_payload->'report') || jsonb_build_object('no',v_no,
    'time',to_char(v_now AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI'));
  INSERT INTO public.scheme_report(no,decision_revision_id,content,generated_at)
    VALUES(v_no,v_revision,v_content,v_now) RETURNING id INTO v_report;
  INSERT INTO public.scheme_history(time,face,start_mile,end_mile,advance,rock,method,type,score,detail,
    custom,source,advance_m,workface_id,method_id,decision_run_id,scheme_report_id,evaluation_status)
    VALUES(to_char(v_now AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD'),v_workface.name,
      p_payload->'report'->>'mile',p_payload->'report'->>'mile','—',
      p_payload->'report'->>'grade',p_payload->'report'->>'method','待确定',
      (v_item->'safety'->>'score')::numeric,
      '设计方案 ' || v_no || '；算法 ' || (p_payload->>'algorithmVersion') || '；未录入实际施工进尺',
      true,p_payload->>'source',NULL,v_workface.id,v_method.id,v_run,v_report) RETURNING id INTO v_record;
  RETURN jsonb_build_object('report',v_content,'recordId',v_record,'decisionRunId',v_run);
END $$;
REVOKE ALL ON FUNCTION public.save_decision(jsonb) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.save_decision(jsonb) TO service_role;
  END IF;
END $$;

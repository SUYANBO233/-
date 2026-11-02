-- 一次 RPC 调用在同一个 PostgreSQL 事务中保存全链路；任何失败都会回滚。
CREATE FUNCTION public.save_decision(p_payload jsonb) RETURNS jsonb
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
      candidates_snapshot,support_snapshot,safety_snapshot,reason)
      VALUES(v_run,v_index,v_method.id,to_jsonb(v_method),p_payload->'candidates',
        v_item->'support',v_item->'safety',v_item->>'reason') RETURNING id INTO v_revision;
  END LOOP;
  v_no := 'SY1-SC-' || to_char(v_now AT TIME ZONE 'Asia/Shanghai','YYYYMMDD') || '-' || v_run::text;
  v_content := (p_payload->'report') || jsonb_build_object('no',v_no,
    'time',to_char(v_now AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI'));
  INSERT INTO public.scheme_report(no,decision_revision_id,content,generated_at)
    VALUES(v_no,v_revision,v_content,v_now) RETURNING id INTO v_report;
  INSERT INTO public.scheme_history(time,face,start_mile,end_mile,advance,rock,method,type,score,detail,
    custom,source,advance_m,workface_id,method_id,decision_run_id,scheme_report_id)
    VALUES(to_char(v_now AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD'),v_workface.name,
      p_payload->'report'->>'mile',p_payload->'report'->>'mile','—',
      p_payload->'report'->>'grade',v_method.name,'待确定',
      (v_item->'safety'->>'score')::numeric,
      '设计方案 ' || v_no || '；' || (p_payload->>'channel') || ' 通道；未录入实际施工进尺',
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

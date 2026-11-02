-- One MVCC statement snapshot, rather than independent paginated REST reads.
CREATE FUNCTION public.read_decision_catalog() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT jsonb_build_object(
    'rules',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.decision_rule r),'[]'::jsonb),
    'templates',COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.support_scheme s WHERE s.code IS NOT NULL),'[]'::jsonb),
    'observations',COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM public.geo_observation o),'[]'::jsonb),
    'faces',COALESCE((SELECT jsonb_agg(to_jsonb(w) ORDER BY w.id) FROM public.workface w),'[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.read_decision_catalog() FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    GRANT EXECUTE ON FUNCTION public.read_decision_catalog() TO service_role;
  END IF;
END $$;

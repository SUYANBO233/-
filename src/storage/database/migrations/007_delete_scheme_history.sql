-- Delete only the selected ledger entries and their now-unreferenced snapshots.
CREATE FUNCTION public.delete_scheme_history(p_ids integer[]) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_reports uuid[]; v_revisions uuid[]; v_runs uuid[]; v_count integer;
BEGIN
  -- Serialize cleanup with other writers so shared snapshots cannot be removed mid-save.
  LOCK TABLE decision_run,decision_revision,scheme_report,scheme_history IN SHARE ROW EXCLUSIVE MODE;
  SELECT array_agg(scheme_report_id),array_agg(decision_run_id) INTO v_reports,v_runs
    FROM scheme_history WHERE id=ANY(p_ids);
  SELECT array_agg(decision_revision_id) INTO v_revisions FROM scheme_report WHERE id=ANY(v_reports);
  DELETE FROM scheme_history WHERE id=ANY(p_ids);
  GET DIAGNOSTICS v_count=ROW_COUNT;
  DELETE FROM scheme_report r WHERE r.id=ANY(v_reports)
    AND NOT EXISTS(SELECT 1 FROM scheme_history h WHERE h.scheme_report_id=r.id);
  DELETE FROM decision_revision r WHERE r.id=ANY(v_revisions)
    AND NOT EXISTS(SELECT 1 FROM scheme_report s WHERE s.decision_revision_id=r.id);
  DELETE FROM decision_run r WHERE r.id=ANY(v_runs)
    AND NOT EXISTS(SELECT 1 FROM scheme_history h WHERE h.decision_run_id=r.id)
    AND NOT EXISTS(SELECT 1 FROM decision_revision d WHERE d.decision_run_id=r.id);
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_scheme_history(integer[]) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    GRANT EXECUTE ON FUNCTION public.delete_scheme_history(integer[]) TO service_role;
  END IF;
END $$;

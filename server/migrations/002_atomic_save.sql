CREATE OR REPLACE FUNCTION dashboard_save(p_owner text, p_revision integer, p_operation text, p_data jsonb)
RETURNS TABLE(data jsonb, revision integer)
LANGUAGE plpgsql AS $$
DECLARE current_revision integer;
BEGIN
  SELECT s.revision INTO current_revision FROM dashboard_state s WHERE s.owner_id=p_owner FOR UPDATE;
  IF current_revision IS NULL THEN RETURN; END IF;
  IF EXISTS(SELECT 1 FROM dashboard_operations o WHERE o.owner_id=p_owner AND o.operation_id=p_operation) THEN
    RETURN QUERY SELECT s.data,s.revision FROM dashboard_state s WHERE s.owner_id=p_owner;
    RETURN;
  END IF;
  IF current_revision<>p_revision THEN RETURN; END IF;
  INSERT INTO dashboard_operations(owner_id,operation_id) VALUES(p_owner,p_operation);
  RETURN QUERY UPDATE dashboard_state s SET data=p_data,revision=s.revision+1,updated_at=now() WHERE s.owner_id=p_owner RETURNING s.data,s.revision;
END;
$$;

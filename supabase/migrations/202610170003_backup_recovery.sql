-- Preserve newer backup columns and an administrator-only exact row archive.
ALTER TABLE pm.projects ADD COLUMN project_type TEXT;
ALTER TABLE pm.sources ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';
CREATE TABLE pm.backup_recovery (
  id UUID PRIMARY KEY,
  backup_sha256 TEXT UNIQUE NOT NULL,
  owner_id UUID NOT NULL,
  revision INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('staging','committed')),
  manifest JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  committed_at TIMESTAMPTZ
);
CREATE TABLE pm.backup_recovery_rows (
  recovery_id UUID NOT NULL REFERENCES pm.backup_recovery(id),
  table_name TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  row_text TEXT NOT NULL,
  row_hash TEXT NOT NULL CHECK(row_hash=md5(row_text)),
  PRIMARY KEY(recovery_id,table_name,row_index)
);
REVOKE ALL ON pm.backup_recovery,pm.backup_recovery_rows FROM PUBLIC,anon,authenticated;

-- Match the original application privacy filter before publishing restored data.
-- Public reads use Supabase's HTTPS Data API, without an Edge-to-Postgres socket.
-- Only the administrator-pinned publication is readable; no owner ID is accepted.
CREATE OR REPLACE FUNCTION public.pm_public_read(operation TEXT, project_id TEXT DEFAULT '', snapshot_id TEXT DEFAULT '')
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE owner UUID; selected_snapshot TEXT; result JSONB; snapshot_list JSONB;
BEGIN
  SELECT p.owner_id INTO owner FROM pm.publication p WHERE p.singleton=true;
  IF owner IS NULL THEN RAISE EXCEPTION 'No public workspace configured.'; END IF;
  IF operation='health' THEN
    IF NOT EXISTS(SELECT 1 FROM pm.meta m WHERE m.owner_id=owner AND m.key='revision') THEN
      RAISE EXCEPTION 'Published workspace metadata is missing.';
    END IF;
    RETURN jsonb_build_object('ok',true,'readOnly',true);
  END IF;
  IF operation='workspace' THEN
    SELECT jsonb_build_object(
      'revision',(SELECT m.value::INTEGER FROM pm.meta m WHERE m.owner_id=owner AND m.key='revision'),
      'library',jsonb_build_object(
        'id','library','name','Global Library','status','active','version',2,'changes','[]'::JSONB,
        'entities',COALESCE((SELECT jsonb_agg((e.data_json::JSONB-'rawLog'-'sourceExcerpt')||jsonb_build_object('projectId','library') ORDER BY e.rowid) FROM pm.entities e WHERE e.owner_id=owner AND (e.data_json::JSONB->>'privacy') IS DISTINCT FROM 'local_only'),'[]'::JSONB),
        'relations',COALESCE((SELECT jsonb_agg((r.data_json::JSONB-'sourceExcerpt')||jsonb_build_object('scopeProjectId',r.scope_project_id,'projectId','library') ORDER BY r.rowid) FROM pm.relations r WHERE r.owner_id=owner AND EXISTS(SELECT 1 FROM pm.entities e WHERE e.owner_id=owner AND e.id=r.from_id AND (e.data_json::JSONB->>'privacy') IS DISTINCT FROM 'local_only') AND EXISTS(SELECT 1 FROM pm.entities e WHERE e.owner_id=owner AND e.id=r.to_id AND (e.data_json::JSONB->>'privacy') IS DISTINCT FROM 'local_only')),'[]'::JSONB)
      ),
      'projects',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',p.id,'name',p.name,'status',p.status,'createdAt',p.created_at,'updatedAt',p.updated_at,'version',2,'projectType',p.project_type,'changes','[]'::JSONB,
        'entities',COALESCE((SELECT jsonb_agg(((e.data_json::JSONB||COALESCE(a.data_json::JSONB,'{}'::JSONB)||COALESCE(s.data_json::JSONB,'{}'::JSONB))-'rawLog'-'sourceExcerpt')||jsonb_build_object('projectId',p.id) ORDER BY e.rowid)
          FROM pm.entities e JOIN pm.project_memberships m ON m.owner_id=e.owner_id AND m.entity_id=e.id
          LEFT JOIN pm.project_assessments a ON a.owner_id=e.owner_id AND a.entity_id=e.id AND a.project_id=p.id
          LEFT JOIN pm.project_schedules s ON s.owner_id=e.owner_id AND s.entity_id=e.id AND s.project_id=p.id
          WHERE e.owner_id=owner AND m.project_id=p.id AND (e.data_json::JSONB->>'privacy') IS DISTINCT FROM 'local_only'),'[]'::JSONB),
        'relations',COALESCE((SELECT jsonb_agg((r.data_json::JSONB-'sourceExcerpt')||jsonb_build_object('scopeProjectId',r.scope_project_id,'projectId',p.id) ORDER BY r.rowid)
          FROM pm.relations r WHERE r.owner_id=owner AND EXISTS(SELECT 1 FROM pm.entities e WHERE e.owner_id=owner AND e.id=r.from_id AND (e.data_json::JSONB->>'privacy') IS DISTINCT FROM 'local_only') AND EXISTS(SELECT 1 FROM pm.entities e WHERE e.owner_id=owner AND e.id=r.to_id AND (e.data_json::JSONB->>'privacy') IS DISTINCT FROM 'local_only') AND (r.scope_project_id IS NULL OR r.scope_project_id=p.id)
          AND EXISTS(SELECT 1 FROM pm.project_memberships m WHERE m.owner_id=owner AND m.project_id=p.id AND m.entity_id=r.from_id)
          AND EXISTS(SELECT 1 FROM pm.project_memberships m WHERE m.owner_id=owner AND m.project_id=p.id AND m.entity_id=r.to_id)),'[]'::JSONB),
        'workstreams',COALESCE((SELECT jsonb_object_agg(l.entity_id,l.codes) FROM (
          SELECT w.entity_id,jsonb_agg(w.code ORDER BY w.rowid) AS codes FROM pm.project_workstreams w JOIN pm.entities e ON e.owner_id=w.owner_id AND e.id=w.entity_id WHERE (e.data_json::JSONB->>'privacy') IS DISTINCT FROM 'local_only' AND w.owner_id=owner AND w.project_id=p.id GROUP BY w.entity_id
        ) l),'{}'::JSONB)
      ) ORDER BY p.rowid) FROM pm.projects p WHERE p.owner_id=owner),'[]'::JSONB),
      'viewSettings',COALESCE((SELECT jsonb_object_agg(v.project_id,v.settings) FROM (
        SELECT s.project_id,jsonb_object_agg(s.view_key,s.data_json::JSONB) AS settings FROM pm.project_view_settings s WHERE s.owner_id=owner GROUP BY s.project_id
      ) v),'{}'::JSONB),
      'pendingChange',NULL
    ) INTO result;
    RETURN result;
  END IF;
  IF operation NOT IN ('wip','staffing','production-staffing') THEN RAISE EXCEPTION 'Unsupported public operation.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pm.projects p WHERE p.owner_id=owner AND p.id=project_id) THEN RAISE EXCEPTION 'Unknown project.'; END IF;
  IF operation='wip' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',s.id,'capturedAt',s.captured_at,'filename',s.filename,'sheet',s.sheet,'createdAt',s.created_at) ORDER BY s.captured_at DESC,s.created_at DESC),'[]'::JSONB)
      INTO snapshot_list FROM (SELECT s.* FROM pm.wip_snapshots s WHERE s.owner_id=owner AND s.project_id=pm_public_read.project_id ORDER BY s.captured_at DESC,s.created_at DESC LIMIT 100) s;
    selected_snapshot:=COALESCE(NULLIF(snapshot_id,''),snapshot_list->0->>'id','');
    IF selected_snapshot<>'' AND NOT EXISTS(SELECT 1 FROM pm.wip_snapshots s WHERE s.owner_id=owner AND s.project_id=pm_public_read.project_id AND s.id=selected_snapshot) THEN RAISE EXCEPTION 'Unknown WIP snapshot.'; END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('row',c.source_row,'column',c.source_column,'code',c.product_code,'partName',c.part_label,'partId',COALESCE(c.part_id,''),'stage',c.stage_label,'stepId',COALESCE(c.step_id,''),'quantity',c.quantity) ORDER BY c.source_row,c.source_column),'[]'::JSONB)
      INTO result FROM pm.wip_counts c WHERE c.owner_id=owner AND c.snapshot_id=selected_snapshot;
    RETURN jsonb_build_object('snapshots',snapshot_list,'selected',selected_snapshot,'counts',result);
  ELSIF operation='staffing' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',s.id,'partId',s.part_id,'capturedAt',s.captured_at,'shift',s.shift,'basis',s.basis,'count',s.count,'note',s.note) ORDER BY s.captured_at DESC,s.created_at DESC),'[]'::JSONB)
      INTO result FROM (SELECT s.* FROM pm.staffing_counts s WHERE s.owner_id=owner AND s.project_id=pm_public_read.project_id ORDER BY s.captured_at DESC,s.created_at DESC LIMIT 200) s;
    RETURN result;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',s.id,'targetId',s.target_id,'targetType',s.target_type,'capturedAt',s.captured_at,'shift',s.shift,'basis',s.basis,'count',s.count,'note',s.note) ORDER BY s.captured_at DESC,s.created_at DESC),'[]'::JSONB)
      INTO result FROM (SELECT s.* FROM pm.production_staffing_counts s WHERE s.owner_id=owner AND s.project_id=pm_public_read.project_id ORDER BY s.captured_at DESC,s.created_at DESC LIMIT 500) s;
    RETURN result;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.pm_public_read(TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pm_public_read(TEXT,TEXT,TEXT) TO anon,authenticated;
NOTIFY pgrst, 'reload schema';

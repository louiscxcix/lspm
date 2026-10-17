-- Dedicated device capability; never expose a service-role key to the Mac or browser.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE TABLE pm.publisher_devices(token_hash TEXT PRIMARY KEY,owner_id UUID NOT NULL,name TEXT NOT NULL,enabled BOOLEAN NOT NULL DEFAULT true,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE pm.publisher_batches(token_hash TEXT REFERENCES pm.publisher_devices(token_hash),request_key TEXT NOT NULL,payload_hash TEXT NOT NULL,response JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(token_hash,request_key));
CREATE TABLE pm.publisher_conflicts(token_hash TEXT NOT NULL,request_key TEXT NOT NULL,table_name TEXT NOT NULL,record_id TEXT NOT NULL,incoming JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(token_hash,request_key,table_name,record_id));
REVOKE ALL ON pm.publisher_devices,pm.publisher_batches,pm.publisher_conflicts FROM PUBLIC,anon,authenticated;
ALTER TABLE pm.publisher_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm.publisher_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm.publisher_conflicts ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.pm_ingest_local_history(p_token TEXT,p_batch JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target UUID; device TEXT; batch_key TEXT; fingerprint TEXT; cached RECORD; item JSONB; row_data JSONB; prior JSONB; changed INTEGER:=0; accepted JSONB:='[]'; conflicts JSONB:='[]'; result JSONB; revision INTEGER; record_id TEXT; table_name TEXT;
BEGIN
 IF length(p_token)<32 OR length(p_token)>256 THEN RAISE EXCEPTION 'PUBLISHER_AUTH_REQUIRED'; END IF;
 device:=encode(extensions.digest(p_token,'sha256'),'hex');
 SELECT d.owner_id INTO target FROM pm.publisher_devices d WHERE d.token_hash=device AND d.enabled=true;
 IF target IS NULL THEN RAISE EXCEPTION 'PUBLISHER_AUTH_REQUIRED'; END IF;
 IF octet_length(p_batch::TEXT)>500000 OR jsonb_typeof(p_batch->'changes')<>'array' OR jsonb_array_length(p_batch->'changes')>500 THEN RAISE EXCEPTION 'INVALID_PUBLISH_BATCH'; END IF;
 batch_key:=p_batch->>'key';
 IF batch_key IS NULL OR batch_key !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'INVALID_REQUEST_KEY'; END IF;
 fingerprint:=encode(extensions.digest((p_batch->'changes')::TEXT,'sha256'),'hex');
 SELECT m.value::INTEGER INTO revision FROM pm.meta m WHERE m.owner_id=target AND m.key='revision' FOR UPDATE;
 IF revision IS NULL THEN RAISE EXCEPTION 'WORKSPACE_NOT_READY'; END IF;
 SELECT b.payload_hash,b.response INTO cached FROM pm.publisher_batches b WHERE b.token_hash=device AND b.request_key=batch_key;
 IF FOUND THEN IF cached.payload_hash<>fingerprint THEN RAISE EXCEPTION 'REQUEST_KEY_REUSED'; END IF; RETURN cached.response; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_batch->'changes') LOOP
  table_name:=item->>'table';row_data:=item->'row';record_id:=item->>'id';prior:=NULL;
  IF record_id IS NULL OR length(record_id)>500 OR jsonb_typeof(row_data)<>'object' THEN RAISE EXCEPTION 'INVALID_PUBLISH_RECORD'; END IF;
  IF table_name='sources' THEN
   IF row_data->>'id'<>record_id THEN RAISE EXCEPTION 'SOURCE_ID_MISMATCH'; END IF;
   INSERT INTO pm.sources(owner_id,id,kind,filename,mime_type,content,created_at,metadata_json) VALUES(target,record_id,row_data->>'kind',row_data->>'filename',row_data->>'mime_type',decode(row_data->>'content','base64'),row_data->>'created_at',row_data->>'metadata_json') ON CONFLICT DO NOTHING;
   IF FOUND THEN changed:=changed+1; END IF;
  ELSIF table_name='entities' THEN
   IF row_data->>'id'<>record_id OR (row_data->>'data_json')::JSONB->>'id'<>record_id OR (row_data->>'data_json')::JSONB->>'type'<>row_data->>'type' THEN RAISE EXCEPTION 'ENTITY_ID_MISMATCH'; END IF;
   SELECT e.data_json::JSONB INTO prior FROM pm.entities e WHERE e.owner_id=target AND e.id=record_id;
   IF NOT FOUND THEN
    INSERT INTO pm.entities(owner_id,id,type,data_json) VALUES(target,record_id,row_data->>'type',row_data->>'data_json');changed:=changed+1;
   ELSIF prior=(row_data->>'data_json')::JSONB THEN NULL;
   ELSIF row_data->>'type' IN ('Event','Evidence','Person','Organization') AND item->'before' IS NOT NULL AND (item->'before'->>'data_json')::JSONB=prior THEN
    UPDATE pm.entities SET data_json=row_data->>'data_json' WHERE owner_id=target AND id=record_id;changed:=changed+1;
   ELSE
    conflicts:=conflicts||jsonb_build_array(jsonb_build_object('table',table_name,'id',record_id));
    INSERT INTO pm.publisher_conflicts VALUES(device,batch_key,table_name,record_id,item,now()) ON CONFLICT DO NOTHING;CONTINUE;
   END IF;
  ELSIF table_name='relations' THEN
   IF row_data->>'id'<>record_id THEN RAISE EXCEPTION 'RELATION_ID_MISMATCH'; END IF;
   SELECT r.data_json::JSONB INTO prior FROM pm.relations r WHERE r.owner_id=target AND r.id=record_id;
   IF FOUND AND prior<>(row_data->>'data_json')::JSONB THEN
    conflicts:=conflicts||jsonb_build_array(jsonb_build_object('table',table_name,'id',record_id));
    INSERT INTO pm.publisher_conflicts VALUES(device,batch_key,table_name,record_id,item,now()) ON CONFLICT DO NOTHING;CONTINUE;
   END IF;
   INSERT INTO pm.relations(owner_id,id,type,from_id,to_id,scope_project_id,data_json) VALUES(target,record_id,row_data->>'type',row_data->>'from_id',row_data->>'to_id',row_data->>'scope_project_id',row_data->>'data_json') ON CONFLICT DO NOTHING;
   IF FOUND THEN changed:=changed+1; END IF;
  ELSIF table_name='project_memberships' THEN
   INSERT INTO pm.project_memberships(owner_id,project_id,entity_id) VALUES(target,row_data->>'project_id',row_data->>'entity_id') ON CONFLICT DO NOTHING;
   IF FOUND THEN changed:=changed+1; END IF;
  ELSE RAISE EXCEPTION 'PUBLISH_TABLE_NOT_ALLOWED';
  END IF;
  accepted:=accepted||jsonb_build_array(jsonb_build_object('table',table_name,'id',record_id));
 END LOOP;
 IF changed>0 THEN revision:=revision+1;UPDATE pm.meta SET value=revision::TEXT WHERE owner_id=target AND key='revision'; END IF;
 result:=jsonb_build_object('revision',revision,'changed',changed,'accepted',accepted,'conflicts',conflicts);
 INSERT INTO pm.publisher_batches VALUES(device,batch_key,fingerprint,result,now());
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.pm_ingest_local_history(TEXT,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pm_ingest_local_history(TEXT,JSONB) TO anon,authenticated;

CREATE FUNCTION public.pm_history_sync_status(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE target UUID;
BEGIN
 SELECT owner_id INTO target FROM pm.publisher_devices WHERE token_hash=encode(extensions.digest(p_token,'sha256'),'hex') AND enabled=true;
 IF target IS NULL THEN RAISE EXCEPTION 'PUBLISHER_AUTH_REQUIRED'; END IF;
 RETURN jsonb_build_object('revision',(SELECT value::INTEGER FROM pm.meta WHERE owner_id=target AND key='revision'),'entities',(SELECT count(*) FROM pm.entities WHERE owner_id=target),'relations',(SELECT count(*) FROM pm.relations WHERE owner_id=target),'sources',(SELECT count(*) FROM pm.sources WHERE owner_id=target),'people',(SELECT count(*) FROM pm.entities WHERE owner_id=target AND type='Person'),'events',(SELECT count(*) FROM pm.entities WHERE owner_id=target AND type='Event'),'projects',(SELECT count(*) FROM pm.projects WHERE owner_id=target),'firebaseDocuments',(SELECT count(*) FROM pm.firebase_documents d JOIN pm.firebase_exports e ON e.snapshot_hash=d.snapshot_hash WHERE e.owner_id=target AND e.status='committed'));
END $$;
REVOKE ALL ON FUNCTION public.pm_history_sync_status(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pm_history_sync_status(TEXT) TO anon,authenticated;
NOTIFY pgrst,'reload schema';

-- Pin one workspace for public viewing. Guest requests cannot pick another owner.
CREATE TABLE pm.publication (
  singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK(singleton),
  owner_id UUID NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON pm.publication FROM PUBLIC,anon,authenticated;

DO $$
DECLARE selected_owner UUID; candidates INTEGER;
BEGIN
  SELECT count(*) INTO candidates FROM (
    SELECT owner_id FROM pm.entities UNION SELECT owner_id FROM pm.projects
  ) owners;
  IF candidates > 1 THEN
    RAISE EXCEPTION 'Multiple populated workspaces exist. Select the public workspace explicitly before publication.';
  ELSIF candidates = 1 THEN
    SELECT owner_id INTO selected_owner FROM (
      SELECT owner_id FROM pm.entities UNION SELECT owner_id FROM pm.projects
    ) owners LIMIT 1;
  ELSE
    SELECT count(*) INTO candidates FROM auth.users;
    IF candidates = 1 THEN
      SELECT id INTO selected_owner FROM auth.users LIMIT 1;
    ELSE
      selected_owner := gen_random_uuid();
    END IF;
  END IF;
  INSERT INTO pm.publication(singleton,owner_id) VALUES (true,selected_owner);
  INSERT INTO pm.meta(owner_id,key,value) VALUES
    (selected_owner,'revision','0'),(selected_owner,'schema_version','4')
    ON CONFLICT(owner_id,key) DO NOTHING;
END $$;

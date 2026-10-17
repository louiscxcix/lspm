-- Additive transfer only: original Firebase records remain independently recoverable.
CREATE TABLE pm.firebase_exports (
  snapshot_hash TEXT PRIMARY KEY,
  owner_id UUID NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('staging','committed')),
  manifest JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  committed_at TIMESTAMPTZ
);
CREATE TABLE pm.firebase_documents (
  snapshot_hash TEXT NOT NULL REFERENCES pm.firebase_exports(snapshot_hash),
  path TEXT NOT NULL,
  document_json TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  PRIMARY KEY(snapshot_hash,path)
);
CREATE TABLE pm.firebase_candidates (
  snapshot_hash TEXT NOT NULL REFERENCES pm.firebase_exports(snapshot_hash),
  table_name TEXT NOT NULL,
  key_json JSONB NOT NULL,
  row_json JSONB NOT NULL,
  PRIMARY KEY(snapshot_hash,table_name,key_json)
);
CREATE TABLE pm.firebase_conflicts (
  snapshot_hash TEXT NOT NULL REFERENCES pm.firebase_exports(snapshot_hash),
  table_name TEXT NOT NULL,
  key_json JSONB NOT NULL,
  existing_row JSONB NOT NULL,
  incoming_row JSONB NOT NULL,
  PRIMARY KEY(snapshot_hash,table_name,key_json)
);
REVOKE ALL ON pm.firebase_exports,pm.firebase_documents,pm.firebase_candidates,pm.firebase_conflicts FROM PUBLIC,anon,authenticated;
ALTER TABLE pm.firebase_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm.firebase_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm.firebase_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm.firebase_conflicts ENABLE ROW LEVEL SECURITY;

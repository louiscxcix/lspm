# Local application and database backup

## Latest database: no decryption key required

`ontology-latest.sqlite` is a directly usable SQLite snapshot of the local application at revision **338**. It includes every local table: 6 project rows (including archived projects), 1,712 ontology objects, 3,922 relations, 849 retained source records, History, memberships, settings, checkpoints, ingestion records, and change history. Counts and SHA-256 are recorded in `ontology-latest.manifest.json`.

The user approved publishing retained conversations and people data to GitHub. This file is not private merely because some records carry `local_only` metadata. It must never be copied into a public Hosting build automatically.

Only four Kakao call-protocol `cdrToken` values were replaced with `[REDACTED]`. All other rows and fields were compared with the live database and preserved exactly. The four affected source metadata records describe the redaction and exported content hash; their original provenance hashes remain unchanged. The live database was not modified. SQLite was compacted and checked to ensure the removed credential bytes do not remain in unused pages.

The matching, complete local application is on [`backup/local-pm-20261016`](https://github.com/louiscxcix/lspm/tree/backup/local-pm-20261016). The separate `main` application has newer Supabase migration work; that work was not overwritten by this backup.

To run the matching local application on another computer:

```sh
git clone --branch backup/local-pm-20261016 https://github.com/louiscxcix/lspm.git
cd lspm
npm ci
snapshot_dir=$(mktemp -d)
cp backups/ontology-latest.sqlite "$snapshot_dir/ontology.sqlite"
PM_DB_PATH="$snapshot_dir/ontology.sqlite" npm start
```

Use Node.js 24 or newer. Supply service credentials separately if integrations are needed. Local `.env`, login passwords, and encryption keys are excluded. Firebase-only uploads and cloud-created projects are not part of this local database snapshot. PDF/image originals outside the local database are not bundled.

## Earlier encrypted snapshot

The repository also includes an earlier encrypted SQLite snapshot. It contains project membership, shared ontology objects and links, History with retained source messages, local production records, review/checkpoint metadata, and change history. Its decryption key is not committed.

The snapshot is **not** a public Hosting asset. Firebase-only uploads, cloud-created projects and Firebase Authentication credentials are not downloaded into this local database backup. They remain in their existing cloud services.

## Restore on another computer

1. Clone the private repository and install Node.js 24 or newer. Run `npm ci` in the checkout.
2. Obtain `lspm-github-db-backup.key` separately through a secure channel. Its original location is `/Users/louis/Desktop/lg/mex/.local-data/lspm-github-db-backup.key`. Do not commit or paste the key into a chat. Without it, this encrypted snapshot cannot be recovered.
3. Decrypt into a **new temporary directory**, not over an existing database. OpenSSL/LibreSSL must support PBKDF2:

   ```sh
   snapshot_dir=$(mktemp -d)
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
     -in backups/ontology-2026-10-16.sqlite.enc \
     -out "$snapshot_dir/ontology.sqlite" \
     -pass file:/absolute/path/to/lspm-github-db-backup.key
   shasum -a 256 "$snapshot_dir/ontology.sqlite"
   ```

4. Compare the SHA-256 with `ontology-2026-10-16.manifest.json`. Do not use the decrypted file if it differs. Check SQLite integrity before using it:

   ```sh
   node -e 'const{DatabaseSync}=require("node:sqlite");const d=new DatabaseSync(process.argv[1],{readOnly:true});console.log(d.prepare("PRAGMA integrity_check").get());d.close()' "$snapshot_dir/ontology.sqlite"
   ```

5. Start against this checked copy using `PM_DB_PATH="$snapshot_dir/ontology.sqlite" npm start`, or stop the application and install it at the app's default `../.local-data/ontology.sqlite` path **only if that path does not already exist**. Back up any existing database first. Never overwrite a newer database just to restore this snapshot.

Local `.env` keys and access-password configuration are intentionally excluded. Supply those privately. Restoring the database does not deploy Hosting, change Firebase data, or restore cloud login credentials.

# Encrypted database backup

This public repository retains only the encrypted SQLite snapshot and its checksum manifest. Plaintext database exports must stay outside Git; CI enforces this rule.

## Retained snapshot

The repository includes a checksum-verified encrypted SQLite snapshot at revision 338. It contains project membership, shared ontology objects and links, History with retained source messages, local production records, review/checkpoint metadata, and change history. Its decryption key is not committed.

The snapshot is **not** a public Hosting asset. Firebase-only uploads, cloud-created projects and Firebase Authentication credentials are not downloaded into this local database backup. They remain in their existing cloud services.

## Restore on another computer

1. Clone the repository and install Node.js 24 or newer. Run `npm ci` in the checkout.
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

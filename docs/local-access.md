# Local basic / owner access

Run the app with `node server.js` or the existing local launcher. The normal server entry point enables access control automatically.

Basic visitors receive a restricted LS graph, with only Whole Process Map and Production Map navigation. Other projects, risks, source records, private history, contact notes and editing metadata are omitted from the response. Latest Part/worker counts needed by the maps are permitted, without source filenames or notes. Viewing settings in basic mode do not write shared database settings.

Owner login opens the existing complete local application: all projects, editing, uploads, history and configured AI functions. Every private API is checked by the server before its handler executes. A cookie remembers login for up to 30 days, including server restarts. The cookie is HttpOnly and SameSite=Strict; this local server runs on loopback HTTP. A future HTTPS deployment must add Secure and re-evaluate host/origin rules.

On first startup the server generates a random password. Read it from `/Users/louis/Desktop/lg/mex/.local-data/owner-access.txt`. Use the app header's **내 전용** button to log in. Under **접속 관리 → 비밀번호 변경**, choose a password of 4–256 characters. Changing it invalidates other sessions. Logging out invalidates the current session and reloads basic mode; other open tabs reload too.

The hash, salt and session-token hashes are stored in `.local-data/access.json`, with filesystem permissions 0600. The initial-password file also uses 0600 and is cleared after a password change. Neither file is served as an asset or included in public builds. Avoid deleting `access.json`: deleting it deliberately resets the local owner credentials.

The existing DB remains in place. This implementation is local only: it does not create a Supabase project, transfer data, or alter Firebase deployment. The reusable `createServer()` factory leaves access off unless an `accessPath` is supplied, so tests and embedded callers can use isolated fixtures. The normal executable always supplies it.

Verified by `access.test.js` and `access-browser.test.js`: server rejection of unauthorized reads/writes, sanitization, failed login and throttling, persistent sessions, password change, other-session invalidation, logout, basic map switching, owner reload and mobile login layout. Existing server and browser smoke checks also pass.

# Guest Progress and project consolidation

## Access

The root URL opens the project list. Guests see LS only; selecting it opens the Production workstream, and All projects returns to the list. Whole Process, Library, private History and other projects are not offered in guest navigation. Unauthorized guest routes return to the list. Google owner access retains the full project list and existing functionality. Valid project deep links remain supported.

Initial WIP and staffing requests run concurrently and trigger one combined render. A navigation generation check discards obsolete results. Later explicit edits retain their individual refresh behavior.

Guest Progress uses the existing parser, route validation, process chips, time controls and comparison calculations. Inputs append to a per-project Map in the ProgressView instance. They are never passed to a save endpoint, never create History events, and are not written to browser storage. Reload clears these temporary observations. Published observations remain available separately as read-only baseline data. Model registration remains owner/local-only.

## Project structure

Active projects are LS and MOBIS + HELLA. TEM physical production knowledge is connected to LS using existing global object IDs. Customer campaign routes stay distinct inside the combined project; customer ownership and uncertain part assignments are not reinterpreted.

Merged source projects are archived, not deleted. Stored project aliases redirect old links and immutable cloud upload references to the destination. Shared memberships and workstreams are unioned. Project-owned objects move to the destination to preserve editability. Explicit History scopes gain the destination without changing original message content or timestamps. Existing destination assessment/schedule entries take precedence when keys overlap.

Consolidation uses a SQLite backup, a revision check, transaction and audited changes. Hosting publishes only the sanitized graph; private History is refreshed through the existing protected Firestore seed. Cloud upload documents are not overwritten.

## Verification

Regression tests cover stale revisions, idempotence, shared IDs, ownership conflicts, editable merged projects, temporary multi-upload Progress, absent save calls, route restrictions and restored normal maps. Browser tests exercise guest input and owner behavior. Published assets are compared against the live site; the private seed is verified separately and anonymous reads must be denied.

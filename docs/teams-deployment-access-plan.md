# Teams deployment and stakeholder access — plan only

Status: design. No Teams app, cloud database, identity integration, or access grant is deployed by this document.

## Decision boundary

The current PM Process Twin is a single-user Node/SQLite app bound to `127.0.0.1`. A Teams tab needs a reachable HTTPS web page; the local SQLite API cannot be shared securely by putting its URL in Teams. Teams loads a tab from the app manifest's `contentUrl` inside an iframe ([Microsoft Teams tab guide](https://learn.microsoft.com/en-us/microsoftteams/platform/tabs/how-to/create-personal-tab)).

Before implementation, the company must approve: tenant/app registration, hosting subscription and region, production-data classification and retention, whether MES/worker data may leave the current computer, and who administers access. Until then, keep the app local.

## Target architecture

Teams personal or channel tab → company-hosted HTTPS app → Microsoft Entra SSO → authorization in the API → shared database. The same authenticated web app may also open in a browser. The Teams shell is navigation and identity context, **not** the database or the permission boundary. Register the tab and API with Entra and configure Teams SSO per [Microsoft's tab registration guide](https://learn.microsoft.com/en-us/microsoftteams/platform/tabs/how-to/authentication/tab-sso-register-aad) and [manifest guide](https://learn.microsoft.com/en-us/microsoftteams/platform/tabs/how-to/authentication/tab-sso-manifest).

Proposed infrastructure, subject to IT choice: Azure App Service for the existing Node API plus frontend, Azure SQL (or IT-approved managed relational database) for shared structured data, and approved object storage for source Excel/transcripts. Local SQLite stays as development/offline data only. App Service supports Node web apps ([App Service docs](https://learn.microsoft.com/en-us/azure/app-service/)); Azure SQL offers database access controls, auditing and row-level security ([Azure SQL security](https://learn.microsoft.com/en-us/azure/azure-sql/database/secure-database?view=azuresql)). Do not copy the current SQLite file or source uploads to a tenant before a reviewed migration.

## Identity versus ontology

The ontology's `Person` describes a worker, manager, supplier contact, or stakeholder. A signed-in account is a different object. Add an `AccountLink` only after a verified match:

`Person --verified_account--> {tenantId, objectId, displayEmail, verifiedAt, verifiedBy}`

Use Entra tenant ID plus immutable user object ID for authorization; an email address is for invitation/display and may change. `reports_to`, `works_at`, RACI, worker role, and a handwritten name **never** grant access. `IMG_3907` is a handwritten organization/people note, not a verified directory roster; confirm names, departments, company emails, and employment status before linking any account.

## Access model

Store a separate `AccessGrant` record: `{principalType: user|group, principalId, projectId, workstream: production|quality|logistics|…|all, role: viewer|editor|owner, grantedBy, grantedAt, revokedAt}`. Start with project + workstream scope. Part-level scope can follow only if the real use case needs it; it complicates shared Steps and cross-Part counts.

| Role | Read | Change |
| --- | --- | --- |
| Owner | All authorized project/workstreams, access audit | Manage grants and project data |
| Editor | Granted workstream map, Parts, links, records, allowed exports | Import/edit within granted scope |
| Viewer | Granted workstream only | None |

Example: Production Viewer may see approved production routes and a filtered WIP snapshot but not commercial prices or stakeholder assessments. A Quality Editor may read shared Production Steps needed for APQP and edit Quality records; cross-workstream context must be explicitly redacted or separately granted. Shared global Library objects inherit **no** right to browse other projects. Exports, source files, search, relationship maps, history, AI extraction, and direct API calls obey the same server-side checks. A hidden tab, client-side filter, or Teams channel membership alone is not an access rule.

At each API request: validate token issuer/audience/tenant/expiry → resolve Entra user/group to grants → select only authorized project/workstream data → remove relations whose endpoints are not both visible → return filtered counts/history/export. Apply equivalent checks to mutations; reject cross-scope links and writes atomically. Test that a Production-only user cannot fetch Quality/Commercial rows even by changing a URL or API parameter. Entra app roles and group assignment can manage **entry to the app**; app-specific project/workstream grants remain in the PM database ([Entra app roles](https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-app-roles-in-apps), [enterprise app assignment](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/assign-user-or-group-access-portal)). Group assignment licensing and nested-group behavior need IT confirmation.

## Stakeholder management UX

Add **Access** as a separate subview under Stakeholders, not to Power/Influence. Search a verified company directory user or group, link to a Person after review, then choose project, workstream, and Viewer/Editor/Owner. Show an effective-access preview (“can view Production route + approved WIP; cannot view Sales/Quality”), grant provenance, expiry/review date, and revoke action. Show people without accounts as “No login linked.” Never infer rights from hierarchy or influence scores.

## Rollout

1. Confirm tenant/hosting/data policy with LG Innotek IT and obtain a small pilot group. Freeze a local backup and define which data is allowed into pilot.
2. Add server-side identity, grants, redaction, audit, and denial tests locally; build a versioned SQLite→managed-DB migration and verify counts/relationships against a staging copy.
3. Deploy staging HTTPS app and Teams tab, sign in with Entra SSO, test one owner, one Production-only viewer, one Quality editor, and one unauthorized account. Test direct API, exports, search, WIP, files, revocation, and mobile/desktop Teams.
4. After security approval, migrate only approved data, enable backups and monitoring, publish the Teams app through the tenant's controlled process, and retain a rollback path. Do not keep the local SQLite and cloud database as independent writable sources.

## Open decisions

- Which Microsoft 365 tenant, Azure subscription/region, and approved database/storage services?
- Is access per workstream enough, or must some Parts/customer programs be isolated further?
- May external supplier accounts sign in? If yes, guest/B2B policy and separate permissions are needed.
- What source documents and worker personal data may be uploaded; for how long; who can export?
- Who owns grant approval and periodic access review?

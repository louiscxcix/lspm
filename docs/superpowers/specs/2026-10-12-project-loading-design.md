# Project loading: narrow performance correction

## Approved direction

Separate project list loading from project detail loading. Reuse duplicate catalog requests without changing authentication or database permissions.

## Scope

- On the project list route, do not hydrate the last visited project merely because its ID remains in session storage.
- On a project detail route, load the requested project, not an unrelated remembered project.
- Share in-flight catalog reads and use a short-lived memory cache. Clear it on logout and after catalog mutations. Failed reads must remain retryable.
- Continue checking the requested project's access before serving its view. Do not cache protected project payloads across authentication changes.
- Keep the existing static catalog as the initial lightweight display. Firebase readiness still governs protected data and owner access.

## Alternatives

1. Recommended: route-aware loading and catalog request reuse. Small change, directly removes unnecessary reads.
2. Defer all Firebase initialization: potentially faster first visit, but substantially broader authentication and startup changes. Excluded from this correction.
3. Persist project payloads in browser storage: risks stale data and private-data retention. Excluded.

## Verification

- Regression test: loading the list with a remembered project must not read that project's payload.
- Regression test: a detail route must select its requested project.
- Regression test: simultaneous catalog reads share one request; failed reads can retry.
- Regression test: logout and catalog changes invalidate cached metadata.
- Existing password, locked-project and read-only tests must pass unchanged.
- Measure fresh list startup and real page reload separately; same-URL navigation without reload is not a valid warm-load measurement.

## Limits

This correction does not promise to remove the measured Firebase SDK initialization cost. No deployment, data publishing, schema migration, or private-record changes are included without further authorization.

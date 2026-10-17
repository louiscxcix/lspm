# Map Gemini Implementation Plan

> Execute inline using executing-plans. Existing workspace has no Git repository; do not invent commits or migrate data.

**Goal:** Readable fullscreen maps and an owner-only Gemini drawer with verified object highlights in Global, project and Production maps.

**Architecture:** Reuse current SVGs and selection sets. A shared pure context module validates questions and limits ontology scope; a drawer manages tab-only conversation. Local requests use the existing server GEMINI_API_KEY; deployed requests use Firebase AI Logic, Auth and App Check without embedding a Gemini secret.

**Tech Stack:** Vanilla JS/CSS, Node server, Firebase JS SDK, Gemini Flash.

## Constraints

- No DB writes, tool execution, inferred machine assignments or fake object IDs.
- Production context uses visible routes and direct relationships, not unrelated projects.
- History chat transcripts and rawLog are excluded; AI request sends only the approved ontology scope and recent conversation.
- Never switch billing plans or publish secrets. If provisioning requires a user action, preserve a clear disabled connection state.

## Tasks

1. Add `map-assistant.js` and unit tests: `context(scope, visibleIds)` returns non-archived entities/relations, omitting raw messages; `request` validates question/history/size; `references` accepts only existing supplied IDs. Run `node --test map-assistant.test.js` red then green.
2. Add local `/api/map-assistant`, server-side context resolution from DB, Gemini JSON response `{answer, objectIds}` with strict validation, no actions. Add `LocalAPI.mapAssistant`; retain old Copilot.
3. Add `map-assistant-view.js` shared accessible drawer, map AI controls, scope-specific tab-only conversations, loading/error/clear/close states and user-click highlight callback. Add app callbacks that expand collapsed Global groups when necessary and explain filtered-out objects instead of silently switching scope.
4. Extend fullscreen to hide secondary controls and center selected nodes at readable zoom; retain pan, zoom, Fit, Escape and normal layout on exit. Use same drawer in fullscreen and mobile.
5. Provision Firebase AI Logic using CLI provisioning, App Check with production-domain reCAPTCHA and authenticated request enforcement. Do not disable protections to make a test pass. Add cloud adapter with owner check and shared context validation.
6. Run unit/server/browser tests, desktop/mobile inspect and design detector. Build and deploy Hosting only after success; verify live cache-busted assets and anonymous private DB refusal. If Gemini backend cannot be securely configured, report exact remaining step without claiming live AI works.

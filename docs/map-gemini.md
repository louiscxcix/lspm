# Map Gemini

Global Library, project Overview and Production maps share the AI drawer and existing map selection styling. Full screen centers the selected chips (or first process chip) at a readable scale; Fit remains available for the entire graph.

Owner mode only. Sending a question shares the current ontology scope and up to ten recent messages with Gemini. Raw chat transcripts, Event and Evidence records are excluded. Responses cannot write to the database; returned highlight IDs are checked against the supplied objects. Conversations stay in tab memory.

Local requests use the server's private `GEMINI_API_KEY`. Hosting uses Firebase AI Logic with Firebase Authentication required and reCAPTCHA Enterprise App Check enforced. No Gemini secret is published. The current model is `gemini-3.8-flash`. Quota and browser verification failures leave the map usable.

Verification: pure context/response validation, server key handling, cloud/access regressions, real Chrome drawer/highlight/fullscreen tests on desktop and mobile. Synthetic test fixtures are separate from the actual database.

Design review performed inline (no independent reviewer available). Existing visual language retained. No new large-scale redesign or database migration. Pre-existing header accent finding was outside this change.

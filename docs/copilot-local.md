# Local Copilot

Copy `.env.example` to `.env` in `ontology-app`. Add your OpenAI API key to `OPENAI_API_KEY` privately in an editor. Never put keys in chat, browser code or Git. `.env` is ignored by Git and excluded from public builds.

Restart the local server and open http://127.0.0.1:4173/. Enter a project, choose Copilot, review the one-line data-sharing notice, then send a question. Sending confirms consent; no extra checkbox is required. Model defaults to `gpt-6-luna` with low reasoning effort; override `OPENAI_MODEL` with a Responses-compatible model available to your account. API usage is billed separately from ChatGPT subscriptions.

The server sends the question, up to ten recent conversation messages and the selected project's non-archived ontology records/relationships to OpenAI. Raw production logs, uploaded files, other projects and change history are excluded. The app requests `store:false`; this is not a guarantee of zero provider retention. Use only data you are authorized to share.

Answers are read-only. Referenced object IDs become detail links. Conversation stays in memory in this browser tab and is separated by project; reload clears it. No SQLite writes, report creation, tools or web search. Firebase's public snapshot does not provide this server or API access.

Limits: 4,000-character question, ten history messages, 400,000-character project context, 2,500 output tokens, 60-second timeout and one in-flight server request. Oversized context is rejected, never silently truncated. Failures leave the ontology unchanged.

Implementation reference: https://developers.openai.com/api/docs/guides/text

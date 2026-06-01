# @gemini Built-in Chat Assistant

> **Status:** documented design, not currently active. The built-in chat handles wired in `packages/chat/src/actions.ts` and `packages/chat/src/mcp/handlers.ts` today are `@chatgpt` (in-process Codex CLI subprocess). Gemini access for **agent runs** goes through the standard large language model (LLM) orchestration layer (configure under `/configuration/llm`); the `@gemini` chat-mention path described below is documented in advance and becomes live once the handle is added to `BUILT_IN_HANDLES`.

`@gemini` is designed as a built-in Cinatra chat assistant backed by the Gemini CLI. Unlike `@claude` (polling daemon) it would run in-process as a subprocess — no polling, no API key required.

---

## Prerequisites

- **Gemini CLI installed** — verify with `gemini --version`
- **Logged in via Google OAuth** — verify with `gemini auth status` (should show active session)
- **@gemini assistant registered in DB** — see Setup below
- **No `GEMINI_API_KEY` required** — uses the logged-in Google OAuth session only

---

## Setup (one-time)

Register the `@gemini` assistant user in the database:

```bash
node --env-file=.env.local --experimental-strip-types scripts/register-gemini-assistant.mts
```

This prints `GEMINI_CLIENT_ID` and `GEMINI_CLIENT_SECRET`. The credentials are not needed for in-process use — `@gemini` responds directly via a gemini subprocess rather than through OAuth polling. They are stored for potential future OAuth integration.

---

## How it works

1. User @mentions `@gemini` in `/chat`
2. `handleChatThreadSend` detects the built-in handle via `BUILT_IN_HANDLES.has("gemini")`
3. Webhook delivery is skipped — `BUILT_IN_HANDLES` guard runs before `deliverMentionWebhook`
4. `callGeminiCliAssistant` builds a prompt from the last 10 thread messages plus the new user message
5. Spawns: `gemini --output-format json --prompt "<prompt>"` (headless JSON mode required — plain `-p` hangs without a TTY)
6. Parses the JSON response and extracts the `response` field from stdout
7. Persists the reply as an assistant message in the thread with `role: "assistant"`, `authorUserId` set to the gemini assistant's DB user ID
8. Timeout: 120 seconds — the process is sent `SIGKILL` if it does not exit in time

---

## Contrast with @chatgpt

| | @gemini | @chatgpt |
|---|---|---|
| Execution model | In-process subprocess | In-process subprocess |
| CLI invocation | `gemini --output-format json --prompt` (JSON stdout) | `codex exec --output-last-message` (tmp file) |
| Requires API key | No — uses Google OAuth session | No — uses ChatGPT OAuth session |
| Webhook delivery | None — built-in handle | None — built-in handle |
| Startup | None — responds on first mention | None — responds on first mention |

Both `@gemini` and `@chatgpt` use the same in-process subprocess pattern. The key difference is output capture: `gemini -p` writes the response to stdout (captured directly), while `codex exec` writes to a temp file.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `gemini: command not found` | CLI not on PATH | Install Gemini CLI, restart dev server so the new PATH is inherited |
| `@gemini failed (exit 1): not logged in` | OAuth session expired | Run `gemini auth login` and complete Google OAuth |
| Response times out after 120s | Long or complex task | Break the question into smaller messages |
| @gemini mention gets a webhook 404 instead of a reply | `BUILT_IN_HANDLES` not updated or dev server not restarted | Check `packages/chat/src/mcp/handlers.ts` for `BUILT_IN_HANDLES`, restart dev server |
| Reply message appears but has empty content | `gemini --output-format json` exited 0 but returned empty `response` field | Run `gemini --output-format json --prompt "hello"` manually to debug; check `gemini auth status` |

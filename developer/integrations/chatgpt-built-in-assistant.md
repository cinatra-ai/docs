# @chatgpt Built-in Chat Assistant

`@chatgpt` is a built-in Cinatra chat assistant backed by the Codex CLI. Unlike `@claude` (polling daemon) it runs in-process as a subprocess — no polling, no OAuth callback required.

---

## Prerequisites

- **Codex CLI installed** — verify with `codex --version`
- **Logged in via ChatGPT OAuth** — verify with `codex login status` (should print "Logged in using ChatGPT")
- **@chatgpt assistant registered in DB** — see Setup below
- **No `OPENAI_API_KEY` required** — this uses the user's logged-in ChatGPT session only

---

## Setup (one-time)

Register the `@chatgpt` assistant user in the database:

```bash
node --env-file=.env.local --experimental-strip-types scripts/register-chatgpt-assistant.mts
```

This prints `CHATGPT_CLIENT_ID` and `CHATGPT_CLIENT_SECRET`. The credentials are not needed for in-process use — `@chatgpt` responds directly via a codex subprocess rather than through OAuth polling. They are stored for potential future OAuth integration.

---

## How it works

1. User @mentions `@chatgpt` in `/chat`
2. `handleChatThreadSend` detects the built-in handle via `BUILT_IN_HANDLES.has("chatgpt")`
3. Webhook delivery is skipped — `BUILT_IN_HANDLES` guard runs before `deliverMentionWebhook`
4. `callCodexCliAssistant` builds a prompt from the last 10 thread messages plus the new user message
5. Spawns: `codex exec --skip-git-repo-check --sandbox read-only --output-last-message <tmpfile> "<prompt>"`
6. Reads the response from the tmp file
7. Persists the reply as an assistant message in the thread with `role: "assistant"`, `authorUserId` set to the chatgpt assistant's DB user ID
8. Timeout: 120 seconds — the process is sent `SIGKILL` if it does not exit in time

---

## Contrast with @claude

| | @chatgpt | @claude |
|---|---|---|
| Execution model | In-process subprocess | External polling daemon |
| CLI invocation | `codex exec` (one-shot) | `scripts/claude-assistant-agent.mts` (long-running) |
| Requires API key | No — uses ChatGPT OAuth session | Yes — `ANTHROPIC_API_KEY` required |
| Webhook delivery | None — built-in handle | Yes — daemon polls `chat_mentions_poll` |
| Startup | None — responds on first mention | Must start daemon before mentioning |

`@claude` uses a polling daemon because Claude Code runs outside the app process and cannot be spawned as a one-shot subprocess. `@chatgpt` can use subprocess exec because `codex` supports a `exec` mode that takes a prompt, runs it, and exits.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `codex: command not found` | CLI not on PATH | Install Codex CLI, restart dev server so the new PATH is inherited |
| `@chatgpt failed (exit 1): not logged in` | OAuth session expired | Run `codex login` and follow the ChatGPT OAuth flow |
| Response times out after 120s | Long or complex task | Break the question into smaller messages |
| Sandbox permission errors | Read-only sandbox blocks file writes | Expected — `@chatgpt` is read-only by design; it cannot write files |
| @chatgpt mention gets a webhook 404 instead of a reply | `BUILT_IN_HANDLES` not updated or dev server not restarted | Check `packages/chat/src/mcp/handlers.ts` for `BUILT_IN_HANDLES`, restart dev server |
| Reply message appears but has empty content | `codex exec` exited 0 but wrote an empty file | Run `codex exec` manually to debug; check `codex login status` |

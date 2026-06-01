# WayFlow `user_envelope` contract

This page defines how the agent runtime of WayFlow (Cinatra's OAS Flow agent runtime) should forward human-in-the-loop (HITL) resume
payloads that carry artifact attachments so cinatra can de-envelope them
on the receiving side and the large language model (LLM) sees only the plain `text` field.

The **cinatra side** of the contract is implemented by the
`parseUserEnvelope` parser at `src/app/api/llm-bridge/user-envelope.ts`.
The parser pins the back-compat invariant with regression tests.

The **WayFlow side** is a Python runtime change handled by the operator
during the cutover — out-of-codebase here.

## Why this contract exists

agent-to-agent (A2A) protocol messages are text-only by design. The chat / WayFlow round-trip that
resumes a paused agent run carries the user's structured-form submission
as a JSON-stringified payload inside the `parts[].text` slot. Artifact
attachments are part of that submission shape:

```jsonc
// userResponse (resume payload, JSON-stringified into A2A parts[].text):
{
  "text": "Approved with edits to draft #4.",
  "attachments": [
    {
      "artifactId": "art_…",
      "representationRevisionId": "rep_…",
      "digest": "sha256:…",
      "mime": "application/pdf",
      "originKind": "upload"
    }
  ]
}
```

A2A is text-only, so this envelope must ride **inside** the text payload —
the model itself should still see only `"Approved with edits to draft #4."`,
not the whole envelope. The bridge route at `/api/llm-bridge` is where the
de-enveloping happens.

## The opt-in flag

The receiving bridge opts into envelope parsing via `body.user_envelope`:

| `body.user_envelope` | bridge behavior                                                       |
| -------------------- | --------------------------------------------------------------------- |
| `true`               | parse `body.user` as `{text, attachments?}`; LLM sees only `text`     |
| `false` or absent    | **byte-identical pass-through** of `body.user` — the legacy invariant |

The opt-in is the safety latch: any old caller that hasn't been updated
(and any malicious-looking JSON-shaped string the user might type)
remains untouched.

## Python operator step

The WayFlow agent runtime (`agent_loader.py`, out-of-codebase here) must
forward `body.user_envelope=true` on the bridge call when the upstream
resume payload itself parses as the envelope shape. This is the one-line
opt-in:

```python
# agent_loader.py (WayFlow side; pseudocode)
resume_text = sendTask_part.text  # the JSON-stringified envelope
bridge_body = {
    "user": resume_text,
    "user_envelope": True,  # opt into envelope parsing
    # …other bridge fields
}
```

Until WayFlow is updated, cinatra MUST behave byte-identically to the
legacy path: `body.user_envelope` absent → `body.user` flows through
verbatim, attachments must come from the top-level `body.attachments`
slot.

## Cinatra contract

| Surface                                              | What it guarantees                                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/app/api/llm-bridge/user-envelope.ts`            | `parseUserEnvelope(rawUser, enabled, topLevelAttachments?)` — opt-in JSON parse + merged cap 20 |
| `src/app/api/llm-bridge/route.ts`                    | calls `parseUserEnvelope` with `enabled = body.user_envelope === true`                          |
| `packages/agents/src/review-task-actions.ts` (lines ~270–295) | the comment block documenting the contract end-to-end                                     |

## Back-compat regression

Regression-pinned at
`src/app/api/llm-bridge/__tests__/user-envelope.test.ts`. The invariant is:

> An A2A resume payload arriving with `user_envelope` absent (= every
> WayFlow runtime that has not taken the Python opt-in step) MUST reach
> the model byte-identical to the legacy path. Any divergence is a
> regression.

## Failure modes (and the parser's fail-closed posture)

`parseUserEnvelope(_, true, _)` is strict-schema. When the caller has set
`body.user_envelope=true` and `body.user` does not parse as the envelope
shape, the parser **throws** (`UserEnvelopeParseError`) — never silently
falls back to plain text. The bridge route translates that throw to a
`400` so the WayFlow side can fix the payload rather than confusing the
model with a half-parsed envelope.

## Test references

- Back-compat invariant (every `enabled=false` case): `src/app/api/llm-bridge/__tests__/user-envelope.test.ts`
- End-to-end attachment wiring through the bridge: `src/app/api/llm-bridge/__tests__/attachments-wiring.test.ts`

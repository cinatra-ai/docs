# WayFlow `InputMessageNode` Contract & Cinatra JSON-Envelope Convention

**Status:** Accepted
**Spec reference:** [Open Agent Specification (OAS) 26.1.0 — Agent Spec Language](https://oracle.github.io/agent-spec/development/agentspec/language_spec_26_1_0.html)
**Audience:** Anyone authoring or modifying a `oas.json` flow definition with a human-in-the-loop (HITL) gate, or anyone consuming the resume payload of such a gate.

---

## 1. Spec contract (OAS 26.1.0)

The Oracle Agent Spec defines `InputMessageNode` with a deliberately narrow surface:

- **Inputs:** Derived **only** from `{{placeholder}}` references inside the `message` template. There are no free-form input declarations — you cannot list arbitrary `inputs` on an `InputMessageNode`.
- **Outputs:** **Exactly one string output**. The default name is `user_input`. The semantics are "the content of the input user message" — i.e., the spec models this as free-form chat text.
- **No multi-output / no object output:** An `InputMessageNode` that declares more than one output, or any non-string output, is rejected by `pyagentspec` at flow mount time.

This is the contract pyagentspec validates against, and it is what every WayFlow (Cinatra's OAS Flow agent runtime) built on the reference implementation enforces.

---

## 2. Cinatra convention — JSON envelope as a string

Cinatra HITL gates are richer than free-form chat text: a `review_gate` needs to communicate which suggestions were accepted and which dismissed; a `test_form_gate` needs to communicate the preview-send result. We need **structured** data on the wire.

The convention is:

1. **Wire shape:** The single `user_input` string carries `JSON.stringify(envelope)` — an opaque JSON document.
2. **Schema-of-record:** The envelope's structural schema lives in a vendor extension on the `InputMessageNode`:
   ```json
   "metadata": {
     "cinatra": {
       "inputMessageSchema": {
         "type": "object",
         "properties": { ... },
         "required": [...]
       }
     }
   }
   ```
   `pyagentspec` ignores `metadata.cinatra.*` (vendor-namespaced metadata is allowed by the spec).
3. **Renderer responsibility:** The cinatra renderer (`packages/agents/src/*-renderer.tsx`) collects structured form state in React and on submit calls `onChange({ user_input: JSON.stringify(envelope) })` (or the gate's named output).
4. **Consumer responsibility:** Every downstream node, server action, or API route that reads the resume payload **must** `JSON.parse` the string before reading sub-fields. The parsed object should be validated against the same schema (Zod, in cinatra) at the consumer boundary.
5. **Cross-link to this ADR:** `metadata.cinatra.docsRef`: relative path to this ADR (e.g. `"docs/developer/wayflow-input-message-node-contract.md"`) — used by future migration tooling to grep every gate that follows this convention.

---

## 3. Why string-not-object — the deliberate spec-stretch

OAS 26.1.0's language for `user_input` is "the content of the input user message". The reference implementation treats this as free-form chat text. Cinatra reuses the channel as a JSON envelope.

We chose this path because the alternatives were worse:

- **Multi-output `InputMessageNode`** — rejected by pyagentspec at mount; the runtime will not load the flow.
- **Object-typed `InputMessageNode` output** — same: rejected at mount.
- **A custom non-`InputMessageNode` HITL primitive** — would fork the spec and break compatibility with any future Oracle-published HITL tooling.

JSON-as-string keeps cinatra inside the spec's wire contract while letting us carry richer payloads. Schema documentation lives in `metadata.cinatra.inputMessageSchema` so a future codegen step can swap envelopes for first-class object outputs if/when the spec evolves.

---

## 4. Risk — Oracle could tighten the `user_input` clause

If a future OAS revision tightens the `user_input` semantic to "must be free-form chat content" (e.g., adds a content-shape validator that rejects strings parseable as JSON objects), **every cinatra HITL gate breaks simultaneously**. This is a real exposure.

**Mitigation strategy:**

- Treat `metadata.cinatra.inputMessageSchema` as the single source of truth for the envelope shape. Renderers and consumers both reference it — never duplicate the schema inline.
- The convention requires a build step if Oracle tightens the spec: lift `inputMessageSchema` into a future first-class object-output `InputMessageNode` (or whatever replaces it) without touching call sites.
- Keep the cross-link from each `oas.json` to this ADR (`metadata.cinatra.docsRef`) so the migration step can find every affected gate via one grep.

---

## 5. Reference implementations

The three flows in `agents/cinatra/` that follow this pattern:

| Flow | Gate node | Envelope | Renderer | Consumer |
|------|-----------|----------|----------|----------|
| `email-outreach-agent` | `setup_gate` | `{ ...formFields, userResponse: <stringified> }` | `packages/agents/src/email-drafts-review-renderer.tsx` (and peers) | `packages/agents/src/review-task-actions.ts` (`approveReviewTaskInternal` → JSON.parse `userResponse`) |
| `auditor-agent` | `review_gate` | `{ acceptedIds: string[], dismissedIds: string[] }` (stringified into `reviewResult`) | `packages/agents/src/auditor-review-renderer.tsx` | `src/app/api/auditor/apply/route.ts` (JSON.parse `reviewResult`) |
| `email-test-delivery-agent` | `test_form_gate` | `{ userResponse: string, lastSendResult: SendResult \| null }` (stringified into `testResult`) | `packages/agents/src/email-test-delivery-form-renderer.tsx` | Flow `EndNode` `mutatedData.testResult` (downstream agents JSON.parse on read) |

Each `oas.json` carries a `metadata.cinatra.docsRef: "docs/developer/wayflow-input-message-node-contract.md"` cross-link pointing at this document.

---

## 6. Author checklist — adding a new HITL gate

When adding a new cinatra HITL gate that needs structured data on the resume edge:

- [ ] The `InputMessageNode` declares **zero** free-form inputs. Inputs flow only from `{{placeholder}}` references in `message`.
- [ ] The node declares **exactly one** string output. Name it after the envelope (e.g., `reviewResult`, `testResult`) — not `user_input` — so consumers self-document.
- [ ] Add `metadata.cinatra.inputMessageSchema` describing the JSON envelope (object shape with `properties` + `required`).
- [ ] Renderer calls `onChange({ <outputName>: JSON.stringify(envelope) })` on submit.
- [ ] Consumer `JSON.parse`s the string at the boundary and validates with Zod against the same schema.
- [ ] Add this ADR to your cross-links: `metadata.cinatra.docsRef: "docs/developer/wayflow-input-message-node-contract.md"`.
- [ ] Add the new gate row to section 5 of this document.

# Cost and usage

This page is for administrators who watch what the instance is spending on large-language-model (LLM) calls and where that spend is going. It covers the cost dashboard, what usage and cost capture cover, the monthly budget, and the metric primitives that expose the same data to agents and external clients.

The cost dashboard is admin-only. Back to the [Admin Guide](README.md).

---

## The cost dashboard

The dashboard lives under the sidebar **Analytics → LLM** (`/analytics/llm`). It is gated to admins. Telemetry is logging only; the cost and usage rollups live on this Analytics dashboard.

It breaks LLM spend down three ways:

- **By provider and model** — how much each provider (and each model within it) is costing, over a 7-, 30-, or 90-day window.
- **By agent** — which agents and skills are driving cost, over the same windows.
- **By skill** — the per-skill view, so a skill that is matched into many runs is visible as a line item.

Alongside the breakdowns the dashboard shows summary cards (all-time, monthly, and weekly totals, with an event count and a count of events that have no priced cost yet), a daily time-series chart you can group by provider, agent, or model, and a recent-events log of the latest priced calls. A pricing administration page (the gear icon on the dashboard) holds the model price table that turns token counts into dollars.

---

## What capture covers

Usage is captured at LLM-call time. Whenever the platform makes a model call — through the orchestration layer, through the bridge route that agents call, or through a connector that itself calls a model — the call's token counts and metadata are recorded as a usage event. Each event carries:

- The **provider** and **model** used (including the requested vs. effective provider when routing substitutes one).
- The **operation**, and the **agent** and **skill** labels when the call came from a run, so the per-agent and per-skill breakdowns are possible.
- **Token counts**: input, output, cached-input, and reasoning-output tokens.
- The computed **cost in USD**, derived from the token counts and the model price table. A call whose model is not yet in the price table is captured with its tokens but shows as an unpriced (null-cost) event until pricing catches up — those are the "null-cost count" in the summary.

Events are de-duplicated by an idempotency key, so a retried or replayed call is not double-counted. The data persists to PostgreSQL, which is why the dashboard windows and the metric primitives return the same numbers.

### What capture does *not* cover

Capture answers "what did we spend, by provider / agent / skill." It does **not** yet attribute that spend to business outcomes — there is no ROI or conversion attribution today (linking cost to downstream results such as CRM outcomes or email-outreach reply rates). Treat the dashboard as a spend-and-usage instrument, not a return-on-investment report.

---

## The monthly budget

Cinatra holds a single monthly LLM budget configuration. Set it from the dashboard's budget form. When configured, the dashboard surfaces a budget indicator that compares the running monthly cost against the configured ceiling so the number is visible before the month closes. The budget is a monitoring aid — review it alongside the monthly summary card rather than relying on it as a hard cutoff.

You can read the current budget configuration through the `metric_cost_budget_get` primitive (below).

---

## Metric primitives

The same data the dashboard shows is exposed as MCP primitives, so the chat assistant, your own agents, and external MCP clients can pull cost and usage figures programmatically. They are read-only.

Cost:

- `metric_cost_summary` — all-time, monthly, and weekly cost totals, with event count and null-cost count.
- `metric_cost_by_provider` — cost broken down by provider and model (window: 7, 30, or 90 days; default 30).
- `metric_cost_by_agent` — cost broken down by agent and skill (same windows).
- `metric_cost_recent_events` — the most recent priced usage events (limit 1–100; default 20).
- `metric_cost_budget_get` — the current monthly budget configuration.
- `metric_cost_timeseries` — daily cost points for charting, groupable by provider, agent, or model (default 14 days, up to 366).

Usage:

- `metric_usage_events` — daily token-usage time series (input and output tokens per day; windows 7 / 30 / 90, default 30).
- `metric_usage_summary` — token usage by provider (total input, output, and call count; same windows).

These are the audited, admin-facing metric surfaces. For how primitives are exposed and authorized in general, see the [Admin Guide](README.md) and the MCP references it links.

---

## Practical guidance

- **Review weekly.** The summary cards make the weekly total the fastest signal that something changed.
- **Watch the per-agent and per-skill views after installing or enabling new capability.** A newly matched skill or a newly installed agent shows up here first.
- **Keep the price table current.** A growing null-cost count means recent calls used a model the price table does not know yet; update pricing so those events get costed.
- **Set the budget even if it is generous.** It turns the monthly card into a comparison rather than a bare number.

---

## Where to go next

- Configure the providers whose calls show up here: [LLM providers](llm-providers.md)
- The telemetry and logging surfaces that sit next to cost: [Telemetry and logging](telemetry-and-logging.md)
- Govern who can run the agents that generate this spend: [Permissions](permissions.md)
- Back to the [Admin Guide](README.md)

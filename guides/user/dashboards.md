# Dashboards

Cinatra ships a first-class dashboards platform: a drag-and-drop interactive grid backed by a shared semantic-layer query engine, persisted with a draft / published / archived lifecycle, exposed as Model Context Protocol (MCP) primitives, and audited end-to-end. The `/agents` route is the first dashboard you see — it is a real dashboard, not a static page — and you can create your own dashboards alongside it.

This document is the user-facing reference. The engineering split between `packages/sdk-dashboard` (generic, extraction-ready) and `packages/dashboards` (Cinatra glue) — and the query wire format — is covered in the [Developer Guide](../developer/README.md).

---

## `/agents` is a dashboard

The top-level **Agents** sidebar item routes to `/agents`, which mounts an interactive `<DashboardGrid>` themed to Cinatra's design tokens. The default agents dashboard ships with two widgets:

- **Top 5 recently used agents** — a bar chart of `agent_runs.count` grouped by agent name, ordered descending, limited to 5.
- **5 latest run agents** — a table of relative time since last run, grouped by agent name, ordered descending, limited to 5.

The widgets are not hard-coded; they are real queries against the `agent_runs` semantic cube. You can resize them, re-arrange them, swap them out, and add new ones — the layout persists per user, per organization.

The previous standalone installed-agents listing was retired; the `/agents` dashboard is now the single agents surface.

---

## Anatomy of a dashboard

A dashboard is a single persisted row that describes:

- An owner level and owner id (one of `User / Team / Organization / Workspace`).
- A title.
- A layout — the portlets currently placed on the grid, with `w / h / x / y` coordinates and per-portlet analysis configuration (which cube, which dimensions and measures, sort / limit, optional filters as they land in scope).
- A lifecycle status: `draft`, `published`, or `archived`.
- A visibility (today: per-user / per-org for system dashboards like the agents activity dashboard).

The portlet payload schema is versioned (`config_version`). The platform reads any historical version it has shipped support for and writes new layouts at the current version.

---

## Editing a dashboard

The grid switches between **view** and **edit** modes. Edit mode lets you:

- Drag portlets to new grid positions.
- Resize portlets by their corner handles.
- Open the **Analysis Builder** on any portlet — choose a cube, pick dimensions and measures, set the chart type (bar / line / area / table), and preview the result before saving.
- Save the dashboard. Saving runs every change through the platform's single **mutation service**: the layout, the per-portlet analysis configs, and any new revision metadata land atomically (one Postgres transaction, with the matching `audit_events` row written in the same transaction).

Save is also the gate for the visibility filter — the permission resolver runs server-side, on the persisted row, before any write commits.

---

## The draft / published / archived lifecycle

Dashboards persist a three-state lifecycle managed by the same mutation service:

- **`draft`** — the editing surface. Drafts are visible only to the dashboard's owner (and to anyone the owner has granted co-owner access to). Mutations during edit mode write through the draft revision chain so you can iterate without affecting anyone else.
- **`published`** — the version other users see. Publishing a draft snapshots its current layout as the active revision; viewers always read the latest published revision.
- **`archived`** — the dashboard is no longer reachable from the sidebar or from the marketplace-style lookups, but its data and revision history remain intact.

---

## MCP primitives

Every dashboard operation is reachable as an MCP primitive, so any MCP client connected to your instance (a chat assistant, an external automation, a CI script) can read or mutate dashboards with the same permission resolution the UI uses:

| Primitive | What it does |
|---|---|
| `dashboards_list` | Paginated, permission-filtered, status-filtered listing. |
| `dashboards_get` | A single dashboard plus its revision summaries. |
| `dashboards_create` | Create a new dashboard. |
| `dashboards_update` | Replace the layout of an existing dashboard (writes a new revision). |
| `dashboards_publish` | Promote a draft revision to `published`. |
| `dashboards_archive` | Soft-archive a published dashboard; the row stays in place with `status = "archived"`. |

All write primitives funnel through the mutation service, so there is exactly one place enforcing the visibility filter, exactly one place writing audit rows, and no `INSERT / UPDATE / DELETE` against the dashboard tables from anywhere else (a static AST regression gate enforces this).

---

## The semantic layer

The Analysis Builder does not let you write SQL. Every portlet's query is expressed against a **cube** — a named, governed view over an underlying table. The agents activity dashboard uses the built-in `agent_runs` cube. Additional cubes ship with the platform as more pages adopt the dashboards surface (cost / usage cubes for the metrics view, for example).

Cubes are governed: a cube definition specifies which dimensions and measures are exposed, which join behavior is allowed, and what filters are permitted. Users cannot read raw rows from the underlying tables through a cube; the semantic layer is the only data shape they see.

When a custom-cube proposal flow lands, admins will be able to author new cubes through a restricted intermediate representation with explicit propose / promote / reject lifecycle. Until then, cubes are platform-defined.

---

## Permissions

Each dashboard has an owner level (`user / team / organization / workspace`) and an owner id, plus a dedicated permission resolver (`resolveDashboardAccess`) that runs **inside** the mutation transaction. An unauthorized write cannot commit even if a client tries to bypass the screen. Dashboards do not currently share rows with the generic Extension Permissions backend used for agents and skill extensions — they have their own resolver — but the contract is the same: every read is permission-filtered and every write is gated by the resolver before commit.

---

## Audit trail

Every dashboard mutation writes an `audit_events` row in the same transaction as the mutation itself, with the actor identity, the dashboard id, and the operation. The trail covers create / update / publish / archive — the four operations the mutation service implements today — and a static AST regression gate rejects direct `INSERT / UPDATE / DELETE` against the dashboard tables from anywhere outside the mutation service.

---

## Where to go next

- The architecture of the dashboards subsystem: [Architecture](../../references/platform/architecture.md)
- The objects model the cubes query over: [Objects layer](../../references/platform/objects-layer.md)
- The generic permissions story dashboards share with other extensions: [Security](../../references/platform/security.md)
- The MCP surface dashboards register against: [The external MCP server](../../references/mcp/external-server.md)
- The implementation behind this page: [Dashboards platform](../../references/platform/dashboards-platform.md)

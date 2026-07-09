// LIVE hop-capture harness — drives the REAL origin/main connector code paths
// (drupal_node_get + drupal_node_update + callDrupalMcp) against the live Drupal
// (through the logging proxy) exactly as the in-admin content-editor path does.
//
// The ONLY deviation from origin/main is the inert `server-only` guard removed
// from lib/drupal-mcp-client.ts. All routing/auth/endpoint logic is verbatim.
import { registerDrupalConnector } from "./deps";
import { createDrupalPrimitiveHandlers } from "./mcp/handlers";
import { callDrupalMcp } from "./lib/drupal-mcp-client";
import { writeFileSync } from "node:fs";

const PROXY = process.env.PROXY_URL as string;      // e.g. http://localhost:8092 (-> Drupal 8082)
const BEARER = process.env.MCP_BEARER as string;    // minted mcp_tools_remote key
const NODE_ID = process.env.NODE_ID || "1";
const OUT = process.env.OUT as string;

const instance = {
  id: "site-proof",
  name: "Proof Drupal",
  siteUrl: PROXY,
  nangoConnectionId: "conn-proof",
  providerConfigKey: "cinatra-drupal",
};

// Bind the connector's host-DI seam. buildNangoBearerHeader returns the SAME
// { Authorization: "Bearer …" } shape the production Nango helper returns — here
// sourced from the locally-minted mcp_tools_remote key instead of the vault.
registerDrupalConnector({
  listMcpInstances: () => [instance],
  buildNangoBearerHeader: async () => ({ Authorization: `Bearer ${BEARER}` }),
  requireInstanceWriteAuthority: async () => {}, // #409 gate: allow (host-side in prod)
  decodeCursor: (c?: string) => (c ? Number(c) : 0),
  buildListPage: (items: unknown[], total: number, offset: number, limit: number) => ({
    items,
    total,
    nextCursor: offset + limit < total ? String(offset + limit) : undefined,
  }),
  // Unused-by-this-run stubs (present so getDrupalDeps() is fully populated).
  dispatchContentEditor: async () => "",
  listAuthorizedMcpInstances: async () => [instance],
  probeMcp: async () => "registered",
  resolveMcpServerUrl: (s: string) => s.replace(/\/+$/, "") + "/_mcp_tools",
  isPrivateUrl: () => false,
  isNangoConfigured: () => true,
  getApiStatus: async () => ({ instanceCount: 1, instances: [] }),
  saveInstance: async () => instance,
  deleteInstance: async () => {},
  listInstanceStatuses: async () => [],
} as unknown as Parameters<typeof registerDrupalConnector>[0]);

const H = createDrupalPrimitiveHandlers();
const actor = { actorType: "model", source: "agent" } as const;
const mkReq = (name: string, input: unknown) =>
  ({ primitiveName: name, input, actor, mode: "agentic" }) as never;

const out: Record<string, unknown> = {
  startedAt: new Date().toISOString(),
  proxy: PROXY,
  nodeId: NODE_ID,
  steps: {},
};
const steps = out.steps as Record<string, unknown>;

// STEP 1 — READ (content-editor STEP 1). drupal_node_get => JSON:API PRIMARY (option b).
try {
  const read = (await H.drupal_node_get(mkReq("drupal_node_get", { instanceId: instance.id, nodeId: NODE_ID }))) as Record<string, unknown>;
  steps.read = {
    ok: true,
    via: "handler drupal_node_get",
    titleBefore: read.title,
    bodyLen: typeof read.body === "string" ? read.body.length : 0,
    uuid: read.uuid,
    keys: Object.keys(read).slice(0, 16),
  };
} catch (e) {
  steps.read = { ok: false, error: String(e).slice(0, 400) };
}

// STEP 2 — WRITE (content-editor STEP 3). drupal_node_update => callDrupalMcp
// => POST /_mcp_tools tools/call name=mcp_update_content (option a, the Drupal MCP module).
const newTitle = `PROVEN via Drupal mcp_tools /_mcp_tools @ ${new Date().toISOString()}`;
try {
  const upd = await H.drupal_node_update(mkReq("drupal_node_update", { instanceId: instance.id, nodeId: NODE_ID, fields: { title: newTitle } }));
  steps.write = { ok: true, via: "handler drupal_node_update -> callDrupalMcp(mcp_update_content)", newTitle, result: upd };
} catch (e) {
  steps.write = { ok: false, via: "handler drupal_node_update -> callDrupalMcp(mcp_update_content)", newTitle, error: String(e).slice(0, 500) };
}

// STEP 3 — MCP READ fallback (option a) — direct callDrupalMcp to prove the same /_mcp_tools transport for reads.
try {
  const recent = await callDrupalMcp(instance as never, "mcp_tools_get_recent_content", { limit: 3 });
  steps.mcpRead = { ok: true, via: "callDrupalMcp(mcp_tools_get_recent_content)", sample: JSON.stringify(recent).slice(0, 300) };
} catch (e) {
  steps.mcpRead = { ok: false, error: String(e).slice(0, 300) };
}

out.finishedAt = new Date().toISOString();
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

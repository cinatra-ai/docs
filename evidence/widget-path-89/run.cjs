// LIVE PROOF, single process (no background):
//  1. Start an in-memory capturing proxy on :9911 -> real WordPress :8083.
//  2. Instantiate the REAL, UNMODIFIED connector client
//     (@cinatra-ai/wordpress-mcp-connector origin/main src/lib/wordpress-client.ts,
//      blob 54b0a6b6) with a stub host context whose Nango stub returns the real
//     WordPress Application Password.
//  3. Drive exactly what the WayFlow wordpress-content-editor agent does per
//     SKILL.md: STEP 1 readWordPressPost (wordpress_post_get) then STEP 2
//     updateWordPressPost (wordpress_post_update) with the demote-then-edit
//     (status:draft) it applies when postStatus==="publish".
//  4. Print the captured outbound wire: URL path + auth scheme + originator.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { createWordPressClient } = require("./realclient/dist/wordpress-client.cjs");

const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, "wp.env"), "utf8")
    .split("\n").filter(Boolean).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }),
);
const WP_USER = env.WP_USER, WP_APP_PW = env.WP_APP_PW, POST_ID = Number(env.WP_POST_ID);
const UPSTREAM = { host: "127.0.0.1", port: 8083 };
const PROXY_PORT = 9911;
const wire = [];
const CAPTURE = path.join(__dirname, "capture.jsonl");
fs.writeFileSync(CAPTURE, "");

function classifyAuth(h) {
  if (!h) return "<none>";
  if (h.startsWith("Basic ")) {
    let d = ""; try { d = Buffer.from(h.slice(6), "base64").toString("utf8"); } catch {}
    const u = d.split(":")[0] || "";
    return `Basic base64(${u}:<app-password redacted ${Math.max(d.length - u.length - 1, 0)} chars>)`;
  }
  return h.split(" ")[0];
}

const proxy = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const entry = {
      seq: wire.length + 1, ts: new Date().toISOString(),
      originator: "cinatra connector REST client (createWordPressClient)",
      method: req.method, url: req.url, hostHeader: req.headers.host,
      authScheme: classifyAuth(req.headers["authorization"]),
      requestBody: body.length ? body.toString("utf8").slice(0, 300) : "",
    };
    const pr = http.request(
      { host: UPSTREAM.host, port: UPSTREAM.port, method: req.method, path: req.url, headers: { ...req.headers, host: `${UPSTREAM.host}:${UPSTREAM.port}` } },
      (pres) => {
        entry.responseStatus = pres.statusCode;
        wire.push(entry);
        fs.appendFileSync(CAPTURE, JSON.stringify(entry) + "\n");
        res.writeHead(pres.statusCode, pres.headers); pres.pipe(res);
      });
    pr.on("error", (e) => { entry.responseStatus = "ERR:" + e.message; wire.push(entry); res.writeHead(502); res.end(); });
    if (body.length) pr.write(body); pr.end();
  });
});

const clientCaptures = [];
const instance = {
  id: "inst-proof", name: "Proof WP", siteUrl: `http://127.0.0.1:${PROXY_PORT}`,
  username: "instance-username-UNUSED", applicationPassword: "instance-app-pw-UNUSED",
  providerConfigKey: "wordpress-proof", connectionId: "conn-proof",
  orgId: "org-proof", runBy: "user-proof",
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};
const providers = {
  "@cinatra-ai/host:connector-config": { read: () => ({ loggingEnabled: true, instances: [instance] }), write: () => {} },
  "nango-system": {
    isNangoConfigured: () => true,
    // The host resolves the WordPress Application Password from Nango/DB — we
    // stand in for that store with the REAL app password. Everything else
    // (URL building, auth-header scheme, fetch) is the client's own code.
    getNangoCredentials: async () => ({ username: WP_USER, password: WP_APP_PW }),
    getNangoConnection: async () => null,
  },
  "@cinatra-ai/host:instance-connection-gate": { enforceInstanceConnectionUse: async () => ({ gated: true }) },
};
const ctx = {
  capabilities: { resolveProviders: (id) => (providers[id] ? [{ packageName: "host-stub", impl: providers[id] }] : []) },
  logger: { capture: async (channel, e) => { clientCaptures.push({ channel, ...e }); } },
};

(async () => {
  await new Promise((r) => proxy.listen(PROXY_PORT, "127.0.0.1", r));
  const client = createWordPressClient(ctx);
  const out = {};
  try {
    // STEP 1 (SKILL.md): wordpress_post_get -> readWordPressPost
    out.step1_read = await client.readWordPressPost({ instance, wordpressPostId: POST_ID, postType: "post" });
    // STEP 2 (SKILL.md, demote-then-edit for a published post):
    // wordpress_post_update -> updateWordPressPost
    out.step2_update = await client.updateWordPressPost({
      instance, wordpressPostId: POST_ID, postType: "post",
      fields: { title: "Edited by the in-admin assistant (live proof run)",
                content: "REWRITTEN BODY produced via the wordpress_content_editor path.",
                status: "draft" },
    });
  } catch (e) {
    out.error = String(e && e.stack || e);
  }
  proxy.close();
  console.log("\n================ RESULT (client return values) ================");
  console.log(JSON.stringify(out, null, 2));
  console.log("\n================ CLIENT SELF-CAPTURE (ctx.logger.capture — the client logging its OWN outbound endpoint) ================");
  console.log(JSON.stringify(clientCaptures, null, 2));
  console.log("\n================ CAPTURED OUTBOUND WIRE (Cinatra client -> WordPress) ================");
  for (const w of wire) {
    console.log(`#${w.seq}  ${w.method} ${w.url}`);
    console.log(`     originator : ${w.originator}`);
    console.log(`     Host header: ${w.hostHeader}`);
    console.log(`     auth       : ${w.authScheme}`);
    if (w.requestBody) console.log(`     body       : ${w.requestBody}`);
    console.log(`     response   : HTTP ${w.responseStatus}`);
  }
  console.log("\n================ ADAPTER-ENDPOINT CHECK ================");
  const adapterHits = wire.filter((w) => /mcp|rest_route=\/wp\/mcp|\/mcp\b/i.test(w.url));
  console.log(`requests whose path looks like an MCP-adapter endpoint: ${adapterHits.length}`);
  const restHits = wire.filter((w) => /rest_route=\/wp\/v2\/(posts|pages)\//.test(w.url));
  console.log(`requests to /wp/v2/(posts|pages)/<id> (WordPress core REST):    ${restHits.length}`);
})();

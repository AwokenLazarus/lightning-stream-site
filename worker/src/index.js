// lightning-stream-site's API Worker: cached JSON under /api/ for the network map and the live listings.
// Deployed with the static site as Cloudflare Pages' advanced-mode _worker.js; site/_routes.json sends it
// /api/* only, so every page is served straight from Pages' assets.
//
//   GET  /api/listings   shops, hashrate offers, VPN exits and Stream relays, read from Nostr relays,
//                        checked as the app checks them; cached in KV and refreshed in the background
//   GET  /api/graph      the latest snapshot of the public XBT Lightning channel graph (posted below)
//   GET  /api/summary    counts for the homepage
//   GET  /api/health     what the Worker has, and how old it is
//   POST /api/graph      a publisher posts a graph/1 snapshot; Authorization: Bearer <GRAPH_TOKEN>
//
// Bindings: KV namespace DATA; secret GRAPH_TOKEN; optional vars NOSTR_RELAYS (comma-separated wss://),
// HIDE_PUBKEYS (comma-separated hex Nostr keys whose events are not shown).
import { FILTERS, digest } from "./parse.js";
import { normalize, summary, LIMITS } from "./graph.js";

// The relays the app reads by default (docs/NOSTR.md; packaging defaults).
export const DEFAULT_RELAYS = ["wss://relay.lazarus-xbt.xyz", "wss://relay.kilombino.com", "wss://relay.damus.io", "wss://nos.lol"];
const FRESH_S = 60;        // listings checked within this are served as they are
const MAX_AGE_S = 3600;    // older than this, a request waits for a refresh (up to the relay timeout)
const KV_EVERY_S = 300;    // KV is rewritten when the listings change, or at most this often when they don't
const RELAY_TIMEOUT_MS = 7000;

const now = () => Math.floor(Date.now() / 1000);
function json(body, status = 200, cache = "public, max-age=60") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache, "access-control-allow-origin": "*", "x-content-type-options": "nosniff" },
  });
}

/* ---------- Nostr: one REQ per relay, until EOSE or the timeout ---------- */
async function queryRelay(url, filters, timeoutMs) {
  const started = Date.now(), events = [];
  let ws;
  try {
    const resp = await fetch(url.replace(/^wss:\/\//, "https://"), { headers: { Upgrade: "websocket", "User-Agent": "lightning-stream-site/1 (+https://lightning-stream.com/shops/)" } });
    ws = resp.webSocket;
    if (!ws) return { url, ok: false, error: `no websocket (HTTP ${resp.status})`, events, ms: Date.now() - started };
    ws.accept();
    const sub = "ls" + Math.random().toString(36).slice(2, 8);
    const done = new Promise((resolve) => {
      const t = setTimeout(() => resolve("timeout"), timeoutMs);
      ws.addEventListener("message", (m) => {
        let d; try { d = JSON.parse(typeof m.data === "string" ? m.data : ""); } catch { return; }
        if (d[0] === "EVENT" && d[1] === sub && d[2] && typeof d[2] === "object") events.push(d[2]);
        else if (d[0] === "EOSE" && d[1] === sub) { clearTimeout(t); resolve("eose"); }
        else if (d[0] === "CLOSED" && d[1] === sub) { clearTimeout(t); resolve("closed"); }
      });
      ws.addEventListener("close", () => { clearTimeout(t); resolve("closed"); });
      ws.addEventListener("error", () => { clearTimeout(t); resolve("error"); });
    });
    ws.send(JSON.stringify(["REQ", sub, ...filters]));
    const how = await done;
    try { ws.send(JSON.stringify(["CLOSE", sub])); ws.close(1000, "done"); } catch {}
    return { url, ok: how === "eose" || events.length > 0, end: how, events, ms: Date.now() - started };
  } catch (e) {
    try { ws && ws.close(); } catch {}
    return { url, ok: false, error: String(e && e.message || e).slice(0, 120), events, ms: Date.now() - started };
  }
}

/* The newest listings live in the edge cache (Cache API, per data center, free to write) and in KV (shared, but
   writes are counted): a refresh always updates the edge copy, and writes KV only when what was read changed or
   KV's copy is KV_EVERY_S old. So a map left open polls the relays at most once a minute per data center without
   a KV write a minute. `checked_at` is when the relays were last asked; `fetched_at` when they last answered. */
const EDGE_KEY = "https://edge.internal/listings/1", LOCK_KEY = "https://edge.internal/listings-lock/1";
function edge() { return typeof caches !== "undefined" && caches.default ? caches.default : null; }
async function edgeGet(key) {
  const c = edge(); if (!c) return null;
  try { const r = await c.match(new Request(key)); return r ? await r.json() : null; } catch { return null; }
}
async function edgePut(key, body, ttl) {
  const c = edge(); if (!c) return;
  try { await c.put(new Request(key), new Response(JSON.stringify(body), { headers: { "content-type": "application/json", "cache-control": `max-age=${ttl}` } })); } catch {}
}
export function checkedAt(doc) { return doc ? doc.checked_at || doc.fetched_at || 0 : 0; }
// what a refresh read, without its timings: unchanged means KV needn't be written
export function contentKey(doc) {
  return JSON.stringify([doc.shops, doc.hashrate, doc.exits, doc.relays_announced, doc.rejected, (doc.relays || []).map((r) => [r.url, r.ok, r.events])]);
}
async function store(env, doc, t) {
  await edgePut(EDGE_KEY, doc, MAX_AGE_S);
  if (!env.DATA) return;
  const kv = await env.DATA.get("listings", "json");
  if (!kv || t - checkedAt(kv) >= KV_EVERY_S || contentKey(kv) !== contentKey(doc)) await env.DATA.put("listings", JSON.stringify(doc));
}

export async function refreshListings(env) {
  const relays = (env.NOSTR_RELAYS ? env.NOSTR_RELAYS.split(",") : DEFAULT_RELAYS).map((s) => s.trim()).filter((s) => /^wss:\/\/[^\s]+$/.test(s)).slice(0, 10);
  const hide = (env.HIDE_PUBKEYS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const results = await Promise.all(relays.map((r) => queryRelay(r, FILTERS, RELAY_TIMEOUT_MS)));
  const all = [];
  for (const r of results) for (const ev of r.events) { ev._seen = [r.url]; all.push(ev); }
  const t = now();
  const d = digest(all, t, { hide });
  const doc = {
    version: "listings/1", fetched_at: t, checked_at: t,
    relays: results.map((r) => ({ url: r.url, ok: r.ok, events: r.events.length, ms: r.ms, ...(r.error ? { error: r.error } : {}) })),
    shops: d.shops, hashrate: d.hashrate, exits: d.exits, relays_announced: d.relays, rejected: d.rejected,
  };
  // Keep the last good answer when every relay failed this time.
  if (!results.some((r) => r.ok)) {
    const prev = (await edgeGet(EDGE_KEY)) || (env.DATA ? await env.DATA.get("listings", "json") : null);
    if (prev) { prev.last_error_at = t; prev.checked_at = t; await store(env, prev, t); return prev; }
  }
  await store(env, doc, t);
  return doc;
}

export async function getListings(env, ctx) {
  const t = now();
  let cached = await edgeGet(EDGE_KEY);
  if (!cached && env.DATA) cached = await env.DATA.get("listings", "json");
  const age = cached ? t - checkedAt(cached) : Infinity;
  if (cached && age < FRESH_S) return cached;
  // one refresh at a time per data center
  const lock = await edgeGet(LOCK_KEY);
  if (cached && (age < MAX_AGE_S || lock)) {
    if (!lock) { await edgePut(LOCK_KEY, { t }, 30); ctx.waitUntil(refreshListings(env)); }
    return cached;
  }
  await edgePut(LOCK_KEY, { t }, 30);
  return refreshListings(env);
}

/* ---------- the graph ---------- */
async function sha(s) { return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))); }
async function tokenOk(req, env) {
  if (!env.GRAPH_TOKEN) return false;
  const m = /^Bearer\s+(.+)$/.exec(req.headers.get("authorization") || "");
  if (!m) return false;
  const [a, b] = await Promise.all([sha(m[1].trim()), sha(env.GRAPH_TOKEN)]);
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function postGraph(req, env) {
  if (!(await tokenOk(req, env))) return json({ error: "unauthorized" }, 401, "no-store");
  const len = Number(req.headers.get("content-length") || 0);
  if (len > LIMITS.bytes) return json({ error: "too large" }, 413, "no-store");
  const text = await req.text();
  if (text.length > LIMITS.bytes) return json({ error: "too large" }, 413, "no-store");
  let g;
  try { g = normalize(JSON.parse(text), now()); } catch (e) { return json({ error: String(e.message || e) }, 400, "no-store"); }
  await env.DATA.put("graph", JSON.stringify(g));
  await env.DATA.put("graph_summary", JSON.stringify(summary(g)));
  return json({ ok: true, ...summary(g) }, 200, "no-store");
}

/* ---------- pages: served from the edge cache ----------
   Every path comes through this Worker (for the www redirect above), and a Worker's responses are not cached by
   Cloudflare on their own, so pages are kept in the edge cache here (Cache API). The key carries the deployment,
   so a new deploy is served at once and never mixed with the last one's pages. Browsers keep a page a minute and
   may show it while they check it again. Only GET/HEAD 200s are kept; anything else passes straight through. */
export const PAGE_CACHE = "public, max-age=60, s-maxage=300, stale-while-revalidate=86400";
async function page(req, env, ctx) {
  if (!env.ASSETS) return new Response("Not found", { status: 404 });
  if (req.method !== "GET" && req.method !== "HEAD") return env.ASSETS.fetch(req);
  const deploy = env.CF_PAGES_URL || env.CF_PAGES_COMMIT_SHA || "";
  const url = new URL(req.url);
  const key = new Request(`${url.origin}${url.pathname}?__deploy=${encodeURIComponent(deploy)}`, { method: "GET" });
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (cache) {
    const hit = await cache.match(key).catch(() => null);
    if (hit) { const h = new Response(hit.body, hit); h.headers.set("x-page-cache", "hit"); return req.method === "HEAD" ? new Response(null, h) : h; }
  }
  const res = await env.ASSETS.fetch(req);
  const type = res.headers.get("content-type") || "";
  if (res.status !== 200 || !type.startsWith("text/html")) return res;
  const out = new Response(res.body, res);
  out.headers.set("cache-control", PAGE_CACHE);
  out.headers.set("x-page-cache", "miss");
  if (cache && req.method === "GET") ctx.waitUntil(cache.put(key, out.clone()).catch(() => {}));
  return out;
}

/* ---------- router ---------- */
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname.replace(/\/+$/, "");
    // www.lightning-stream.com (and any www. host) goes to the bare domain, path and query kept
    if (url.hostname.startsWith("www.")) { url.hostname = url.hostname.slice(4); return Response.redirect(url.toString(), 301); }
    if (!p.startsWith("/api")) return page(req, env, ctx);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "authorization, content-type" } });
    try {
      if (p === "/api/graph" && req.method === "POST") return await postGraph(req, env);
      if (req.method !== "GET" && req.method !== "HEAD") return json({ error: "method not allowed" }, 405, "no-store");
      if (!env.DATA) return json({ error: "storage is not bound" }, 503, "no-store");
      if (p === "/api/listings") return json(await getListings(env, ctx), 200, "public, max-age=60, stale-while-revalidate=300");
      if (p === "/api/graph") {
        const g = await env.DATA.get("graph");
        return g ? new Response(g, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=120", "access-control-allow-origin": "*" } })
                 : json({ version: "graph/1", graph: null, note: "No snapshot has been published yet." }, 200, "public, max-age=60");
      }
      if (p === "/api/summary") {
        const [l, gs] = await Promise.all([getListings(env, ctx), env.DATA.get("graph_summary", "json")]);
        const fresh = (l.shops || []).filter((s) => !s.stale);
        return json({
          fetched_at: l.fetched_at,
          shops: fresh.length,
          services: fresh.reduce((n, s) => n + s.services.filter((x) => x.kind !== "app" || !s.services.some((y) => y !== x && y.name === x.name)).length, 0) + (l.hashrate || []).length,
          hashrate: (l.hashrate || []).length, exits: (l.exits || []).length, relays: (l.relays_announced || []).length,
          graph: gs,
        });
      }
      if (p === "/api/health") {
        const [l, gs] = await Promise.all([edgeGet(EDGE_KEY).then((e) => e || env.DATA.get("listings", "json")), env.DATA.get("graph_summary", "json")]);
        return json({ ok: true, listings_fetched_at: l ? l.fetched_at : null, listings_checked_at: l ? checkedAt(l) : null, relays: l ? l.relays : [], graph: gs, now: now() }, 200, "no-store");
      }
      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: "internal error" }, 500, "no-store");
    }
  },
};

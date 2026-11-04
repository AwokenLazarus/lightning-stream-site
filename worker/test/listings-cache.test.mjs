// The listings cache: fresh for 60 s from the edge copy, KV written only when the listings change or every 5 min.
import test from "node:test";
import assert from "node:assert/strict";
import { getListings, refreshListings, checkedAt, contentKey } from "../src/index.js";

function fakeEdge() {
  const m = new Map();
  return {
    m,
    async match(req) { const v = m.get(req.url); return v ? new Response(v) : undefined; },
    async put(req, res) { m.set(req.url, await res.text()); },
  };
}
function fakeKV(init) {
  const m = new Map(init ? [["listings", JSON.stringify(init)]] : []);
  return { m, puts: 0, async get(k, type) { const v = m.get(k); return v == null ? null : type === "json" ? JSON.parse(v) : v; }, async put(k, v) { this.puts++; m.set(k, v); } };
}
const doc = (t, extra = {}) => ({ version: "listings/1", fetched_at: t, checked_at: t, relays: [{ url: "wss://a.example", ok: true, events: 1, ms: 5 }], shops: [], hashrate: [], exits: [], relays_announced: [], rejected: 0, ...extra });
const nowS = () => Math.floor(Date.now() / 1000);

test("listings checked within 60 s are served without asking the relays", async () => {
  const edge = fakeEdge(); globalThis.caches = { default: edge };
  const fresh = doc(nowS() - 30);
  const kv = fakeKV(fresh);
  let asked = 0; globalThis.fetch = async () => { asked++; return new Response("no", { status: 403 }); };
  const ctx = { waitUntil() {} };
  const got = await getListings({ DATA: kv, NOSTR_RELAYS: "wss://a.example" }, ctx);
  assert.equal(got.fetched_at, fresh.fetched_at);
  assert.equal(asked, 0);
});

test("older than 60 s: served as is while one background refresh runs", async () => {
  const edge = fakeEdge(); globalThis.caches = { default: edge };
  const kv = fakeKV(doc(nowS() - 90));
  let asked = 0; globalThis.fetch = async () => { asked++; return new Response("no", { status: 403 }); };
  const waits = []; const ctx = { waitUntil(p) { waits.push(p); } };
  const env = { DATA: kv, NOSTR_RELAYS: "wss://a.example" };
  await getListings(env, ctx);
  await getListings(env, ctx); // the lock holds the second one back
  await Promise.all(waits);
  assert.equal(waits.length, 1);
  assert.equal(asked, 1);
  // every relay failed: the last good answer is kept, marked as checked now, in the edge copy
  const e = JSON.parse(edge.m.get("https://edge.internal/listings/1"));
  assert.ok(nowS() - checkedAt(e) < 5);
  assert.ok(e.last_error_at);
});

test("a refresh writes KV only when the listings changed or KV's copy is 5 min old", async () => {
  globalThis.caches = { default: fakeEdge() };
  globalThis.fetch = async () => new Response("no", { status: 403 });
  const recent = fakeKV(doc(nowS() - 100));
  await refreshListings({ DATA: recent, NOSTR_RELAYS: "wss://a.example" });
  assert.equal(recent.puts, 0, "same listings, KV copy 100 s old: no write");
  const old = fakeKV(doc(nowS() - 400));
  await refreshListings({ DATA: old, NOSTR_RELAYS: "wss://a.example" });
  assert.equal(old.puts, 1, "KV copy 400 s old: written");
});

test("contentKey ignores timings", () => {
  const a = doc(1), b = doc(2); b.relays[0].ms = 900;
  assert.equal(contentKey(a), contentKey(b));
  assert.notEqual(contentKey(a), contentKey(doc(1, { exits: [{ id: "x" }] })));
});

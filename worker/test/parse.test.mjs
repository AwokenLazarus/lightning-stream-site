// npm test (node --test worker/test/*.test.mjs): the parser and the graph checks, against real relay events
// (2026-11-02; only events that carry no network addresses are kept in the fixture), events signed here, and a
// synthetic channel graph (documentation addresses, 192.0.2.0/24).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { schnorr, secp256k1 } from "@noble/curves/secp256k1";
import { bytesToHex } from "@noble/hashes/utils";
import { digest, verifyEvent, eventId, npub, canonical, priceLabels, listingDigest, bindDigest } from "../src/parse.js";
import { normalize, summary } from "../src/graph.js";

const events = JSON.parse(readFileSync(new URL("./fixtures/events-2026-11-02.json", import.meta.url)));
const NOW = 1793584000;

// A shop signed here, as a seller's gateway signs one, with a transport tag that carries direct addresses.
function signedShop({ withAddresses = true } = {}) {
  const nsk = secp256k1.utils.randomPrivateKey(), npk = bytesToHex(schnorr.getPublicKey(nsk));
  const rsk = secp256k1.utils.randomPrivateKey(), rpk = bytesToHex(secp256k1.getPublicKey(rsk, true));
  const seller = "https://shop.example";
  const doc = { version: "listing/1", name: "Test shop", seller, receipt_key: rpk, updated: "2026-11-01",
    services: [{ name: "Files", kind: "files", path: "/", prices: { byte_msat: "1000000", per_bytes: "1000000000" }, items: [] }] };
  doc.sig = bytesToHex(secp256k1.sign(listingDigest(doc), rsk, { lowS: true }).toDERRawBytes());
  const bind = bytesToHex(secp256k1.sign(bindDigest(npk, seller), rsk, { lowS: true }).toDERRawBytes());
  const tags = [["d", seller], ["title", "Test shop"], ["t", "lightning-stream"], ["t", "files"], ["xbt402-listing", JSON.stringify(doc)], ["xbt402-bind", bind]];
  if (withAddresses) tags.push(["transport", JSON.stringify({ version: "transport/1", transport: [{ kind: "iroh", relays: ["https://relay.example/"], direct: ["192.0.2.7:4433", "198.51.100.9:4433"] }] })]);
  const ev = { pubkey: npk, created_at: NOW - 60, kind: 30402, tags, content: "" };
  ev.id = eventId(ev);
  ev.sig = bytesToHex(schnorr.sign(ev.id, nsk));
  return ev;
}

test("real listings verify as the app verifies them", () => {
  const d = digest(structuredClone(events), NOW);
  assert.equal(d.rejected, 0);
  assert.ok(d.shops.length >= 2);
  for (const s of d.shops) assert.deepEqual(s.checks, { event: true, listing: true, bind: true });
  assert.equal(d.exits.length, 1);
  assert.equal(d.exits[0].region, "SV");
});

test("a shop signed here is read, and its direct addresses never reach the output", () => {
  const d = digest([signedShop()], NOW);
  assert.equal(d.shops.length, 1);
  assert.deepEqual(d.shops[0].checks, { event: true, listing: true, bind: true });
  assert.deepEqual(d.shops[0].iroh_relays, ["relay.example"]);
  assert.ok(!/\d+\.\d+\.\d+\.\d+/.test(JSON.stringify(d)), "an address leaked");
});

test("a changed event, listing or binding is refused", () => {
  const ev = structuredClone(events[0]);
  ev.tags.find((t) => t[0] === "title")[1] = "Forged";
  assert.equal(verifyEvent(ev), false);
  assert.equal(digest([ev], NOW).shops.length, 0);
  const other = signedShop({ withAddresses: false });
  const doc = JSON.parse(other.tags.find((t) => t[0] === "xbt402-listing")[1]);
  doc.services[0].prices.byte_msat = "1"; // a cheaper price the receipt key never signed
  other.tags.find((t) => t[0] === "xbt402-listing")[1] = JSON.stringify(doc);
  other.id = eventId(other); // even re-signed by the Nostr key, the listing's own signature fails
  assert.equal(digest([other], NOW).shops[0]?.checks.listing ?? false, false);
});

test("helpers", () => {
  assert.equal(canonical({ b: 1, a: "é" }), '{"a":"\\u00e9","b":1}');
  assert.deepEqual(priceLabels({ byte_msat: "20000", per_bytes: "1048576" }), ["20 sat per MiB"]);
  // Lightning Stream Genesis: its Nostr key and the shop key in the Lightning-Stream README
  assert.equal(npub("b01a34ed28d6d1454091cdf95633db8a641ebcf178ef26ed801a5e5e4571f2aa"), "npub1kqdrfmfg6mg52sy3ehu4vv7m3fjpa0830rhjdmvqrf09u3t3724q8cwr6a");
});

test("graph snapshots are checked and stripped", () => {
  const raw = JSON.parse(readFileSync(new URL("./fixtures/describegraph-synthetic.json", import.meta.url)));
  const doc = { version: "graph/1", network: "xbt", taken_at: NOW, source: { impl: "lnd" },
    nodes: raw.nodes.map((n) => ({ id: n.pub_key, alias: n.alias, color: n.color, last_update: n.last_update, addresses: n.addresses })),
    channels: raw.edges.map((e) => ({ id: e.channel_id, a: e.node1_pub, b: e.node2_pub, sat: Number(e.capacity) })) };
  const g = normalize(doc, NOW);
  assert.equal(g.nodes.length, 60);
  assert.ok(!JSON.stringify(g).includes("192.0.2."));
  assert.equal(summary(g).channels, g.channels.length);
  assert.throws(() => normalize({ ...doc, version: "x" }, NOW));
  assert.throws(() => normalize({ ...doc, taken_at: NOW - 30 * 86400 }, NOW));
});

// Reading Lightning Stream's Nostr events, checked the way the app checks them, and turned into the small
// records the site shows. Pure functions: no network, so they run in the Worker and under Node's tests alike.
//
// What is read (from the Lightning-Stream source at 0.2.0):
//   kind 30402, t=lightning-stream           a shop's signed listing          crates/xbt-nostr/src/market.rs, docs/NOSTR.md
//   kind 30402, t=lightning-stream-hashrate  a hashmaker's hashrate offer     crates/xbt-hashlink/src/listing.rs
//   kind 30078, t=lightning-stream-vpn-exit  a VPN exit's announcement        crates/xbt-vpn/src/announce.rs
//   kind 30078, t=lightning-stream-relay     a Stream relay's announcement    crates/xbt-nostr/src/relays.rs
//
// Every event's id and BIP-340 signature are checked (NIP-01). On top of that, as the app does:
//   shops     the listing document's ECDSA signature under the receipt key it names, and the receipt key's
//             binding of the event's Nostr key to the seller;
//   hashrate  the link key's binding of the event's Nostr key, and d = the link key;
//   exits     the exit link key's Ed25519 signature over the Nostr key and the exit key.
// None of this proves who runs a shop: like the app, the site shows these listings as unvetted.
// What is never shown: addresses a listing carries for direct connections (IP addresses, ports).

import { schnorr, secp256k1 } from "@noble/curves/secp256k1";
import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, utf8ToBytes, concatBytes } from "@noble/hashes/utils";

export const KIND_CLASSIFIED = 30402;
export const KIND_APP_DATA = 30078;
export const T_SHOP = "lightning-stream";
export const T_HASH = "lightning-stream-hashrate";
export const T_EXIT = "lightning-stream-vpn-exit";
export const T_RELAY = "lightning-stream-relay";

export const FILTERS = [
  { kinds: [KIND_CLASSIFIED], "#t": [T_SHOP], limit: 200 },
  { kinds: [KIND_CLASSIFIED], "#t": [T_HASH], limit: 100 },
  { kinds: [KIND_APP_DATA], "#t": [T_EXIT], limit: 100 },
  { kinds: [KIND_APP_DATA], "#t": [T_RELAY], limit: 100 },
];
const MAX_AHEAD_S = 600;
const MAX_EVENT = 60 * 1024;
const HASH_MAX_AGE_S = 48 * 3600;       // a hashrate offer older than this is from a hashmaker that has gone
export const STALE_S = 2 * 86400;        // shops republish every six hours; two days unseen is stale
export const DROP_S = 14 * 86400;        // and two weeks unseen is dropped

// NIP-40: an event whose expiration has passed is not shown. Shops' listings carry one from 0.2.14 (a week after
// they were made, crates/xbt-nostr/src/market.rs); hashrate offers, VPN exits and relay announcements already did.
// One without the tag (an older app's) never lapses by this rule.
export function expired(ev, now) {
  const e = Number(tag(ev, "expiration"));
  return Number.isFinite(e) && e > 0 && e <= now;
}

const isHex = (s, n) => typeof s === "string" && s.length === n && /^[0-9a-f]+$/.test(s);
const tag = (ev, k) => { const t = ev.tags.find((x) => x[0] === k); return t ? t[1] : undefined; };
const tags = (ev, k) => ev.tags.filter((x) => x[0] === k).map((x) => x[1]);

/* ---------- NIP-01 ---------- */
export function eventId(ev) {
  const ser = JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]);
  return bytesToHex(sha256(utf8ToBytes(ser)));
}
export function verifyEvent(ev) {
  try {
    if (!ev || !isHex(ev.id, 64) || !isHex(ev.pubkey, 64) || !isHex(ev.sig, 128)) return false;
    if (!Array.isArray(ev.tags) || typeof ev.content !== "string" || !Number.isInteger(ev.created_at)) return false;
    if (eventId(ev) !== ev.id) return false;
    return schnorr.verify(ev.sig, ev.id, ev.pubkey);
  } catch { return false; }
}

/* ---------- xbt402's tagged hashes and canonical JSON ---------- */
function tagged(tagName, fields) {
  const t = sha256(utf8ToBytes(tagName));
  const parts = [t, t];
  for (const f of fields) {
    const len = new Uint8Array(8); new DataView(len.buffer).setBigUint64(0, BigInt(f.length), true);
    parts.push(len, f);
  }
  return sha256(concatBytes(...parts));
}
// json.dumps(obj, sort_keys=True, separators=(",", ":")) as Python writes it: ASCII only.
export function canonical(v) {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") { if (!Number.isInteger(v)) throw new Error("floats are not in listings"); return String(v); }
  if (typeof v === "string") {
    let s = '"';
    for (const ch of v) {
      const c = ch.codePointAt(0);
      if (ch === '"') s += '\\"'; else if (ch === "\\") s += "\\\\"; else if (ch === "\n") s += "\\n";
      else if (ch === "\r") s += "\\r"; else if (ch === "\t") s += "\\t"; else if (c === 8) s += "\\b"; else if (c === 12) s += "\\f";
      else if (c < 0x20 || c > 0x7e) { for (let i = 0; i < ch.length; i++) s += "\\u" + ch.charCodeAt(i).toString(16).padStart(4, "0"); }
      else s += ch;
    }
    return s + '"';
  }
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  const keys = Object.keys(v).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return "{" + keys.map((k) => canonical(k) + ":" + canonical(v[k])).join(",") + "}";
}
export function canonicalOrigin(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return `${u.protocol}//${u.host}`; // URL drops a default port itself
  } catch { return ""; }
}
function ecdsaDer(sigHex, digest, pubHex) {
  try { return secp256k1.verify(hexToBytes(sigHex), digest, hexToBytes(pubHex), { lowS: false, prehash: false, format: "der" }); }
  catch { return false; }
}
// What a receipt key signs: a listing document (without its sig), and the binding of a Nostr key to a seller.
export function listingDigest(doc) {
  const bare = { ...doc }; delete bare.sig;
  return tagged(doc.version === "listing/1" ? "xbt402/listing/1" : "xbt402/listing/0", [utf8ToBytes(canonical(bare))]);
}
export function bindDigest(nostrPubHex, seller) {
  return tagged("xbt402/nostr-bind/0", [hexToBytes(nostrPubHex), utf8ToBytes(canonicalOrigin(seller))]);
}
export function verifyListingDoc(doc) {
  if (!doc || typeof doc.sig !== "string" || !isHex(doc.receipt_key, 66)) return false;
  return ecdsaDer(doc.sig, listingDigest(doc), doc.receipt_key);
}
export function verifyShopBind(receiptKey, nostrPubHex, seller, sigHex) {
  if (!isHex(receiptKey, 66) || typeof sigHex !== "string") return false;
  return ecdsaDer(sigHex, bindDigest(nostrPubHex, seller), receiptKey);
}

/* ---------- the shop's Lightning node, from its transport document ----------
   transport/1 (crates/xbt402/src/transport.rs) is signed by the listing's receipt key like the listing, and
   each link carries node_sig: lnd's SignMessage, by the shop's own Lightning node, over
   "lightning-stream link v1\nendpoint <key>\nseller <origin>\nexpires <unix>" (crates/xbt402/src/claim.rs).
   lnd's signatures are recoverable, so the node is read from them; every live link must name the same one. */
export function transportDigest(doc) {
  const bare = { ...doc }; delete bare.sig;
  return tagged("xbt402/transport/1", [utf8ToBytes(canonical(bare))]);
}
const ZB32 = "ybndrfg8ejkmcpqxot1uwisza345h769";
function zbase32(s) {
  let acc = 0, bits = 0; const out = [];
  for (const ch of s) { const v = ZB32.indexOf(ch); if (v < 0) return null; acc = ((acc << 5) | v) & 0xffff; bits += 5; if (bits >= 8) { out.push((acc >>> (bits - 8)) & 255); bits -= 8; } }
  return Uint8Array.from(out);
}
export function recoverLndSigner(message, sigZ) {
  try {
    const sig = zbase32(sigZ || "");
    if (!sig || sig.length !== 65 || sig[0] < 27 || sig[0] > 34) return null;
    const h = sha256(sha256(concatBytes(utf8ToBytes("Lightning Signed Message:"), utf8ToBytes(message))));
    return secp256k1.Signature.fromCompact(sig.slice(1)).addRecoveryBit((sig[0] - 27) & 3).recoverPublicKey(h).toHex(true);
  } catch { return null; }
}
export function shopNode(tdoc, doc, seller, now) {
  if (!tdoc || tdoc.version !== "transport/1" || canonicalOrigin(tdoc.seller || "") !== seller || tdoc.receipt_key !== doc.receipt_key) return null;
  if (!ecdsaDer(tdoc.sig || "", transportDigest(tdoc), doc.receipt_key)) return null;
  const nodes = new Set();
  for (const l of Array.isArray(tdoc.transport) ? tdoc.transport : []) {
    if (!l || !isHex(l.endpoint_id, 64) || !(Number(l.expires) > now)) continue;
    const n = recoverLndSigner(`lightning-stream link v1\nendpoint ${l.endpoint_id}\nseller ${seller}\nexpires ${l.expires}`, l.node_sig);
    if (!n) return null;
    nodes.add(n);
  }
  return nodes.size === 1 ? [...nodes][0] : null;
}

/* ---------- names and numbers for people ---------- */
const B32 = "abcdefghijklmnopqrstuvwxyz234567";
// A shop with no web address is http://<its Nostr key, base32>.shop.invalid (docs/DIRECT-LINKS.md).
export function shopKeyOf(origin) {
  const m = /^http:\/\/([a-z2-7]{52})\.shop\.invalid$/.exec(canonicalOrigin(origin));
  if (!m) return null;
  let bits = 0, val = 0; const out = [];
  for (const ch of m[1]) { val = (val << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return out.length >= 32 ? bytesToHex(Uint8Array.from(out.slice(0, 32))) : null;
}
const BECH = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
function polymod(values) {
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]; let chk = 1;
  for (const v of values) { const b = chk >> 25; chk = ((chk & 0x1ffffff) << 5) ^ v; for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= G[i]; }
  return chk;
}
export function npub(hex) {
  const data = []; let acc = 0, bits = 0;
  for (const b of hexToBytes(hex)) { acc = (acc << 8) | b; bits += 8; while (bits >= 5) { bits -= 5; data.push((acc >> bits) & 31); } }
  if (bits) data.push((acc << (5 - bits)) & 31);
  const hrp = "npub", exp = [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)];
  const mod = polymod([...exp, ...data, 0, 0, 0, 0, 0, 0]) ^ 1;
  const chk = [0, 1, 2, 3, 4, 5].map((i) => (mod >> (5 * (5 - i))) & 31);
  return hrp + "1" + [...data, ...chk].map((d) => BECH[d]).join("");
}
function sat(msat) { const n = Number(msat) / 1000; return n >= 100 ? Math.round(n).toLocaleString("en-US") : String(Math.round(n * 1000) / 1000); }
function unit(bytes) {
  const n = Number(bytes);
  return ({ 1: "byte", 1024: "KiB", 1048576: "MiB", 1073741824: "GiB", 1000: "kB", 1000000: "MB", 1000000000: "GB" })[n] || `${n.toLocaleString("en-US")} bytes`;
}
export function priceLabels(p) {
  if (!p || typeof p !== "object") return [];
  const out = [];
  if (p.byte_msat != null) out.push(`${sat(Number(p.byte_msat))} sat per ${unit(p.per_bytes || 1)}`);
  if (p.request_msat != null && Number(p.request_msat) > 0) out.push(`${sat(p.request_msat)} sat a request`);
  if (p.second_msat != null) out.push(`${sat(p.second_msat)} sat a second`);
  if (p.per_1k_output_msat != null) out.push(`${sat(p.per_1k_output_msat)} sat per 1,000 tokens out`);
  if (p.per_1k_input_msat != null && Number(p.per_1k_input_msat) > 0) out.push(`${sat(p.per_1k_input_msat)} sat per 1,000 tokens in`);
  return out;
}
const clean = (s, n = 120) => (typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n) : "");
const host = (u) => { try { return new URL(u).host; } catch { return ""; } };

/* ---------- one record per kind ---------- */
export function readShop(ev, now) {
  if (ev.kind !== KIND_CLASSIFIED || !tags(ev, "t").includes(T_SHOP)) return null;
  let doc; try { doc = JSON.parse(tag(ev, "xbt402-listing") || ""); } catch { return null; }
  if (!doc || typeof doc !== "object") return null;
  const seller = canonicalOrigin(doc.seller || "");
  if (!seller || tag(ev, "d") !== seller) return null;
  const key = shopKeyOf(seller);
  if (key && key !== ev.pubkey) return null; // a shop named by its key is published only by that key
  const listingOk = verifyListingDoc(doc);
  const bindOk = listingOk && verifyShopBind(doc.receipt_key, ev.pubkey, seller, tag(ev, "xbt402-bind"));
  const services = (doc.version === "listing/1" ? doc.services : [{ name: doc.name, kind: doc.kind, path: "/", prices: doc.prices, items: doc.items }]) || [];
  let transport = null; try { transport = JSON.parse(tag(ev, "transport") || "null"); } catch {}
  const node = bindOk ? shopNode(transport, doc, seller, now) : null;
  const irohRelays = transport && Array.isArray(transport.transport)
    ? [...new Set(transport.transport.flatMap((t) => (Array.isArray(t.relays) ? t.relays : [])).map(host).filter(Boolean))] : [];
  return {
    type: "shop",
    id: `${ev.pubkey}:${seller}`,
    name: clean(doc.name, 80) || "Unnamed shop",
    reached: key ? "key" : "web",
    origin: key ? null : seller,
    npub: key ? npub(key) : null,
    nostr: ev.pubkey,
    receipt_key: doc.receipt_key,
    updated: clean(doc.updated, 40),
    published_at: ev.created_at,
    stale: now - ev.created_at > STALE_S,
    licence: clean(doc.licence, 160), credits: clean(doc.credits, 160),
    services: services.slice(0, 32).map((s) => ({
      name: clean(s.name, 80), kind: clean(s.kind, 16), prices: priceLabels(s.prices),
      items: Array.isArray(s.items) ? s.items.length : 0,
      titles: Array.isArray(s.items) ? s.items.slice(0, 6).map((i) => clean(i && i.title, 60)).filter(Boolean) : [],
    })),
    iroh_relays: irohRelays,
    node, node_from: node ? "its node vouches for its link" : null,
    hashrate: [], exits: [],
    checks: { event: true, listing: listingOk, bind: bindOk },
  };
}

export function readHashrate(ev, now) {
  if (ev.kind !== KIND_CLASSIFIED || !tags(ev, "t").includes(T_HASH)) return null;
  if (ev.created_at + HASH_MAX_AGE_S <= now) return null;
  const exp = Number(tag(ev, "expiration")); if (exp && exp <= now) return null;
  let h; try { h = JSON.parse(tag(ev, "xbt-hashrate") || ""); } catch { return null; }
  if (!h || !h.link || !isHex(h.link.key, 66) || tag(ev, "d") !== h.link.key) return null;
  let bindOk = false;
  try {
    const digest = sha256(concatBytes(utf8ToBytes("xbt-hashlink/nostr-bind/0"), utf8ToBytes("|"), hexToBytes(ev.pubkey)));
    bindOk = secp256k1.verify(hexToBytes(tag(ev, "xbt-hashrate-bind") || ""), digest, hexToBytes(h.link.key), { lowS: false, prehash: false, format: "compact" });
  } catch {}
  if (!bindOk) return null; // the app refuses an offer whose link key did not bind its author
  const t = h.terms || {}, c = h.capacity || {};
  return {
    type: "hashrate",
    id: `${ev.pubkey}:${h.link.key}`,
    name: clean(h.name, 80) || "Hashrate",
    algorithm: clean(h.algorithm, 16),
    hashrate_hs: Number(h.hashrateHs) || 0,
    price: `${sat(t.priceMsat || 0)} sat a slice`,
    start_slices: Number(t.startSlices) || 0,
    miners: Number(c.miners) || 0, free_miners: Number(c.freeMiners) || 0,
    proves: h.proof != null,
    pay_node: isHex(h.pay && h.pay.node, 66) ? h.pay.node : null,
    pay_origin: canonicalOrigin((h.pay && h.pay.url) || "") || null,
    shop: null,
    iroh_relays: h.link.iroh && Array.isArray(h.link.iroh.relays) ? [...new Set(h.link.iroh.relays.map(host).filter(Boolean))] : [],
    published_at: ev.created_at,
    nostr: ev.pubkey,
    checks: { event: true, bind: true },
  };
}

export function readExit(ev, now) {
  if (ev.kind !== KIND_APP_DATA || !tags(ev, "t").includes(T_EXIT)) return null;
  const exit = tag(ev, "exit"); const exp = Number(tag(ev, "expiration"));
  if (!isHex(exit, 64) || tag(ev, "d") !== `${T_EXIT}:${exit}` || !exp || exp <= now) return null;
  let sigOk = false;
  try { sigOk = ed25519.verify(hexToBytes(tag(ev, "link_sig") || ""), utf8ToBytes(`lightning-stream-vpn-exit/v1\n${ev.pubkey}\n${exit}`), hexToBytes(exit)); } catch {}
  if (!sigOk) return null;
  const region = (tag(ev, "region") || "").toUpperCase();
  const tunnel = tag(ev, "tunnel"); const shop = tunnel ? shopKeyOf(tunnel.replace(/\/vpn\/tunnel$/, "")) : null;
  return {
    type: "exit",
    id: `${ev.pubkey}:${exit}`,
    exit: exit.slice(0, 12),
    region: /^[A-Z]{2}$/.test(region) ? region : "",
    filtered: tag(ev, "kind") === "filtered",
    logs: tag(ev, "logs") === "1",
    two_hop: tag(ev, "two_hop") === "1",
    price: `${sat(Number(tag(ev, "price_msat_gb")) || 0)} sat per GB`,
    blocked_ports: tags(ev, "port").filter((p) => /^\d{1,5}$/.test(p)).slice(0, 32).map(Number),
    relay: host(tag(ev, "relay") || ""),
    shop_npub: shop ? npub(shop) : null,
    shop: null,
    published_at: ev.created_at, expires: exp,
    nostr: ev.pubkey,
    checks: { event: true, link: true },
  };
}

export function readRelay(ev, now) {
  if (ev.kind !== KIND_APP_DATA || !tags(ev, "t").includes(T_RELAY)) return null;
  const url = tag(ev, "relay"); const exp = Number(tag(ev, "expiration"));
  if (!url || !/^https:\/\/[^/]+\/?$/.test(url) || tag(ev, "d") !== `${T_RELAY}:${url}` || !exp || exp <= now) return null;
  return {
    type: "relay", id: `${ev.pubkey}:${url}`, relay: host(url), region: clean(tag(ev, "region"), 32),
    capacity_mbit: Number(tag(ev, "capacity_mbit")) || null, udp: tag(ev, "udp") === "1",
    published_at: ev.created_at, expires: exp, checks: { event: true },
  };
}

/* ---------- all of it: the newest valid event per author, kind and d ---------- */
export function digest(events, now, { hide = [] } = {}) {
  const newest = new Map();
  for (const ev of events) {
    if (!ev || hide.includes(ev.pubkey)) continue;
    if (JSON.stringify(ev).length > MAX_EVENT || ev.created_at > now + MAX_AHEAD_S || now - ev.created_at > DROP_S) continue;
    const k = `${ev.pubkey}|${ev.kind}|${tag(ev, "d") || ""}`;
    const cur = newest.get(k);
    if (cur && (cur.created_at > ev.created_at || (cur.created_at === ev.created_at && cur.id < ev.id))) { cur._seen = [...new Set([...(cur._seen || []), ...(ev._seen || [])])]; continue; }
    if (cur) ev._seen = [...new Set([...(cur._seen || []), ...(ev._seen || [])])];
    newest.set(k, ev);
  }
  const out = { shops: [], hashrate: [], exits: [], relays: [], rejected: 0, expired: 0 };
  for (const ev of newest.values()) {
    if (!verifyEvent(ev)) { out.rejected++; continue; }
    // the newest event of each author, kind and d has lapsed: the listing is gone, and an older one is not shown instead
    if (expired(ev, now)) { out.expired++; continue; }
    const rec = readShop(ev, now) || readHashrate(ev, now) || readExit(ev, now) || readRelay(ev, now);
    if (!rec) { out.rejected++; continue; }
    rec.seen_on = (ev._seen || []).map((u) => u.replace(/^wss:\/\//, "").replace(/\/$/, ""));
    ({ shop: out.shops, hashrate: out.hashrate, exit: out.exits, relay: out.relays })[rec.type].push(rec);
  }
  // what each shop sells beyond its listing: hashrate offers paid at the shop's origin, VPN exits its key runs
  for (const h of out.hashrate) {
    const s = out.shops.find((x) => !x.stale && x.origin && x.origin === h.pay_origin) || out.shops.find((x) => x.origin && x.origin === h.pay_origin);
    if (!s) continue;
    h.shop = s.id; s.hashrate.push(h.id);
    if (!s.node && h.pay_node) { s.node = h.pay_node; s.node_from = "named by its hashrate offer"; }
  }
  for (const x of out.exits) {
    const s = x.shop_npub && out.shops.find((y) => y.npub === x.shop_npub);
    if (s) { x.shop = s.id; s.exits.push(x.id); }
  }
  // a shop whose newer listing names the same receipt key and seller wins; order: fresh first, then newest
  const byFresh = (a, b) => ((a.stale ? 1 : 0) - (b.stale ? 1 : 0)) || (b.published_at - a.published_at);
  out.shops.sort(byFresh); out.hashrate.sort(byFresh); out.exits.sort(byFresh); out.relays.sort(byFresh);
  return out;
}

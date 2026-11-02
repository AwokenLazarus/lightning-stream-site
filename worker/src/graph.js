// The public XBT Lightning channel graph, as a publisher posts it (scripts/publish_graph.py) and as the
// map page reads it. The Worker keeps only public gossip fields, and drops node addresses entirely:
// the map needs who is connected to whom, not where anyone's node listens.
//
// What a publisher sends (graph/1):
//   { "version": "graph/1", "network": "xbt", "taken_at": <unix s>,
//     "source": { "impl": "lnd" | "cln", "label": "<optional, free text>" },
//     "nodes":    [ { "id": "<66 hex>", "alias": "...", "color": "#rrggbb", "last_update": <unix s> } ],
//     "channels": [ { "id": "<short channel id>", "a": "<66 hex>", "b": "<66 hex>", "sat": <capacity>, "last_update": <unix s> } ] }

export const LIMITS = { nodes: 20000, channels: 100000, bytes: 8 * 1024 * 1024 };
const HEX66 = /^0[23][0-9a-f]{64}$/;

export function normalize(input, now) {
  if (!input || typeof input !== "object") throw new Error("not a JSON object");
  if (input.version !== "graph/1") throw new Error('version must be "graph/1"');
  if (input.network !== "xbt") throw new Error('network must be "xbt"');
  const taken = Number(input.taken_at);
  if (!Number.isInteger(taken) || taken > now + 600 || taken < now - 7 * 86400) throw new Error("taken_at must be a recent unix time in seconds");
  if (!Array.isArray(input.nodes) || !Array.isArray(input.channels)) throw new Error("nodes and channels must be arrays");
  if (input.nodes.length > LIMITS.nodes || input.channels.length > LIMITS.channels) throw new Error("too many nodes or channels");
  const nodes = new Map();
  for (const n of input.nodes) {
    if (!n || !HEX66.test(n.id)) continue;
    nodes.set(n.id, {
      id: n.id,
      alias: typeof n.alias === "string" ? n.alias.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 48) : "",
      color: typeof n.color === "string" && /^#[0-9a-f]{6}$/i.test(n.color) ? n.color.toLowerCase() : "",
      last_update: Number.isInteger(n.last_update) ? n.last_update : 0,
    });
  }
  const seen = new Set(), channels = [];
  for (const c of input.channels) {
    if (!c || !HEX66.test(c.a) || !HEX66.test(c.b) || c.a === c.b) continue;
    const sat = Number(c.sat);
    if (!Number.isFinite(sat) || sat <= 0 || sat > 21e14) continue;
    const [a, b] = c.a < c.b ? [c.a, c.b] : [c.b, c.a];
    for (const id of [a, b]) if (!nodes.has(id)) nodes.set(id, { id, alias: "", color: "", last_update: 0 });
    const id = typeof c.id === "string" && /^[0-9x:]{1,32}$/.test(c.id) ? c.id : "";
    if (id) { if (seen.has(id)) continue; seen.add(id); }
    channels.push({ id, a, b, sat: Math.round(sat), last_update: Number.isInteger(c.last_update) ? c.last_update : 0 });
  }
  const src = input.source && typeof input.source === "object" ? input.source : {};
  return {
    version: "graph/1", network: "xbt", taken_at: taken, received_at: now,
    source: { impl: ["lnd", "cln"].includes(src.impl) ? src.impl : "", label: typeof src.label === "string" ? src.label.slice(0, 60) : "" },
    nodes: [...nodes.values()], channels,
  };
}

export function summary(g) {
  if (!g) return null;
  const deg = new Map();
  let cap = 0;
  for (const c of g.channels) { cap += c.sat; deg.set(c.a, (deg.get(c.a) || 0) + 1); deg.set(c.b, (deg.get(c.b) || 0) + 1); }
  return { nodes: g.nodes.length, channels: g.channels.length, capacity_sat: cap, taken_at: g.taken_at, received_at: g.received_at, with_channels: deg.size };
}

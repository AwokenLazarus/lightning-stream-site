/* The network map: XBT Lightning's public channel graph (/api/graph), where a Lightning Stream shop is a kind of
   Lightning node: its own node, recolored and named, with small icons for what it sells around it (web apps and
   films, files, AI, hashrate, VPN exits). Data come from /api/listings:
   - a shop's node is the one that signs for its link key, or the node its hashrate offer is paid at;
   - a shop whose node is not in the public graph (a private node) is drawn at the graph's edge, marked so;
   - a Stream relay is a bridge: it carries traffic between buyer and shop without seeing it, so it sits beside the
     shops that use it, with thin dotted traffic links, and is not part of the channel graph (relays move traffic,
     not payments);
   - Nostr relays, where listings are found, are docked in a strip along the map's bottom edge (outside the channel
     graph: they carry signed listings, not traffic or payments), and listed beside the map;
   - a channel edge's rest length and width follow its capacity (summed when two nodes share several channels),
     on a clamped log scale (35 to 240 long, 0.5 to 5.8 px wide, brighter when bigger), so a few huge
     channels can't blow the layout up. The charge between nodes is weak, so these lengths shape the layout.
   The page re-reads /api/graph and /api/listings every 2 minutes while open (and when its tab is shown again),
   and updates in place: positions, zoom, pan and the selected node are kept.
   A small force layout on a 2D canvas; with prefers-reduced-motion it settles before the first frame. */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var C = { node: "#ffffff", shop: "#ffd60a", app: "#ffb648", files: "#fff09a", ai: "#b9a4ff", web: "#9fd8ff", hash: "#ff8f45", vpn: "#5fe8d2", relay: "#7fb9ff", nostr: "#c58cff", priv: "#a4a8b1" };
  var SVC = { app: "web app or films", files: "files", ai: "AI", web: "web service", hash: "hashrate", vpn: "VPN exit" };
  var cv, ctx, tip, panel, W = 0, H = 0, dpr = 1;
  var nodes = [], edges = [], byId = {}, relays = [], nostr = [];
  var cam = { x: 0, y: 0, z: 1 }, alpha = 1, hover = null, pinned = null, found = null, pulses = [], tipAt = null;
  var graphInfo = null, listInfo = null, loadedAt = 0, lastTry = 0, failedAt = 0, started = false;
  var POLL_MS = 120000, STALE_S = 45 * 60;

  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function pl(n, one, many) { return n + " " + (n === 1 ? one : many); }
  function ago(t) { var s = Math.max(0, Date.now() / 1000 - t); return s < 90 ? "just now" : s < 5400 ? Math.round(s / 60) + " min ago" : s < 172800 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " days ago"; }
  function satXbt(n) { return Math.round(n).toLocaleString("en-US") + " sat (" + (n / 1e8).toLocaleString("en-US", { maximumFractionDigits: 8 }) + " XBT)"; }
  // a channel's size on a log scale, clamped: 0 at 30k sat or less, 1 at 10 XBT or more
  function capT(sat) { return Math.max(0, Math.min(1, (Math.log10(Math.max(1, sat)) - 4.5) / (9 - 4.5))); }
  function fmtSat(n) { return n >= 1e8 ? (n / 1e8).toFixed(2) + " XBT" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M sat" : n >= 1e3 ? Math.round(n / 1e3) + "k sat" : n + " sat"; }
  function short(k) { return k ? k.slice(0, 10) + "…" + k.slice(-4) : ""; }
  function rgba(h, a) { var n = parseInt(h.slice(1), 16); return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; }
  var glowCache = {};
  function glow(col) {
    if (glowCache[col]) return glowCache[col];
    var c = document.createElement("canvas"); c.width = c.height = 64; var g = c.getContext("2d"), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, rgba(col, 0.55)); r.addColorStop(0.25, rgba(col, 0.18)); r.addColorStop(1, rgba(col, 0)); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    return (glowCache[col] = c);
  }

  /* ---------- the model ---------- */
  function addNode(id, label, info, r, priv) {
    var a = Math.random() * 6.283, d = 60 + Math.random() * 320;
    var n = { id: id, label: label, info: info, r: r, x: Math.cos(a) * d, y: Math.sin(a) * d, vx: 0, vy: 0, deg: 0, priv: !!priv, shop: null };
    nodes.push(n); byId[id] = n; return n;
  }
  function nodeFor(key, why) {
    if (key && byId["ln:" + key]) return byId["ln:" + key];
    var id = "pv:" + (key || why);
    return byId[id] || addNode(id, key ? short(key) : "", [["Lightning node", "private node: not in the public graph"], ["Key", key || "not named in the listing"]], 4, true);
  }
  // make a node a shop (or add to the shop already on it)
  function shopOn(n, name) {
    if (!n.shop) n.shop = { names: [], svc: [], lines: [], relays: [], from: "", published: 0 };
    if (name && n.shop.names.indexOf(name) < 0) n.shop.names.push(name);
    return n.shop;
  }
  function addSvc(sh, k) { if (sh.svc.indexOf(k) < 0) sh.svc.push(k); }

  function build(g, l) {
    nodes = []; edges = []; byId = {}; relays = []; nostr = []; pulses = [];
    if (g && g.nodes) {
      var deg = {}; g.channels.forEach(function (c) { deg[c.a] = (deg[c.a] || 0) + 1; deg[c.b] = (deg[c.b] || 0) + 1; });
      g.nodes.forEach(function (n) {
        if (!deg[n.id]) return;
        addNode("ln:" + n.id, n.alias || short(n.id), [["Lightning node", n.alias || "(no alias)"], ["Key", n.id], ["Channels", String(deg[n.id])]], 2.2 + Math.sqrt(deg[n.id]) * 1.5);
      });
      // one edge per pair of nodes, sized by the pair's summed capacity
      var pair = {};
      g.channels.forEach(function (c) {
        var a = byId["ln:" + c.a], b = byId["ln:" + c.b]; if (!a || !b || a === b) return;
        var k = c.a < c.b ? c.a + "|" + c.b : c.b + "|" + c.a, e = pair[k];
        if (!e) { e = pair[k] = { id: "ch:" + k, a: a, b: b, sat: 0, n: 0 }; edges.push(e); }
        e.sat += c.sat || 0; e.n++; a.deg++; b.deg++;
      });
      edges.forEach(function (e) {
        // clearly visible at a glance: 35 to 240 long; 0.5 to 5.8 px wide and faint to bright, both convex in t so the
        // many mid-sized channels stay thin and the big ones stand out
        var t = capT(e.sat); e.t = t; e.rest = 35 + 205 * t; e.lw = 0.5 + 5.3 * Math.pow(t, 1.6); e.a.pd = (e.a.pd || 0) + 1; e.b.pd = (e.b.pd || 0) + 1;
        e.info = [["Channel", e.a.label + " to " + e.b.label], ["Capacity", satXbt(e.sat)]].concat(e.n > 1 ? [["Channels", e.n + " between these two nodes, capacity summed"]] : []);
      });
    }
    if (!l) return;
    // Nostr relays: where the listings were read from
    (l.relays || []).forEach(function (r) {
      var host = r.url.replace(/^wss:\/\//, "").replace(/\/$/, ""), seen = 0;
      l.shops.forEach(function (s) { if (!s.stale && (s.seen_on || []).indexOf(host) >= 0) seen++; });
      nostr.push({ id: "nostr:" + r.url, nostr: true, label: host, ok: !!r.ok, x: 0, y: 0, shops: [], info: [["Nostr relay", r.url],
        ["Status", r.ok ? "read" : "failing: " + (r.error || "no answer")], ["Events", String(r.events || 0)], ["Answered in", (r.ms || 0) + " ms"],
        ["Shops found here", String(seen)], ["What it does", "carries the shops' signed listings; it is not part of the network: no traffic and no payments go through it"]] });
    });
    var shopNode = {}, relayUse = {};
    function useRelay(host, n) { if (!host) return; (relayUse[host] || (relayUse[host] = [])).indexOf(n) < 0 && relayUse[host].push(n); }
    l.shops.filter(function (s) { return !s.stale; }).forEach(function (s) {
      var n = nodeFor(s.node, "shop:" + s.id), sh = shopOn(n, s.name);
      shopNode[s.id] = n;
      sh.from = s.node_from || "its node is not named in the listing";
      sh.published = Math.max(sh.published, s.published_at);
      sh.reach = s.npub ? "Shop key " + s.npub : "Web address " + s.origin;
      var vpnPaths = s.exits.length;
      s.services.forEach(function (x) {
        if (x.kind === "app" && s.services.some(function (y) { return y !== x && y.name === x.name && y.kind !== "app"; })) return;
        if (x.kind === "api" && vpnPaths && /vpn/i.test(x.name)) return; // the exit's own route, shown as the exit
        var k = x.kind === "video" || x.kind === "app" ? "app" : x.kind === "api" ? "web" : x.kind === "hashrate" ? "hash" : x.kind;
        if (!C[k]) return;
        addSvc(sh, k);
        if (k !== "hash") sh.lines.push([x.name || SVC[k], x.prices.join(", ") || "price on asking"]);
      });
      s.iroh_relays.forEach(function (h) { useRelay(h, n); });
      nostr.forEach(function (r) { if ((s.seen_on || []).indexOf(r.label) >= 0 && r.shops.indexOf(n) < 0) r.shops.push(n); });
    });
    l.hashrate.forEach(function (h) {
      var n = h.shop && shopNode[h.shop] ? shopNode[h.shop] : nodeFor(h.pay_node, "hash:" + h.id), sh = shopOn(n, h.shop ? "" : h.name);
      addSvc(sh, "hash");
      sh.lines.push(["Hashrate", h.price + (h.start_slices ? ", start fee " + h.start_slices + " slices" : "") + ", " + h.free_miners + " of " + h.miners + " miners free"]);
      if (!sh.from) sh.from = "named by its hashrate offer";
      h.iroh_relays.forEach(function (x) { useRelay(x, n); });
    });
    l.exits.forEach(function (x) {
      var n = x.shop && shopNode[x.shop] ? shopNode[x.shop] : nodeFor(null, "exit:" + x.id), sh = shopOn(n, x.shop ? "" : "VPN exit" + (x.region ? " " + x.region : ""));
      addSvc(sh, "vpn");
      sh.lines.push(["VPN exit", x.price + (x.region ? ", country claimed " + x.region : "") + ", " + (x.filtered ? "filtered" : "private")]);
      useRelay(x.relay, n);
    });
    // Stream relays: the ones shops name, and the ones that announce themselves
    var announced = {}; l.relays_announced.forEach(function (r) { announced[r.relay] = r; });
    Object.keys(relayUse).concat(Object.keys(announced)).forEach(function (h) {
      if (relays.some(function (r) { return r.host === h; })) return;
      var r = announced[h];
      relays.push({ id: "relay:" + h, host: h, shops: relayUse[h] || [], x: 0, y: 0, info: [["Stream relay", h], ["What it does", "carries encrypted traffic between a buyer's app and a shop when they can't connect directly; it can't read it, and carries no money"],
        ["Used by", (relayUse[h] || []).map(function (n) { return n.shop.names.join(" / ") || n.label; }).join(", ") || "no shop named it"]].concat(r ? [["Region", r.region || "not given"]] : []) });
    });
  }
  function shopName(n) { return n.host ? n.host : n.shop ? n.shop.names.join(" / ") || n.label : n.label; }
  // the thing with this id in the current model (after a refresh, the same node, relay or channel)
  function find(id) {
    if (!id) return null;
    if (byId[id]) return byId[id];
    var all = relays.concat(nostr, edges);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  /* ---------- layout: the public graph; private shops and relays sit at its edge ---------- */
  function tick() {
    var cell = 120, grid = {}, i, j, n, m, pub = nodes.filter(function (x) { return !x.priv; });
    for (i = 0; i < pub.length; i++) { n = pub[i]; var k = Math.floor(n.x / cell) + "," + Math.floor(n.y / cell); (grid[k] || (grid[k] = [])).push(n); }
    for (i = 0; i < pub.length; i++) {
      n = pub[i]; var cx = Math.floor(n.x / cell), cy = Math.floor(n.y / cell);
      for (var dx = -2; dx <= 2; dx++) for (var dy = -2; dy <= 2; dy++) {
        var list = grid[(cx + dx) + "," + (cy + dy)]; if (!list) continue;
        for (j = 0; j < list.length; j++) {
          m = list[j]; if (m === n) continue;
          var ex = n.x - m.x, ey = n.y - m.y, d2 = ex * ex + ey * ey + 0.01;
          if (d2 > 57600) continue;
          // a weak charge, so the channels' rest lengths shape the layout, plus a hard collision so nodes don't overlap
          var f = (n.shop || m.shop ? 1400 : 160) / d2; n.vx += ex * f * alpha; n.vy += ey * f * alpha;
          var gap = n.r + m.r + (n.shop || m.shop ? 30 : 10), d = Math.sqrt(d2);
          if (d < gap) { var o = (gap - d) / d * 0.25; n.vx += ex * o; n.vy += ey * o; }
        }
      }
      n.vx -= n.x * 0.004 * alpha; n.vy -= n.y * 0.004 * alpha;
    }
    // springs toward each channel's rest length, as d3's link force does: strength 1 / sqrt(the smaller end's
    // degree), and the lighter end moves more, so a leaf sits at its channel's length from its hub and hubs stay steady
    edges.forEach(function (e) {
      var ex = e.b.x - e.a.x, ey = e.b.y - e.a.y, d = Math.sqrt(ex * ex + ey * ey) + 0.01, pa = e.a.pd || 1, pb = e.b.pd || 1;
      var f = (d - (e.rest || 50)) / d * alpha * 0.5 / Math.sqrt(Math.min(pa, pb)), bias = pa / (pa + pb);
      e.a.vx += ex * f * (1 - bias); e.a.vy += ey * f * (1 - bias); e.b.vx -= ex * f * bias; e.b.vy -= ey * f * bias;
    });
    pub.forEach(function (n) { n.vx *= 0.6; n.vy *= 0.6; n.x += Math.max(-20, Math.min(20, n.vx)); n.y += Math.max(-20, Math.min(20, n.vy)); });
    alpha *= 0.985;
    placeOutside();
  }
  function bounds(list) {
    var b = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
    list.forEach(function (n) { b.x0 = Math.min(b.x0, n.x); b.x1 = Math.max(b.x1, n.x); b.y0 = Math.min(b.y0, n.y); b.y1 = Math.max(b.y1, n.y); });
    return b;
  }
  function placeOutside() {
    var pub = nodes.filter(function (x) { return !x.priv; }), b = pub.length ? bounds(pub) : { x0: -100, y0: -100, x1: 100, y1: 100 };
    var cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    var priv = nodes.filter(function (x) { return x.priv; }), h = Math.max(200, b.y1 - b.y0);
    if (W < 600) priv.forEach(function (n, i) { n.x = cx + (i - (priv.length - 1) / 2) * 170; n.y = b.y1 + 150; });
    else priv.forEach(function (n, i) { n.x = b.x1 + 150; n.y = cy + (i - (priv.length - 1) / 2) * Math.min(150, h / Math.max(1, priv.length)); });
    // a relay sits beside the shops that use it, pushed out from the graph's center
    relays.forEach(function (r, i) {
      if (!r.shops.length) { r.x = b.x0 - 120; r.y = cy + i * 60; return; }
      var mx = 0, my = 0; r.shops.forEach(function (n) { mx += n.x; my += n.y; }); mx /= r.shops.length; my /= r.shops.length;
      var vx = mx - cx, vy = my - cy, d = Math.hypot(vx, vy) || 1;
      var R = Math.max(b.x1 - b.x0, b.y1 - b.y0) / 2;
      r.x = cx + vx / d * (R + 110); r.y = cy + vy / d * (R + 110);
    });
  }
  // Nostr relays are docked in a strip along the canvas's bottom edge, in screen space, so they stay put and
  // readable whatever the zoom: one row on a wide screen, two to a row on a phone. Returns the strip's height.
  function dock() {
    if (!nostr.length) return 0;
    var cols = W < 600 ? 2 : nostr.length, rowsN = Math.ceil(nostr.length / cols), rowH = 46, h = rowsN * rowH + 12;
    nostr.forEach(function (r, i) {
      var c = i % cols, row = Math.floor(i / cols), inRow = Math.min(cols, nostr.length - row * cols), cw = W / inRow;
      r.px = cw * (c + 0.5); r.py = H - h + 16 + row * rowH;
    });
    return h;
  }
  function fit() {
    if (!nodes.length) return;
    var strip = dock(), b = bounds(nodes.concat(relays)), padX = 110, padY = 80, h = H - strip;
    var z = Math.max(0.15, Math.min(W / (b.x1 - b.x0 + padX * 2), h / (b.y1 - b.y0 + padY * 2), 2.4));
    // centered in the part of the canvas above the strip
    cam = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 + strip / 2 / z, z: z };
  }
  function sx(x) { return (x - cam.x) * cam.z + W / 2; }
  function sy(y) { return (y - cam.y) * cam.z + H / 2; }
  function nodeR(n) { return n.shop ? 9 : Math.max(1.8, n.r * Math.min(1.6, Math.max(W < 600 ? 0.45 : 0.65, cam.z))); }

  /* ---------- drawing ---------- */
  function hexPath(x, y, r) { ctx.beginPath(); for (var i = 0; i < 6; i++) { var t = Math.PI / 6 + i * Math.PI / 3; ctx[i ? "lineTo" : "moveTo"](x + Math.cos(t) * r, y + Math.sin(t) * r); } ctx.closePath(); }
  function icon(k, x, y) {
    var col = C[k]; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.4; ctx.beginPath();
    if (k === "app") { ctx.moveTo(x - 2.5, y - 3.5); ctx.lineTo(x + 3.5, y); ctx.lineTo(x - 2.5, y + 3.5); ctx.closePath(); ctx.fill(); }
    else if (k === "files") { ctx.rect(x - 3, y - 4, 6, 8); ctx.stroke(); }
    else if (k === "ai") { ctx.moveTo(x, y - 4.5); ctx.quadraticCurveTo(x + 0.8, y - 0.8, x + 4.5, y); ctx.quadraticCurveTo(x + 0.8, y + 0.8, x, y + 4.5); ctx.quadraticCurveTo(x - 0.8, y + 0.8, x - 4.5, y); ctx.quadraticCurveTo(x - 0.8, y - 0.8, x, y - 4.5); ctx.fill(); }
    else if (k === "hash") { ctx.rect(x - 3, y - 3, 6, 6); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x - 3, y); ctx.moveTo(x + 3, y); ctx.lineTo(x + 5, y); ctx.moveTo(x, y - 5); ctx.lineTo(x, y - 3); ctx.moveTo(x, y + 3); ctx.lineTo(x, y + 5); ctx.stroke(); }
    else if (k === "vpn") { ctx.moveTo(x, y - 4.5); ctx.lineTo(x + 4, y - 2.5); ctx.quadraticCurveTo(x + 4, y + 3, x, y + 4.5); ctx.quadraticCurveTo(x - 4, y + 3, x - 4, y - 2.5); ctx.closePath(); ctx.stroke(); }
    else { ctx.arc(x, y, 3.5, 0, 7); ctx.stroke(); }
  }
  function svcSpots(n) {
    var x = sx(n.x), y = sy(n.y), k = n.shop.svc.length, r = 21, out = [];
    for (var i = 0; i < k; i++) { var a = -Math.PI / 2 + (i - (k - 1) / 2) * 0.62 - Math.PI / 2 * 0; out.push({ k: n.shop.svc[i], x: x + Math.cos(a + Math.PI) * 0 + Math.cos(a) * r, y: y + Math.sin(a) * r }); }
    return out;
  }
  function labelBox(x, y, text) { var w = ctx.measureText(text).width; return { x: x - w / 2 - 4, y: y - 2, w: w + 8, h: 17 }; }
  function hits(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    var focus = pinned || hover || found, near = {};
    if (focus && focus.id) { near[focus.id] = 1; edges.forEach(function (e) { if (e.a === focus) near[e.b.id] = 1; if (e.b === focus) near[e.a.id] = 1; }); }
    if (focus && focus.shops) focus.shops.forEach(function (n) { near[n.id] = 1; });
    if (focus && focus.a && focus.b) { near[focus.a.id] = near[focus.b.id] = 1; }
    function dimOf(n) { return focus && !near[n.id] ? 0.3 : 1; }
    ctx.lineCap = "round";
    edges.forEach(function (e) {
      var on = focus && (e === focus || e.a === focus || e.b === focus), dim = focus && !on ? 0.35 : 1, lw = e.lw * (W < 600 ? 0.75 : 1);
      ctx.beginPath(); ctx.moveTo(sx(e.a.x), sy(e.a.y)); ctx.lineTo(sx(e.b.x), sy(e.b.y));
      ctx.strokeStyle = e === focus ? "rgba(255,214,10,0.95)" : on ? "rgba(255,214,10,0.7)" : "rgba(255,255,255," + (0.05 + 0.4 * Math.pow(e.t, 1.5)) * dim + ")";
      ctx.lineWidth = e === focus ? lw + 1.4 : on ? Math.max(1.4, lw + 0.4) : lw; ctx.stroke();
    });
    // relays' traffic links: thin, dotted, blue; never part of the channel graph
    ctx.setLineDash([1.5, 5]); ctx.lineWidth = 1.3;
    relays.forEach(function (r) { r.shops.forEach(function (n) { ctx.beginPath(); ctx.moveTo(sx(r.x), sy(r.y)); ctx.lineTo(sx(n.x), sy(n.y)); ctx.strokeStyle = rgba(C.relay, focus && focus !== r && !near[n.id] ? 0.15 : 0.55); ctx.stroke(); }); });
    ctx.setLineDash([]);
    // payments streaming along channels
    if (!reduce && edges.length) {
      if (pulses.length < Math.min(14, edges.length) && Math.random() < 0.05) pulses.push({ e: edges[Math.floor(Math.random() * edges.length)], t: 0, dir: Math.random() < 0.5 });
      ctx.globalCompositeOperation = "lighter";
      pulses = pulses.filter(function (p) {
        p.t += 0.008; if (p.t >= 1) return false;
        var a = p.dir ? p.e.a : p.e.b, b = p.dir ? p.e.b : p.e.a, x = sx(a.x + (b.x - a.x) * p.t), y = sy(a.y + (b.y - a.y) * p.t);
        ctx.globalAlpha = Math.sin(p.t * Math.PI) * (focus ? 0.4 : 1); ctx.drawImage(glow(C.shop), x - 9, y - 9, 18, 18); ctx.globalAlpha = 1; return true;
      });
      ctx.globalCompositeOperation = "source-over";
    }
    // plain Lightning nodes first, then shops on top
    nodes.filter(function (n) { return !n.shop; }).concat(nodes.filter(function (n) { return n.shop; })).forEach(function (n) {
      var r = nodeR(n), x = sx(n.x), y = sy(n.y);
      if (x < -60 || y < -60 || x > W + 60 || y > H + 60) return;
      ctx.globalAlpha = dimOf(n);
      if (n.shop) {
        ctx.drawImage(glow(C.shop), x - 30, y - 30, 60, 60);
        hexPath(x, y, r); ctx.fillStyle = "#0b0a03"; ctx.fill(); ctx.strokeStyle = C.shop; ctx.lineWidth = 2; if (n.priv) ctx.setLineDash([3, 2.5]); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fillStyle = C.shop; ctx.fill();
        svcSpots(n).forEach(function (s) { ctx.beginPath(); ctx.arc(s.x, s.y, 7.5, 0, 7); ctx.fillStyle = "rgba(8,9,12,0.92)"; ctx.fill(); ctx.strokeStyle = rgba(C[s.k], 0.55); ctx.lineWidth = 1; ctx.stroke(); icon(s.k, s.x, s.y); });
      } else if (n.priv) {
        ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.strokeStyle = rgba(C.priv, 0.8); ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
      } else {
        var gr = W < 600 ? 3 : 4; ctx.drawImage(glow(C.node), x - r * gr, y - r * gr, r * gr * 2, r * gr * 2);
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = n === focus ? C.shop : "#fff"; ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
    relays.forEach(function (r) {
      var x = sx(r.x), y = sy(r.y); ctx.globalAlpha = focus && focus !== r && !r.shops.some(function (n) { return near[n.id]; }) ? 0.3 : 1;
      ctx.drawImage(glow(C.relay), x - 24, y - 24, 48, 48);
      ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fillStyle = "#08090c"; ctx.fill(); ctx.strokeStyle = C.relay; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 7); ctx.fillStyle = C.relay; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 11, -0.7, 0.7); ctx.moveTo(x - 11 * Math.cos(0.7), y - 11 * Math.sin(0.7)); ctx.arc(x, y, 11, Math.PI - 0.7, Math.PI + 0.7); ctx.strokeStyle = rgba(C.relay, 0.7); ctx.lineWidth = 1.2; ctx.stroke();
      ctx.globalAlpha = 1;
    });
    // Nostr relays: violet diamonds in a strip on the bottom edge; dashed when the last read failed
    var strip = dock();
    if (strip) {
      var bg = ctx.createLinearGradient(0, H - strip - 18, 0, H); bg.addColorStop(0, "rgba(5,5,7,0)"); bg.addColorStop(0.3, "rgba(5,5,7,0.82)"); bg.addColorStop(1, "rgba(5,5,7,0.9)");
      ctx.fillStyle = bg; ctx.fillRect(0, H - strip - 18, W, strip + 18);
    }
    nostr.forEach(function (r) {
      var x = r.px, y = r.py; ctx.globalAlpha = (focus && focus !== r ? 0.35 : 1) * (r.ok ? 1 : 0.6);
      if (r.ok) ctx.drawImage(glow(C.nostr), x - 22, y - 22, 44, 44);
      ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 8, y); ctx.lineTo(x, y + 8); ctx.lineTo(x - 8, y); ctx.closePath();
      ctx.fillStyle = "#0a0710"; ctx.fill(); ctx.strokeStyle = C.nostr; ctx.lineWidth = r === focus ? 2.4 : 1.6; if (!r.ok) ctx.setLineDash([2.5, 2.5]); ctx.stroke(); ctx.setLineDash([]);
      if (r.ok) { ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 7); ctx.fillStyle = C.nostr; ctx.fill(); }
      ctx.globalAlpha = 1;
    });

    // labels, most important first; any that would overlap a placed label or a node's icons is left out
    ctx.font = "500 12px Inter, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "top";
    var placed = [], want = [];
    nodes.forEach(function (n) {
      if (n.shop) { placed.push({ x: sx(n.x) - 28, y: sy(n.y) - 30, w: 56, h: 41, owner: n }); }
    });
    nodes.filter(function (n) { return n.shop; }).forEach(function (n) {
      var y = sy(n.y) + 13;
      want.push({ text: shopName(n), x: sx(n.x), y: y, col: C.shop, pri: 5, a: dimOf(n), bold: true, owner: n, side: 19 });
      if (n.priv) want.push({ text: "private node: not in the public graph", x: sx(n.x), y: y + 17, col: C.priv, pri: 4.9, a: dimOf(n), up: 64 });
    });
    relays.forEach(function (r) { want.push({ text: r.host, x: sx(r.x), y: sy(r.y) + 14, col: C.relay, pri: 4, a: 1, up: 28, side: 8 }); });
    nostr.forEach(function (r) { want.push({ text: r.label + (r.ok ? "" : " (failing)"), x: r.px, y: r.py + 12, col: C.nostr, pri: 9, a: r.ok ? 1 : 0.7, alt: false, strip: true }); });
    var top = nodes.filter(function (n) { return !n.priv && !n.shop; }).sort(function (a, b) { return b.deg - a.deg; }).slice(0, cam.z > 1.3 ? 40 : W < 600 ? 5 : 12);
    nodes.forEach(function (n) {
      if (n.priv || n.shop) return;
      if (top.indexOf(n) < 0 && !near[n.id]) return;
      want.push({ text: n.label, x: sx(n.x), y: sy(n.y) + nodeR(n) + 5, col: "rgba(255,255,255,0.78)", pri: near[n.id] ? 3 : 1 + n.deg / 1000, a: dimOf(n) });
    });
    want.sort(function (a, b) { return b.pri - a.pri; });
    var stripDone = false;
    want.forEach(function (w) {
      // once the strip's own labels are placed, nothing else may be labeled inside it
      if (!w.strip && !stripDone) { stripDone = true; if (strip) placed.push({ x: 0, y: H - strip - 6, w: W, h: strip + 6 }); }
      ctx.font = (w.bold ? "650 " : "500 ") + "12px Inter, system-ui, sans-serif";
      // below first, then above, right and left of the thing it names; left out only when none is free
      var tw = ctx.measureText(w.text).width, down = w.y, tries = w.alt === false ? [[0, 0]] : [[0, 0], [tw / 2 + 16, -(w.side || 20)], [-tw / 2 - 16, -(w.side || 20)], [0, -(w.up || 30) - 17]];
      for (var i = 0; i < tries.length; i++) {
        var x = w.x + tries[i][0], y = down + tries[i][1], box = labelBox(x, y, w.text);
        if (box.x < 2 || box.x + box.w > W - 2 || box.y < 2 || box.y + box.h > H - 2) continue;
        if (placed.some(function (p) { return (!p.owner || p.owner !== w.owner || i === 0) && hits(p, box); })) continue;
        placed.push(box);
        ctx.globalAlpha = w.a; ctx.fillStyle = "rgba(5,5,7,0.8)"; ctx.fillRect(box.x, box.y, box.w, box.h);
        ctx.fillStyle = w.col; ctx.fillText(w.text, x, y); ctx.globalAlpha = 1;
        return;
      }
    });
  }

  function loop() {
    if (alpha > 0.02) for (var i = 0; i < 2; i++) tick();
    if (!document.hidden) draw();
    requestAnimationFrame(loop);
  }
  function redraw() { if (reduce) draw(); }
  function resize() {
    var r = cv.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 2); W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); redraw();
  }

  /* ---------- interaction ---------- */
  function at(px, py) {
    var best = null, bd = 18 * 18;
    nodes.forEach(function (n) { if (!n.shop) return; var dx = sx(n.x) - px, dy = sy(n.y) - py, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = n; } });
    relays.forEach(function (r) { var dx = sx(r.x) - px, dy = sy(r.y) - py, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = r; } });
    nostr.forEach(function (r) { var dx = r.px - px, dy = r.py - py, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = r; } });
    if (best) return best;
    bd = 14 * 14;
    nodes.forEach(function (n) { var dx = sx(n.x) - px, dy = sy(n.y) - py, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = n; } });
    if (best) return best;
    // a channel: the nearest edge within a few pixels
    bd = 5 * 5;
    edges.forEach(function (e) {
      var ax = sx(e.a.x), ay = sy(e.a.y), bx = sx(e.b.x) - ax, by = sy(e.b.y) - ay, L = bx * bx + by * by || 1;
      var t = Math.max(0, Math.min(1, ((px - ax) * bx + (py - ay) * by) / L)), dx = ax + bx * t - px, dy = ay + by * t - py, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = e; }
    });
    return best;
  }
  function rows(n) {
    if (!n.shop) return n.info;
    var sh = n.shop, out = [["Stream shop", shopName(n)]];
    sh.lines.forEach(function (l) { out.push(l); });
    out.push(["Lightning node", n.priv ? "private node, not in the public graph" + (n.id.indexOf("pv:0") === 0 ? " (" + short(n.id.slice(3)) + ")" : "") : n.label + " (" + short(n.id.slice(3)) + ")"]);
    out.push(["How we know", sh.from]);
    if (sh.reach) out.push(["Reach it by", sh.reach]);
    if (sh.published) out.push(["Published", ago(sh.published)]);
    return out;
  }
  function showTip(n, px, py) {
    if (!n) { tip.hidden = true; tipAt = null; return; }
    tipAt = { x: px, y: py };
    tip.textContent = "";
    rows(n).forEach(function (row, i) {
      if (i === 0) { tip.appendChild(el("b", null, row[0] + ": " + row[1])); return; }
      var d = el("div"); d.appendChild(el("span", "muted", row[0] + ": ")); d.appendChild(document.createTextNode(row[1])); tip.appendChild(d);
    });
    tip.hidden = false;
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = Math.min(W - tw - 8, Math.max(8, px + 14)) + "px"; tip.style.top = Math.min(H - th - 8, Math.max(8, py + 14)) + "px";
  }
  function bind() {
    var ptrs = {}, last = null, moved = 0, pinchD = 0;
    cv.addEventListener("pointerdown", function (e) { cv.setPointerCapture(e.pointerId); ptrs[e.pointerId] = { x: e.offsetX, y: e.offsetY }; last = { x: e.offsetX, y: e.offsetY }; moved = 0; });
    cv.addEventListener("pointermove", function (e) {
      var ids = Object.keys(ptrs);
      if (ids.length === 2 && ptrs[e.pointerId]) {
        ptrs[e.pointerId] = { x: e.offsetX, y: e.offsetY };
        var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchD) cam.z = Math.max(0.1, Math.min(8, cam.z * d / pinchD)); pinchD = d; moved += 10; redraw(); return;
      }
      if (ptrs[e.pointerId] && last) {
        var dx = e.offsetX - last.x, dy = e.offsetY - last.y; moved += Math.abs(dx) + Math.abs(dy);
        cam.x -= dx / cam.z; cam.y -= dy / cam.z; last = { x: e.offsetX, y: e.offsetY }; redraw(); return;
      }
      if (e.pointerType === "mouse") { hover = at(e.offsetX, e.offsetY); if (!pinned) showTip(hover, e.offsetX, e.offsetY); redraw(); }
    });
    function up(e) {
      delete ptrs[e.pointerId]; pinchD = 0;
      if (moved < 6) { pinned = at(e.offsetX, e.offsetY); showTip(pinned, e.offsetX, e.offsetY); redraw(); }
      last = null;
    }
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", function (e) { delete ptrs[e.pointerId]; pinchD = 0; last = null; });
    cv.addEventListener("pointerleave", function () { hover = null; if (!pinned) tip.hidden = true; redraw(); });
    cv.addEventListener("wheel", function (e) {
      e.preventDefault();
      var f = Math.exp(-e.deltaY * 0.0015), wx = (e.offsetX - W / 2) / cam.z + cam.x, wy = (e.offsetY - H / 2) / cam.z + cam.y;
      cam.z = Math.max(0.1, Math.min(8, cam.z * f)); cam.x = wx - (e.offsetX - W / 2) / cam.z; cam.y = wy - (e.offsetY - H / 2) / cam.z; redraw();
    }, { passive: false });
    document.getElementById("map-reset").addEventListener("click", function () { pinned = found = null; tip.hidden = true; fit(); redraw(); });
    var q = document.getElementById("map-q");
    q.addEventListener("input", function () {
      var s = q.value.trim().toLowerCase(); found = null;
      function m(x) { return (shopName(x) || "").toLowerCase().indexOf(s) >= 0 || (x.id || "").toLowerCase().indexOf(s) >= 0 || rows(x).some(function (r) { return String(r[1]).toLowerCase().indexOf(s) >= 0; }); }
      if (s.length >= 2) found = nodes.filter(function (n) { return n.shop && m(n); })[0] || relays.filter(m)[0] || nostr.filter(m)[0] || nodes.filter(m)[0] || null;
      if (found && found.nostr) showTip(found, found.px, Math.max(8, found.py - 150));
      else if (found) { cam.x = found.x; cam.y = found.y; cam.z = Math.max(cam.z, 1.6); showTip(found, W / 2, H / 2); } else if (!pinned) tip.hidden = true;
      redraw();
    });
  }

  function writePanel() {
    panel.textContent = "";
    var g = graphInfo, l = listInfo, pub = nodes.filter(function (n) { return !n.priv; }).length, shops = nodes.filter(function (n) { return n.shop; });
    if (g) {
      var cap = g.channels.reduce(function (s, c) { return s + c.sat; }, 0);
      panel.appendChild(el("h2", null, pub.toLocaleString("en-US") + " nodes · " + g.channels.length.toLocaleString("en-US") + " channels"));
      panel.appendChild(el("p", "small", fmtSat(cap) + " in public channels · snapshot " + ago(g.taken_at)));
    } else {
      panel.appendChild(el("h2", null, "No channel graph yet"));
      panel.appendChild(el("p", "small muted", "No snapshot of the public graph has been published, so Stream's shops are shown on their own."));
    }
    if (l) panel.appendChild(el("p", "small", pl(shops.length, "Stream shop", "Stream shops") + ", " + shops.filter(function (n) { return !n.priv; }).length + " of them on the public graph"));
    panel.appendChild(el("p", "small muted map-updated"));
    panel.appendChild(el("p", "small map-stale"));
    status();
    // Nostr relays: where the listings come from, beside the map
    var side = document.getElementById("map-sources");
    if (side && l) {
      side.textContent = "";
      var ok = l.relays.filter(function (r) { return r.ok; });
      side.appendChild(el("h2", null, "Where the listings come from"));
      side.appendChild(el("p", null, "Listings read " + ago(l.fetched_at) + " from " + ok.length + " of " + l.relays.length + " Nostr relays:"));
      var ul = el("ul");
      l.relays.forEach(function (r) { ul.appendChild(el("li", r.ok ? null : "muted", r.url.replace("wss://", "") + (r.ok ? ": " + pl(r.events, "event", "events") : ": not read (" + (r.error || "no answer") + ")"))); });
      side.appendChild(ul);
      side.appendChild(el("p", "muted small", "Nostr relays only carry the signed listings. They are drawn along the map's bottom edge, outside the network: no traffic and no payments go through them."));
    }
    // a text version of what the map shows
    var t = document.getElementById("map-text"); t.textContent = "";
    t.appendChild(el("h2", null, "In words"));
    t.appendChild(el("p", null, g ? "The latest snapshot of the public XBT Lightning graph, " + ago(g.taken_at) + ", has " + g.channels.length + " public channels between " + pub + " nodes." : "No channel-graph snapshot has been published yet."));
    if (shops.length) {
      t.appendChild(el("h3", null, "Stream shops and their nodes"));
      var ul2 = el("ul");
      shops.forEach(function (n) { ul2.appendChild(el("li", null, shopName(n) + " sells " + n.shop.svc.map(function (k) { return SVC[k]; }).join(", ") + ": " + (n.priv ? "on a private node, not in the public graph" : "on the Lightning node " + n.label) + ".")); });
      t.appendChild(ul2);
    }
    if (relays.length) {
      t.appendChild(el("h3", null, "Stream relays"));
      var ul3 = el("ul"); relays.forEach(function (r) { ul3.appendChild(el("li", null, r.host + ": carries traffic for " + (r.shops.map(shopName).join(", ") || "no shop named it") + ".")); }); t.appendChild(ul3);
    }
    var busiest = nodes.filter(function (n) { return !n.priv; }).sort(function (a, b) { return b.deg - a.deg; }).slice(0, 10);
    if (busiest.length) {
      t.appendChild(el("h3", null, "Best-connected Lightning nodes in the snapshot"));
      var ol = el("ol"); busiest.forEach(function (n) { ol.appendChild(el("li", null, n.label + ": " + n.deg + " channels")); }); t.appendChild(ol);
    }
  }

  // "updated N min ago", and a note when the graph snapshot is old or the last read failed
  function status() {
    var u = panel.querySelector(".map-updated"), st = panel.querySelector(".map-stale"), t = Date.now() / 1000;
    if (u) u.textContent = loadedAt ? "Map updated " + ago(loadedAt) + (listInfo ? " · listings read " + ago(listInfo.fetched_at) : "") + " · checks again every 2 min" : "";
    if (!st) return;
    var notes = [];
    if (graphInfo && t - graphInfo.taken_at > STALE_S) notes.push("Map data is stale: the newest channel-graph snapshot is from " + ago(graphInfo.taken_at) + ". A new one is normally published every 15 minutes.");
    if (listInfo && t - listInfo.fetched_at > STALE_S) notes.push("The listings were last read from the Nostr relays " + ago(listInfo.fetched_at) + ".");
    if (failedAt && failedAt > loadedAt) notes.push("The last check, " + ago(failedAt) + ", could not reach the map's data; showing what was read before.");
    st.textContent = notes.join(" "); st.hidden = !notes.length;
  }
  function getJ(u) { return fetch(u, { headers: { accept: "application/json" }, cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  function load() {
    lastTry = Date.now();
    return Promise.all([getJ("/api/graph"), getJ("/api/listings")]).then(function (res) {
      var g = res[0] && res[0].nodes ? res[0] : res[0] ? null : graphInfo, l = res[1] || listInfo;
      if (!res[0] || !res[1]) failedAt = Date.now() / 1000;
      if (!res[0] && !res[1]) { if (started) status(); else apply(null, null); return; }
      apply(g, l);
      loadedAt = Date.now() / 1000;
      status();
    });
  }
  // rebuild from new data, keeping positions, the camera and what is selected
  function apply(g, l) {
    var old = {}, keep = pinned && pinned.id, keepF = found && found.id, keepH = hover && hover.id;
    nodes.concat(relays, nostr).forEach(function (n) { old[n.id] = n; });
    graphInfo = g; listInfo = l;
    build(g, l);
    var fresh = 0;
    nodes.forEach(function (n) {
      var o = old[n.id]; if (o) { n.x = o.x; n.y = o.y; n.vx = o.vx; n.vy = o.vy; return; }
      fresh++;
      // a new node starts beside a neighbor that was already placed
      for (var i = 0; i < edges.length; i++) {
        var e = edges[i], m = e.a === n ? e.b : e.b === n ? e.a : null;
        if (m && old[m.id]) { n.x = old[m.id].x + (Math.random() - 0.5) * 40; n.y = old[m.id].y + (Math.random() - 0.5) * 40; break; }
      }
    });
    pinned = find(keep); found = find(keepF); hover = find(keepH);
    if (!started) {
      for (var i = 0; i < (reduce ? 500 : 300); i++) tick();
      if (reduce) alpha = 0;
      fit(); started = true;
      if (!reduce) requestAnimationFrame(loop);
    } else {
      // settle gently around what was already there; the camera is left alone
      alpha = Math.max(alpha, fresh ? 0.25 : 0.06);
      if (reduce) { for (var k = 0; k < 120; k++) tick(); alpha = 0; } else placeOutside();
    }
    draw();
    writePanel();
    if (pinned && tipAt) showTip(pinned, tipAt.x, tipAt.y); else if (keep && !pinned) showTip(null);
    if (!nodes.length) { panel.textContent = ""; panel.appendChild(el("h2", null, "Nothing to draw yet")); panel.appendChild(el("p", "small muted", "Neither a graph snapshot nor live listings could be loaded.")); }
  }

  function init() {
    cv = document.getElementById("map"); if (!cv) return;
    ctx = cv.getContext("2d"); tip = document.getElementById("map-tip"); panel = document.getElementById("map-panel");
    resize(); window.addEventListener("resize", resize);
    bind();
    load();
    setInterval(function () { if (!document.hidden) load(); }, POLL_MS);
    setInterval(function () { if (!document.hidden && started) status(); }, 20000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden && Date.now() - lastTry > 60000) load(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();

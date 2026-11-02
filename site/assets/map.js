/* The network map: XBT Lightning's public channel graph (/api/graph) with Lightning Stream's shops,
   hashrate offers, VPN exits and relays (/api/listings) drawn on top. A small force layout on a 2D canvas.
   With prefers-reduced-motion the layout is settled before the first frame and nothing moves by itself. */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var C = { node: "#ffffff", shop: "#ffd60a", hash: "#ff8f45", vpn: "#5fe8d2", relay: "#7fb9ff", nostr: "#c58cff" };
  var cv, ctx, tip, panel, W = 0, H = 0, dpr = 1;
  var nodes = [], edges = [], byId = {}, cam = { x: 0, y: 0, z: 1 }, alpha = 1, hover = null, pinned = null, found = null, pulses = [];
  var graphInfo = null, listInfo = null;

  function pl(n, one, many) { return n + " " + (n === 1 ? one : many); }
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function ago(t) { var s = Math.max(0, Date.now() / 1000 - t); return s < 90 ? "just now" : s < 5400 ? Math.round(s / 60) + " min ago" : s < 172800 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " days ago"; }
  function fmtSat(n) { return n >= 1e8 ? (n / 1e8).toFixed(2) + " XBT" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M sat" : n >= 1e3 ? Math.round(n / 1e3) + "k sat" : n + " sat"; }
  function rgba(h, a) { var n = parseInt(h.slice(1), 16); return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; }
  var glowCache = {};
  function glow(col) {
    if (glowCache[col]) return glowCache[col];
    var c = document.createElement("canvas"); c.width = c.height = 64; var g = c.getContext("2d"), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, rgba(col, 0.55)); r.addColorStop(0.25, rgba(col, 0.18)); r.addColorStop(1, rgba(col, 0)); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    return (glowCache[col] = c);
  }

  function add(id, kind, label, info, r) {
    if (byId[id]) return byId[id];
    var a = Math.random() * 6.283, d = 80 + Math.random() * 380;
    var n = { id: id, kind: kind, label: label || "", info: info || [], r: r || 5, x: Math.cos(a) * d, y: Math.sin(a) * d, vx: 0, vy: 0, deg: 0 };
    nodes.push(n); byId[id] = n; return n;
  }
  function link(a, b, type, w) { if (!a || !b || a === b) return; edges.push({ a: a, b: b, type: type, w: w || 1 }); a.deg++; b.deg++; }

  function build(g, l) {
    if (g && g.nodes) {
      var alias = {}; g.nodes.forEach(function (n) { alias[n.id] = n; });
      var deg = {}; g.channels.forEach(function (c) { deg[c.a] = (deg[c.a] || 0) + 1; deg[c.b] = (deg[c.b] || 0) + 1; });
      var maxSat = 1; g.channels.forEach(function (c) { if (c.sat > maxSat) maxSat = c.sat; });
      g.nodes.forEach(function (n) {
        if (!deg[n.id]) return;
        add("ln:" + n.id, "node", n.alias || n.id.slice(0, 10) + "…", [["Lightning node", n.alias || "(no alias)"], ["Key", n.id], ["Channels", String(deg[n.id])]], 2.2 + Math.sqrt(deg[n.id]) * 1.5);
      });
      g.channels.forEach(function (c) { link(byId["ln:" + c.a], byId["ln:" + c.b], "chan", 0.35 + 0.65 * Math.sqrt(c.sat / maxSat)); });
    }
    if (!l) return;
    function relayNode(host) { return add("r:" + host, "relay", host, [["Stream relay", host], ["What it does", "carries encrypted links between apps that can't connect directly; it can't read them"]], 7); }
    function nostrNode(host) { return add("n:" + host, "nostr", host, [["Nostr relay", host], ["What it does", "carries signed listings; shops are found here"]], 6); }
    var shopByNpub = {};
    l.shops.filter(function (s) { return !s.stale; }).forEach(function (s) {
      var kinds = []; s.services.forEach(function (x) { if (kinds.indexOf(x.kind) < 0) kinds.push(x.kind); });
      var n = add("s:" + s.id, "shop", s.name, [["Stream shop", s.name], ["Sells", kinds.join(", ")], [s.npub ? "Shop key" : "Web address", s.npub || s.origin], ["Published", ago(s.published_at)]], 9);
      if (s.npub) shopByNpub[s.npub] = n;
      s.iroh_relays.forEach(function (h) { link(n, relayNode(h), "relay"); });
      s.seen_on.forEach(function (h) { link(n, nostrNode(h), "find"); });
    });
    l.hashrate.forEach(function (h) {
      var n = add("h:" + h.id, "hash", h.name, [["Hashrate offer", h.name], ["Price", h.price], ["Miners", h.free_miners + " of " + h.miners + " free"], ["Published", ago(h.published_at)]], 8);
      if (h.pay_node && byId["ln:" + h.pay_node]) link(n, byId["ln:" + h.pay_node], "pay");
      h.iroh_relays.forEach(function (x) { link(n, relayNode(x), "relay"); });
      h.seen_on.forEach(function (x) { link(n, nostrNode(x), "find"); });
    });
    l.exits.forEach(function (x) {
      var n = add("e:" + x.id, "vpn", "VPN exit" + (x.region ? " " + x.region : ""), [["VPN exit", x.region ? "country claimed: " + x.region : "no country given"], ["Price", x.price], ["Kind", x.filtered ? "filtered" : "private"], ["Published", ago(x.published_at)]], 8);
      if (x.relay) link(n, relayNode(x.relay), "relay");
      if (x.shop_npub && shopByNpub[x.shop_npub]) link(n, shopByNpub[x.shop_npub], "own");
      x.seen_on.forEach(function (h) { link(n, nostrNode(h), "find"); });
    });
    l.relays_announced.forEach(function (r) { relayNode(r.relay).info.push(["Region", r.region || "not given"]); });
  }

  /* ---------- layout: springs on edges, repulsion between nearby nodes (spatial hash), a gentle pull to the centre ---------- */
  function tick() {
    var cell = 90, grid = {}, i, j, n, m;
    for (i = 0; i < nodes.length; i++) { n = nodes[i]; var k = Math.floor(n.x / cell) + "," + Math.floor(n.y / cell); (grid[k] || (grid[k] = [])).push(n); }
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i]; var cx = Math.floor(n.x / cell), cy = Math.floor(n.y / cell);
      for (var dx = -2; dx <= 2; dx++) for (var dy = -2; dy <= 2; dy++) {
        var list = grid[(cx + dx) + "," + (cy + dy)]; if (!list) continue;
        for (j = 0; j < list.length; j++) {
          m = list[j]; if (m === n) continue;
          var ex = n.x - m.x, ey = n.y - m.y, d2 = ex * ex + ey * ey + 0.01;
          if (d2 > 40000) continue;
          var f = 900 / d2; n.vx += ex * f * alpha; n.vy += ey * f * alpha;
        }
      }
      n.vx -= n.x * 0.004 * alpha; n.vy -= n.y * 0.004 * alpha;
    }
    edges.forEach(function (e) {
      var want = e.type === "chan" ? 46 : e.type === "find" ? 120 : 60;
      var ex = e.b.x - e.a.x, ey = e.b.y - e.a.y, d = Math.sqrt(ex * ex + ey * ey) + 0.01, f = (d - want) / d * 0.06 * alpha;
      e.a.vx += ex * f; e.a.vy += ey * f; e.b.vx -= ex * f; e.b.vy -= ey * f;
    });
    nodes.forEach(function (n) { n.vx *= 0.6; n.vy *= 0.6; n.x += Math.max(-20, Math.min(20, n.vx)); n.y += Math.max(-20, Math.min(20, n.vy)); });
    alpha *= 0.985;
  }
  function fit() {
    if (!nodes.length) return;
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    nodes.forEach(function (n) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); });
    var pad = 60, z = Math.min(W / (x1 - x0 + pad * 2), H / (y1 - y0 + pad * 2));
    cam = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: Math.max(0.15, Math.min(z, 3)) };
  }
  function sx(x) { return (x - cam.x) * cam.z + W / 2; }
  function sy(y) { return (y - cam.y) * cam.z + H / 2; }

  function draw(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    var focus = pinned || hover || found, near = {};
    if (focus) { near[focus.id] = 1; edges.forEach(function (e) { if (e.a === focus) near[e.b.id] = 1; if (e.b === focus) near[e.a.id] = 1; }); }
    ctx.lineCap = "round";
    edges.forEach(function (e) {
      var on = focus && (e.a === focus || e.b === focus), dim = focus && !on ? 0.35 : 1;
      ctx.beginPath(); ctx.moveTo(sx(e.a.x), sy(e.a.y)); ctx.lineTo(sx(e.b.x), sy(e.b.y));
      if (e.type === "chan") { ctx.strokeStyle = on ? "rgba(255,214,10,0.7)" : "rgba(255,255,255," + (0.07 + 0.16 * e.w) * dim + ")"; ctx.lineWidth = on ? 1.6 : 1; }
      else if (e.type === "relay") { ctx.strokeStyle = rgba(C.relay, (on ? 0.8 : 0.4) * dim); ctx.setLineDash([5, 5]); ctx.lineWidth = 1.2; }
      else if (e.type === "find") { ctx.strokeStyle = rgba(C.nostr, (on ? 0.8 : 0.3) * dim); ctx.setLineDash([1, 6]); ctx.lineWidth = 1.4; }
      else { ctx.strokeStyle = rgba(e.type === "pay" ? C.shop : C.vpn, (on ? 0.9 : 0.45) * dim); ctx.lineWidth = 1.3; }
      ctx.stroke(); ctx.setLineDash([]);
    });
    // payments streaming along channels: a few pulses, slowly
    if (!reduce) {
      var chans = edges.filter(function (e) { return e.type === "chan"; });
      if (chans.length && pulses.length < Math.min(14, chans.length) && Math.random() < 0.05) { var e = chans[Math.floor(Math.random() * chans.length)]; pulses.push({ e: e, t: 0, dir: Math.random() < 0.5 }); }
      ctx.globalCompositeOperation = "lighter";
      pulses = pulses.filter(function (p) {
        p.t += 0.008; if (p.t >= 1) return false;
        var a = p.dir ? p.e.a : p.e.b, b = p.dir ? p.e.b : p.e.a, x = sx(a.x + (b.x - a.x) * p.t), y = sy(a.y + (b.y - a.y) * p.t);
        ctx.globalAlpha = Math.sin(p.t * Math.PI); ctx.drawImage(glow(C.shop), x - 9, y - 9, 18, 18); ctx.globalAlpha = 1; return true;
      });
      ctx.globalCompositeOperation = "source-over";
    }
    nodes.forEach(function (n) {
      var col = C[n.kind] || C.node, r = Math.max(1.6, n.r * Math.min(1.6, Math.max(0.6, cam.z))), x = sx(n.x), y = sy(n.y);
      if (x < -40 || y < -40 || x > W + 40 || y > H + 40) return;
      var dim = focus && !near[n.id] ? 0.3 : 1;
      ctx.globalAlpha = dim;
      ctx.drawImage(glow(col), x - r * 4, y - r * 4, r * 8, r * 8);
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
      if (n.kind === "node") { ctx.fillStyle = n === focus ? C.shop : "#fff"; ctx.fill(); }
      else { ctx.fillStyle = "#08090c"; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = col; ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, r * 0.38, 0, 7); ctx.fillStyle = col; ctx.fill(); }
      ctx.globalAlpha = 1;
    });
    // labels: Stream's own nodes, the busiest Lightning nodes, and whatever is in focus
    ctx.font = "500 12px Inter, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "top";
    var top = nodes.filter(function (n) { return n.kind === "node"; }).sort(function (a, b) { return b.deg - a.deg; }).slice(0, cam.z > 1.2 ? 30 : 8);
    nodes.forEach(function (n) {
      var show = n.kind !== "node" || top.indexOf(n) >= 0 || near[n.id];
      if (!show || !n.label || (focus && !near[n.id])) return;
      var x = sx(n.x), y = sy(n.y) + n.r * Math.min(1.6, Math.max(0.6, cam.z)) + 6;
      ctx.fillStyle = "rgba(5,5,7,0.75)"; var w = ctx.measureText(n.label).width; ctx.fillRect(x - w / 2 - 4, y - 2, w + 8, 17);
      ctx.fillStyle = n.kind === "node" ? "rgba(255,255,255,0.75)" : C[n.kind]; ctx.fillText(n.label, x, y);
    });
  }

  function loop() {
    if (alpha > 0.02) for (var i = 0; i < 2; i++) tick();
    if (!document.hidden) draw();
    requestAnimationFrame(loop);
  }
  function resize() {
    var r = cv.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 2); W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); if (reduce) draw();
  }

  /* ---------- interaction ---------- */
  function at(px, py) {
    var best = null, bd = 18 * 18;
    nodes.forEach(function (n) { var dx = sx(n.x) - px, dy = sy(n.y) - py, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = n; } });
    return best;
  }
  function showTip(n, px, py) {
    if (!n) { tip.hidden = true; return; }
    tip.textContent = "";
    n.info.forEach(function (row, i) {
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
        if (pinchD) cam.z = Math.max(0.1, Math.min(8, cam.z * d / pinchD)); pinchD = d; moved += 10; if (reduce) draw(); return;
      }
      if (ptrs[e.pointerId] && last) {
        var dx = e.offsetX - last.x, dy = e.offsetY - last.y; moved += Math.abs(dx) + Math.abs(dy);
        cam.x -= dx / cam.z; cam.y -= dy / cam.z; last = { x: e.offsetX, y: e.offsetY }; if (reduce) draw(); return;
      }
      if (e.pointerType === "mouse") { hover = at(e.offsetX, e.offsetY); if (!pinned) showTip(hover, e.offsetX, e.offsetY); if (reduce) draw(); }
    });
    function up(e) {
      delete ptrs[e.pointerId]; pinchD = 0;
      if (moved < 6) { pinned = at(e.offsetX, e.offsetY); showTip(pinned, e.offsetX, e.offsetY); if (reduce) draw(); }
      last = null;
    }
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", function (e) { delete ptrs[e.pointerId]; pinchD = 0; last = null; });
    cv.addEventListener("pointerleave", function () { hover = null; if (!pinned) tip.hidden = true; });
    cv.addEventListener("wheel", function (e) {
      e.preventDefault();
      var f = Math.exp(-e.deltaY * 0.0015), wx = (e.offsetX - W / 2) / cam.z + cam.x, wy = (e.offsetY - H / 2) / cam.z + cam.y;
      cam.z = Math.max(0.1, Math.min(8, cam.z * f)); cam.x = wx - (e.offsetX - W / 2) / cam.z; cam.y = wy - (e.offsetY - H / 2) / cam.z; if (reduce) draw();
    }, { passive: false });
    document.getElementById("map-reset").addEventListener("click", function () { pinned = found = null; tip.hidden = true; fit(); if (reduce) draw(); });
    var q = document.getElementById("map-q");
    q.addEventListener("input", function () {
      var s = q.value.trim().toLowerCase(); found = null;
      if (s.length >= 2) found = nodes.filter(function (n) { return n.label.toLowerCase().indexOf(s) >= 0 || n.id.toLowerCase().indexOf(s) >= 0 || n.info.some(function (r) { return String(r[1]).toLowerCase().indexOf(s) >= 0; }); })[0] || null;
      if (found) { cam.x = found.x; cam.y = found.y; cam.z = Math.max(cam.z, 1.6); showTip(found, W / 2, H / 2); } else if (!pinned) tip.hidden = true;
      if (reduce) draw();
    });
  }

  function writePanel() {
    panel.textContent = "";
    var g = graphInfo, l = listInfo;
    if (g) {
      var cap = g.channels.reduce(function (s, c) { return s + c.sat; }, 0), live = nodes.filter(function (n) { return n.kind === "node"; }).length;
      panel.appendChild(el("h2", null, live.toLocaleString("en-US") + " nodes · " + g.channels.length.toLocaleString("en-US") + " channels"));
      panel.appendChild(el("p", "small", fmtSat(cap) + " in public channels · snapshot " + ago(g.taken_at)));
    } else {
      panel.appendChild(el("h2", null, "Lightning Stream, on Nostr"));
      panel.appendChild(el("p", "small muted", "No channel-graph snapshot has been published yet, so only Stream's own shops, exits and relays are drawn."));
    }
    if (l) {
      var shops = l.shops.filter(function (s) { return !s.stale; }).length;
      panel.appendChild(el("p", "small", pl(shops, "shop", "shops") + " · " + pl(l.hashrate.length, "hashrate offer", "hashrate offers") + " · " + pl(l.exits.length, "VPN exit", "VPN exits") + " · listings read " + ago(l.fetched_at)));
    }
    // a text version of what the map shows
    var t = document.getElementById("map-text"); t.textContent = "";
    t.appendChild(el("h2", null, "In words"));
    var p = el("p"); p.textContent = (g ? "The latest snapshot of the public XBT Lightning graph, " + ago(g.taken_at) + ", has " + g.channels.length + " public channels between " + nodes.filter(function (n) { return n.kind === "node"; }).length + " nodes. " : "No channel-graph snapshot has been published yet. ") +
      (l ? "Lightning Stream's Nostr listings show " + pl(l.shops.filter(function (s) { return !s.stale; }).length, "shop", "shops") + ", " + pl(l.hashrate.length, "hashrate offer", "hashrate offers") + " and " + pl(l.exits.length, "VPN exit", "VPN exits") + "." : "");
    t.appendChild(p);
    var busiest = nodes.filter(function (n) { return n.kind === "node"; }).sort(function (a, b) { return b.deg - a.deg; }).slice(0, 10);
    if (busiest.length) {
      t.appendChild(el("h3", null, "Best-connected Lightning nodes in the snapshot"));
      var ol = el("ol"); busiest.forEach(function (n) { ol.appendChild(el("li", null, n.label + ": " + n.deg + " channels")); }); t.appendChild(ol);
    }
    t.appendChild(el("p", "small muted")).appendChild(document.createTextNode("Shops in detail are on the shops page."));
  }

  function init() {
    cv = document.getElementById("map"); if (!cv) return;
    ctx = cv.getContext("2d"); tip = document.getElementById("map-tip"); panel = document.getElementById("map-panel");
    resize(); window.addEventListener("resize", function () { resize(); });
    bind();
    function getJ(u) { return fetch(u, { headers: { accept: "application/json" } }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
    Promise.all([getJ("/api/graph"), getJ("/api/listings")]).then(function (res) {
      graphInfo = res[0] && res[0].nodes ? res[0] : null; listInfo = res[1];
      build(graphInfo, listInfo);
      if (reduce) { for (var i = 0; i < 400; i++) tick(); alpha = 0; fit(); draw(); }
      else { for (var j = 0; j < 120; j++) tick(); fit(); requestAnimationFrame(loop); setTimeout(function () { if (!pinned && !found) fit(); }, 2500); }
      writePanel();
      if (!nodes.length) { panel.textContent = ""; panel.appendChild(el("h2", null, "Nothing to draw yet")); panel.appendChild(el("p", "small muted", "Neither a graph snapshot nor live listings could be loaded.")); }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();

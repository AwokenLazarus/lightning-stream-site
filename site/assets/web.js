/* The Lightning Stream web: buyers, shops and services joined by Lightning channels and encrypted links,
   with payments streaming along the edges as small pulses of light.

   One engine, three uses:
   - data-web="home":    the homepage's fixed backdrop. Sections marked data-scene focus one part of the web.
   - data-web="ambient": a quiet, slow version behind an inner page's title.
   - data-web="card":    a small vignette inside a card (data-scene picks which part).

   It draws on a 2D canvas with pre-rendered sprites, so it stays light. With prefers-reduced-motion, on a
   low-power device, or with Save-Data, it draws one still frame instead of animating. The canvas is
   decorative (aria-hidden); every fact it shows is also in the page's text. */
(function () {
  "use strict";

  var DPR_CAP = 2;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  var conn = navigator.connection || {};
  var lowPower = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) ||
    (navigator.deviceMemory && navigator.deviceMemory <= 2) || conn.saveData === true;
  function still() { return lowPower || (reduce && reduce.matches); }

  /* ---------- the kinds, one accent each ---------- */
  var K = {
    buyer: { c: "#e9f2ff", r: 11, ring: true },
    shop: { c: "#ffd60a", r: 14, ring: true },
    app: { c: "#ffb648", r: 10, ring: true },
    files: { c: "#fff09a", r: 10, ring: true },
    ai: { c: "#b9a4ff", r: 10, ring: true },
    hash: { c: "#ff8f45", r: 9, ring: true },
    gw: { c: "#ff8f45", r: 11, ring: true },
    pool: { c: "#ffd60a", r: 10, ring: true },
    vpn: { c: "#5fe8d2", r: 11, ring: true },
    net: { c: "#9fd8ff", r: 10, ring: true },
    relay: { c: "#7fb9ff", r: 11, ring: true },
    nostr: { c: "#c58cff", r: 8, ring: true },
    node: { c: "#ffffff", r: 4.2, ring: false },
    dev: { c: "#e9f2ff", r: 8, ring: true }
  };
  var FLOW_C = { sats: "#ffd60a", data: "#a9dcff", work: "#ff8f45", find: "#c58cff" };

  /* ---------- glyphs, drawn in a 26 px box centered on 0,0 ---------- */
  var G = {
    buyer: function (c) { c.beginPath(); c.arc(0, -4.5, 4, 0, 7); c.stroke(); c.beginPath(); c.arc(0, 9, 8, Math.PI * 1.12, Math.PI * 1.88); c.stroke(); },
    dev: function (c) { rr(c, -6, -8, 12, 16, 2.5); c.stroke(); c.beginPath(); c.moveTo(-2, 5); c.lineTo(2, 5); c.stroke(); },
    shop: function (c) { hex(c, 9); c.stroke(); bolt(c, 0.62); c.fill(); },
    app: function (c) { rr(c, -8, -6.5, 16, 13, 3); c.stroke(); c.beginPath(); c.moveTo(-2, -3); c.lineTo(3.5, 0); c.lineTo(-2, 3); c.closePath(); c.fill(); },
    files: function (c) { c.beginPath(); c.moveTo(-6, -8); c.lineTo(2.5, -8); c.lineTo(6.5, -4); c.lineTo(6.5, 8); c.lineTo(-6, 8); c.closePath(); c.stroke(); c.beginPath(); c.moveTo(-3, 0); c.lineTo(3.5, 0); c.moveTo(-3, 3.5); c.lineTo(3.5, 3.5); c.stroke(); },
    ai: function (c) { star(c, 0, 0, 8.5, 2.2); c.fill(); star(c, 6.5, -6, 3, 0.9); c.fill(); },
    hash: function (c) { rr(c, -5.5, -5.5, 11, 11, 1.5); c.stroke(); c.beginPath(); for (var i = -1; i <= 1; i++) { c.moveTo(i * 3.2, -5.5); c.lineTo(i * 3.2, -8.5); c.moveTo(i * 3.2, 5.5); c.lineTo(i * 3.2, 8.5); c.moveTo(-5.5, i * 3.2); c.lineTo(-8.5, i * 3.2); c.moveTo(5.5, i * 3.2); c.lineTo(8.5, i * 3.2); } c.stroke(); },
    gw: function (c) { c.beginPath(); c.moveTo(0, -8.5); c.lineTo(8, 0); c.lineTo(0, 8.5); c.lineTo(-8, 0); c.closePath(); c.stroke(); c.beginPath(); c.moveTo(-4, 0); c.lineTo(4, 0); c.stroke(); },
    pool: function (c) { c.beginPath(); c.moveTo(0, -8); c.lineTo(7, -4); c.lineTo(7, 4); c.lineTo(0, 8); c.lineTo(-7, 4); c.lineTo(-7, -4); c.closePath(); c.moveTo(-7, -4); c.lineTo(0, 0); c.lineTo(7, -4); c.moveTo(0, 0); c.lineTo(0, 8); c.stroke(); },
    vpn: function (c) { c.beginPath(); c.moveTo(0, -8.5); c.lineTo(7, -5.5); c.quadraticCurveTo(7, 5, 0, 9); c.quadraticCurveTo(-7, 5, -7, -5.5); c.closePath(); c.stroke(); c.beginPath(); c.arc(0, -0.5, 2, 0, 7); c.fill(); },
    net: function (c) { c.beginPath(); c.arc(0, 0, 8, 0, 7); c.stroke(); c.beginPath(); c.ellipse(0, 0, 3.6, 8, 0, 0, 7); c.moveTo(-8, 0); c.lineTo(8, 0); c.stroke(); },
    relay: function (c) { c.beginPath(); c.arc(0, 0, 2.2, 0, 7); c.fill(); c.beginPath(); c.arc(0, 0, 5.5, -0.8, 0.8); c.stroke(); c.beginPath(); c.arc(0, 0, 5.5, Math.PI - 0.8, Math.PI + 0.8); c.stroke(); c.beginPath(); c.arc(0, 0, 9, -0.7, 0.7); c.stroke(); c.beginPath(); c.arc(0, 0, 9, Math.PI - 0.7, Math.PI + 0.7); c.stroke(); },
    nostr: function (c) { c.beginPath(); c.arc(0, 0, 2.4, 0, 7); c.fill(); c.setLineDash([2, 2.6]); c.beginPath(); c.arc(0, 0, 6.5, 0, 7); c.stroke(); c.setLineDash([]); },
    node: null
  };
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function hex(c, r) { c.beginPath(); for (var i = 0; i < 6; i++) { var a = Math.PI / 6 + i * Math.PI / 3; c[i ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); }
  function bolt(c, s) { c.beginPath(); c.moveTo(1.5 * s, -9 * s); c.lineTo(-5 * s, 1 * s); c.lineTo(-0.5 * s, 1 * s); c.lineTo(-1.5 * s, 9 * s); c.lineTo(5 * s, -1.5 * s); c.lineTo(0.5 * s, -1.5 * s); c.closePath(); }
  function star(c, x, y, r, w) { c.beginPath(); c.moveTo(x, y - r); c.quadraticCurveTo(x + w * 0.4, y - w * 0.4, x + r, y); c.quadraticCurveTo(x + w * 0.4, y + w * 0.4, x, y + r); c.quadraticCurveTo(x - w * 0.4, y + w * 0.4, x - r, y); c.quadraticCurveTo(x - w * 0.4, y - w * 0.4, x, y - r); c.closePath(); }

  /* ---------- sprites: glow, ring and glyph, rendered once per kind ---------- */
  var SPR = 128, CORE = 22, sprites = {}, pulseSprites = {};
  function rgba(hexc, a) { var n = parseInt(hexc.slice(1), 16); return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; }
  function sprite(kind) {
    if (sprites[kind]) return sprites[kind];
    var k = K[kind], cv = document.createElement("canvas"); cv.width = cv.height = SPR;
    var c = cv.getContext("2d"), m = SPR / 2;
    var g = c.createRadialGradient(m, m, 0, m, m, m);
    g.addColorStop(0, rgba(k.c, k.ring ? 0.30 : 0.9)); g.addColorStop(k.ring ? 0.32 : 0.12, rgba(k.c, k.ring ? 0.12 : 0.35));
    g.addColorStop(1, rgba(k.c, 0)); c.fillStyle = g; c.fillRect(0, 0, SPR, SPR);
    if (k.ring) {
      c.beginPath(); c.arc(m, m, CORE, 0, 7); c.fillStyle = "#08090c"; c.fill();
      c.lineWidth = 1.6; c.strokeStyle = rgba(k.c, 0.9); c.stroke();
      c.save(); c.translate(m, m); c.lineWidth = 1.7; c.lineCap = "round"; c.lineJoin = "round"; c.strokeStyle = k.c; c.fillStyle = k.c;
      if (G[kind]) G[kind](c); c.restore();
    } else {
      c.beginPath(); c.arc(m, m, 7, 0, 7); c.fillStyle = "#fff"; c.fill();
    }
    return (sprites[kind] = cv);
  }
  function pulseSprite(type) {
    if (pulseSprites[type]) return pulseSprites[type];
    var cv = document.createElement("canvas"); cv.width = cv.height = 64; var c = cv.getContext("2d");
    var g = c.createRadialGradient(32, 32, 0, 32, 32, 32), col = FLOW_C[type];
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.12, rgba(col, 0.95)); g.addColorStop(0.4, rgba(col, 0.25)); g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    return (pulseSprites[type] = cv);
  }

  /* ---------- the world ---------- */
  function rng(seed) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function buildWorld() {
    var N = {}, E = [], R = rng(20261101);
    function n(id, kind, x, y, label) { N[id] = { id: id, kind: kind, x: x, y: y, label: label || "", ph: R() * 6.28, f: 0.6 + R() * 0.8, a: 1, la: 0 }; }
    function e(a, b, type) { E.push({ a: a, b: b, type: type }); }

    // Lightning: the backbone of routing nodes
    var L = [[-130, -60], [60, -120], [210, 0], [40, 95], [-170, 120], [-320, -10], [340, -150], [330, 180], [-40, -250], [120, 250]];
    L.forEach(function (p, i) { n("L" + i, "node", p[0], p[1], "Lightning"); });
    [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [0, 5], [5, 4], [1, 6], [6, 2], [2, 7], [7, 3], [0, 3], [0, 8], [8, 1], [3, 9], [9, 7], [9, 4]].forEach(function (p) { e("L" + p[0], "L" + p[1], "chan"); });
    // more of the network, scattered
    var fill = [];
    for (var i = 0; i < 26; i++) {
      var a = R() * 6.283, d = 300 + R() * 520, id = "F" + i;
      n(id, "node", Math.cos(a) * d * 1.25, Math.sin(a) * d * 0.78, "");
      fill.push(id);
    }
    var all = Object.keys(N);
    fill.forEach(function (id) {
      var me = N[id], best = all.filter(function (o) { return o !== id; }).sort(function (p, q) { return dist(N[p], me) - dist(N[q], me); });
      e(id, best[0], "chan"); if (R() < 0.6) e(id, best[1], "chan");
    });

    // 1. a buyer pays a shop
    n("B1", "buyer", -600, -190, "You"); n("NB1", "node", -470, -140, "your node");
    n("S1", "shop", 560, -280, "a shop"); n("NS1", "node", 450, -215, "its node");
    e("B1", "NB1", "own"); e("NB1", "L5", "chan"); e("S1", "NS1", "own"); e("NS1", "L6", "chan");
    e("B1", "S1", "link");
    // 2. a seller's web app and files
    n("S2", "shop", 590, 250, "a shop"); n("A1", "app", 720, 175, "web app"); n("FI", "files", 735, 320, "files");
    n("NS2", "node", 470, 200, "its node"); e("S2", "A1", "svc"); e("S2", "FI", "svc"); e("S2", "NS2", "own"); e("NS2", "L7", "chan");
    n("B2", "buyer", -470, 330, "You"); n("D1", "dev", -610, 280, "TV"); n("D2", "dev", -600, 410, "phone");
    n("NB2", "node", -360, 250, "your node"); e("B2", "D1", "own"); e("B2", "D2", "own"); e("B2", "NB2", "own"); e("NB2", "L4", "chan");
    e("B2", "S2", "link");
    // 3. AI, per token
    n("S3", "shop", 230, -470, "an AI seller"); n("AI1", "ai", 360, -530, "model"); n("AI2", "ai", 120, -560, "model");
    n("NS3", "node", 190, -360, "its node"); e("S3", "AI1", "svc"); e("S3", "AI2", "svc"); e("S3", "NS3", "own"); e("NS3", "L1", "chan");
    n("B4", "buyer", -260, -470, "your AI apps"); n("NB4", "node", -200, -350, "your node"); e("B4", "NB4", "own"); e("NB4", "L8", "chan");
    e("B4", "S3", "link");
    // 4. hashrate, masked
    n("H", "shop", -110, 470, "hashmaker"); n("M1", "hash", -250, 540, "miners"); n("M2", "hash", -120, 600, ""); n("M3", "hash", 10, 560, "");
    e("M1", "H", "svc"); e("M2", "H", "svc"); e("M3", "H", "svc");
    n("NH", "node", -60, 360, "its node"); e("H", "NH", "own"); e("NH", "L4", "chan");
    n("T", "buyer", 300, 470, "hashtaker"); n("GW", "gw", 430, 530, "Stream Gateway"); n("P", "pool", 560, 590, "solo or pool");
    e("T", "GW", "own"); e("GW", "P", "work"); n("NT", "node", 250, 360, "your node"); e("T", "NT", "own"); e("NT", "L9", "chan");
    e("H", "T", "link");
    // 5. a VPN exit, by the GB
    n("B5", "buyer", -720, 60, "You"); n("D3", "dev", -850, 0, "laptop"); n("D4", "dev", -860, 120, "phone");
    e("B5", "D3", "own"); e("B5", "D4", "own"); n("NB5", "node", -560, 60, "your node"); e("B5", "NB5", "own"); e("NB5", "L5", "chan");
    n("R2", "relay", -760, -170, "relay"); n("E1", "vpn", -820, -330, "VPN exit"); n("NET", "net", -950, -420, "the internet");
    n("NE1", "node", -640, -330, "its node"); e("E1", "NE1", "own"); e("NE1", "L5", "chan");
    e("B5", "R2", "relay"); e("R2", "E1", "relay"); e("E1", "NET", "exit");
    // 6. links and relays
    n("R1", "relay", 0, -390, "relay"); e("B1", "R1", "relay"); e("R1", "S1", "relay");
    // 7. found on Nostr
    n("NR1", "nostr", -330, -700, "Nostr relay"); n("NR2", "nostr", 380, -720, "Nostr relay");
    ["S1", "S3", "E1"].forEach(function (s) { e(s, s === "E1" ? "NR1" : "NR2", "find"); });
    e("S2", "NR2", "find"); e("H", "NR1", "find");
    // make sure every fill channel touches something real
    E.forEach(function (ed) { if (N[ed.a] && N[ed.b]) { ed.na = N[ed.a]; ed.nb = N[ed.b]; } });
    E = E.filter(function (ed) { return ed.na && ed.nb; });
    return { N: N, E: E };
  }
  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }

  /* flows: paths along which pulses run */
  var FLOWS = {
    pay: { path: ["B1", "NB1", "L5", "L0", "L1", "L6", "NS1", "S1"], type: "sats", every: 1500 },
    payData: { path: ["S1", "B1"], type: "data", every: 520 },
    payRelay: { path: ["S1", "R1", "B1"], type: "data", every: 560 },
    media: { path: ["B2", "NB2", "L4", "L3", "L7", "NS2", "S2"], type: "sats", every: 1700 },
    mediaApp: { path: ["A1", "S2", "B2", "D1"], type: "data", every: 430 },
    mediaFiles: { path: ["FI", "S2", "B2", "D2"], type: "data", every: 650 },
    ai: { path: ["B4", "NB4", "L8", "L1", "NS3", "S3"], type: "sats", every: 1600 },
    aiTok: { path: ["AI1", "S3", "B4"], type: "data", every: 300 },
    aiTok2: { path: ["AI2", "S3", "B4"], type: "data", every: 900 },
    hashWork: { path: ["M1", "H", "T", "GW", "P"], type: "work", every: 700 },
    hashWork2: { path: ["M3", "H", "T", "GW"], type: "work", every: 900 },
    hashWork3: { path: ["M2", "H", "T", "GW"], type: "work", every: 1100 },
    hashPay: { path: ["T", "NT", "L9", "L4", "NH", "H"], type: "sats", every: 1500 },
    vpnOut: { path: ["D3", "B5", "R2", "E1", "NET"], type: "data", every: 520 },
    vpnBack: { path: ["NET", "E1", "R2", "B5", "D4"], type: "data", every: 640 },
    vpnPay: { path: ["B5", "NB5", "L5", "NE1", "E1"], type: "sats", every: 1700 },
    find1: { path: ["NR2", "S1"], type: "find", every: 2600 },
    find2: { path: ["NR1", "E1"], type: "find", every: 2900 }
  };

  var SCENES = {
    overview: { focus: null, flows: ["pay", "payData", "media", "mediaApp", "ai", "aiTok", "hashWork", "hashPay", "vpnOut", "vpnPay"], slow: 1.6 },
    dim: { focus: null, flows: ["pay", "media", "ai", "hashWork"], slow: 2.2, dim: 0.32 },
    pay: { focus: ["B1", "NB1", "L5", "L0", "L1", "L6", "NS1", "S1"], flows: ["pay", "payData"], labels: ["B1", "NB1", "S1", "NS1", "L0"] },
    media: { focus: ["B2", "D1", "D2", "NB2", "L4", "L3", "L7", "NS2", "S2", "A1", "FI"], flows: ["media", "mediaApp", "mediaFiles"], labels: ["B2", "S2", "A1", "FI", "D1", "D2"] },
    ai: { focus: ["B4", "NB4", "L8", "L1", "NS3", "S3", "AI1", "AI2"], flows: ["ai", "aiTok", "aiTok2"], labels: ["B4", "S3", "AI1", "AI2"] },
    hash: { focus: ["M1", "M2", "M3", "H", "T", "GW", "P", "NT", "NH", "L9", "L4"], flows: ["hashWork", "hashWork2", "hashWork3", "hashPay"], labels: ["M1", "H", "T", "GW", "P"] },
    vpn: { focus: ["D3", "D4", "B5", "R2", "E1", "NET", "NB5", "NE1", "L5"], flows: ["vpnOut", "vpnBack", "vpnPay"], labels: ["B5", "R2", "E1", "NET", "D3", "D4"] },
    relay: { focus: ["B1", "R1", "S1", "NR1", "NR2", "S3", "E1", "S2", "H"], flows: ["payRelay", "find1", "find2"], labels: ["B1", "R1", "S1", "NR1", "NR2"] },
    protect: { focus: ["B1", "NB1", "S1", "NS1", "L5", "L0", "L1", "L6"], flows: ["pay"], labels: ["B1", "S1"] }
  };

  /* ---------- an instance per canvas ---------- */
  function Web(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext("2d");
    this.mode = canvas.getAttribute("data-web") || "ambient";
    this.w = buildWorld();
    this.pulses = []; this.timers = {};
    this.cam = { x: 0, y: 0, z: 0.6 }; this.camT = { x: 0, y: 0, z: 0.6 };
    this.gA = this.mode === "ambient" ? 0.75 : 1; this.gAT = this.gA;
    this.scene = null; this.visible = true; this.running = false; this.last = 0; this.t0 = performance.now();
    var self = this;
    this.resize();
    if (window.ResizeObserver) new ResizeObserver(function () { self.resize(); self.fit(true); self.kick(); }).observe(canvas);
    else window.addEventListener("resize", function () { self.resize(); self.fit(true); self.kick(); });
    if (window.IntersectionObserver && this.mode !== "home") {
      new IntersectionObserver(function (es) { self.visible = es[0].isIntersecting; self.kick(); }).observe(canvas);
    }
    document.addEventListener("visibilitychange", function () { self.kick(); });
    this.setScene(canvas.getAttribute("data-scene") || "overview", true);
  }
  Web.prototype.resize = function () {
    var r = this.cv.getBoundingClientRect(), small = r.width < 700;
    this.dpr = Math.min(window.devicePixelRatio || 1, small ? 1.75 : DPR_CAP);
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
    this.cv.width = Math.round(this.W * this.dpr); this.cv.height = Math.round(this.H * this.dpr);
  };
  /* where the focused part of the web should sit on screen: beside the copy, never under it */
  Web.prototype.stage = function () {
    var W = this.W, H = this.H;
    if (this.mode === "home") {
      if (this.scene === "overview" || this.scene === "dim") return W >= 900 ? { x: 0, y: 0, w: W, h: H * 0.8 } : { x: 0, y: 0, w: W, h: H * 0.62 };
      return W >= 900 ? { x: W * 0.44, y: 70, w: W * 0.54, h: H - 110 } : { x: 0, y: 64, w: W, h: H * 0.4 };
    }
    if (this.mode === "ambient") return W >= 720 ? { x: W * 0.35, y: 0, w: W * 0.65, h: H } : { x: 0, y: 0, w: W, h: H };
    return { x: 0, y: 0, w: W, h: H };
  };
  Web.prototype.fit = function (jump) {
    var sc = SCENES[this.scene] || SCENES.overview, N = this.w.N, ids = sc.focus || Object.keys(N);
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    ids.forEach(function (id) { var n = N[id]; if (!n) return; x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); });
    var pad = sc.focus ? (this.W < 700 ? 150 : 90) : 20, st = this.stage();
    var bw = x1 - x0 + pad * 2, bh = y1 - y0 + pad * 2;
    var z = Math.min(st.w / bw, st.h / bh);
    if (!sc.focus) z = this.mode === "home" ? Math.max(z * 1.15, Math.min(this.W, 1400) / 1500) : z * 1.25;
    z = Math.max(0.28, Math.min(z, 1.9));
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    this.camT = { x: cx - (st.x + st.w / 2 - this.W / 2) / z, y: cy - (st.y + st.h / 2 - this.H / 2) / z, z: z };
    if (jump || still()) this.cam = { x: this.camT.x, y: this.camT.y, z: this.camT.z };
  };
  Web.prototype.setScene = function (name, jump) {
    if (!SCENES[name]) name = "overview";
    if (name === this.scene) return;
    this.scene = name; var sc = SCENES[name], N = this.w.N;
    var focus = sc.focus ? {} : null; (sc.focus || []).forEach(function (id) { focus[id] = 1; });
    var labels = {}; (sc.labels || []).forEach(function (id) { labels[id] = 1; });
    Object.keys(N).forEach(function (id) { var n = N[id]; n.aT = !focus || focus[id] ? 1 : 0.13; n.laT = labels[id] ? 1 : 0; });
    var active = {}; sc.flows.forEach(function (f) { active[f] = 1; }); this.active = active;
    this.gAT = (sc.dim || 1) * (this.mode === "ambient" ? 0.75 : 1);
    this.fit(jump);
    if (jump || still()) { var self = this; Object.keys(N).forEach(function (id) { N[id].a = N[id].aT; N[id].la = N[id].laT; }); this.gA = this.gAT; this.seedPulses(); }
    this.kick();
  };
  /* scatter pulses along the active flows, so a still frame (and the first frame) already shows money moving */
  Web.prototype.seedPulses = function () {
    var self = this; this.pulses = [];
    Object.keys(this.active).forEach(function (f) { for (var i = 0; i < 3; i++) self.pulses.push({ f: f, t: (i + 0.35) / 3.2 }); });
  };
  Web.prototype.kick = function () {
    var on = this.visible && !document.hidden;
    if (still()) { this.frame(performance.now(), true); return; }
    if (on && !this.running) { this.running = true; this.last = performance.now(); var self = this; requestAnimationFrame(function loop(t) { if (!self.visible || document.hidden || still()) { self.running = false; return; } self.frame(t, false); requestAnimationFrame(loop); }); }
  };
  Web.prototype.pos = function (n, t) {
    if (still()) return n;
    var k = t * 0.00022 * n.f; return { x: n.x + Math.sin(k + n.ph) * 5, y: n.y + Math.cos(k * 1.3 + n.ph) * 4 };
  };
  Web.prototype.frame = function (now, isStill) {
    var dt = Math.min(64, now - this.last || 16); this.last = now;
    var c = this.ctx, d = this.dpr, cam = this.cam, T = this.camT, N = this.w.N, self = this;
    var sc = SCENES[this.scene], slow = (sc.slow || 1) * (this.mode === "ambient" ? 1.8 : 1);
    var ease = 1 - Math.pow(0.0022, dt / 1000);   // smooth: most of the way in about a second
    cam.x += (T.x - cam.x) * ease; cam.y += (T.y - cam.y) * ease; cam.z += (T.z - cam.z) * ease;
    if (this.mode === "ambient" && !isStill) cam.x += Math.sin((now - this.t0) / 9000) * 0.05;
    this.gA += (this.gAT - this.gA) * ease;
    var t = now - this.t0, P = {};
    Object.keys(N).forEach(function (id) { var n = N[id]; n.a += (n.aT - n.a) * ease; n.la += (n.laT - n.la) * ease; P[id] = self.pos(n, t); });
    function sx(p) { return ((p.x - cam.x) * cam.z + self.W / 2) * d; }
    function sy(p) { return ((p.y - cam.y) * cam.z + self.H / 2) * d; }

    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.cv.width, this.cv.height);
    c.globalCompositeOperation = "source-over";
    var gA = this.gA, z = cam.z;

    // edges
    var activeEdges = {};
    Object.keys(this.active).forEach(function (f) { var p = FLOWS[f].path; for (var i = 0; i < p.length - 1; i++) activeEdges[p[i] + ">" + p[i + 1]] = activeEdges[p[i + 1] + ">" + p[i]] = FLOWS[f].type; });
    c.lineCap = "round";
    this.w.E.forEach(function (e) {
      var a = Math.min(e.na.a, e.nb.a) * gA; if (a < 0.02) return;
      var pa = P[e.a], pb = P[e.b], hot = sc.focus && activeEdges[e.a + ">" + e.b];
      var x1 = sx(pa), y1 = sy(pa), x2 = sx(pb), y2 = sy(pb);
      c.beginPath();
      if (e.type === "link" || e.type === "relay") {
        // links bow gently, so they read apart from Lightning's straight channels
        var mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, k = e.type === "link" ? 0.16 : 0.08;
        c.moveTo(x1, y1); c.quadraticCurveTo(mx - dy * k, my + dx * k, x2, y2); e.cx = mx - dy * k; e.cy = my + dx * k;
      } else { c.moveTo(x1, y1); c.lineTo(x2, y2); }
      var col, w = 1;
      if (e.type === "chan" || e.type === "own") { col = "rgba(255,255,255," + (0.16 * a) + ")"; }
      else if (e.type === "link") { col = "rgba(159,216,255," + (0.30 * a) + ")"; c.setLineDash([2 * d, 6 * d]); }
      else if (e.type === "relay") { col = "rgba(127,185,255," + (0.34 * a) + ")"; c.setLineDash([5 * d, 5 * d]); }
      else if (e.type === "find") { col = "rgba(197,140,255," + (0.26 * a) + ")"; c.setLineDash([1 * d, 6 * d]); }
      else if (e.type === "work" || e.type === "svc") { col = rgba(K[e.na.kind === "shop" ? e.nb.kind : e.na.kind].c, 0.32 * a); }
      else { col = "rgba(159,216,255," + (0.24 * a) + ")"; }
      if (hot) { col = rgba(FLOW_C[hot], 0.55 * a); w = 1.6; }
      c.strokeStyle = col; c.lineWidth = w * d; c.stroke(); c.setLineDash([]);
    });

    // pulses
    if (!isStill) {
      Object.keys(this.active).forEach(function (f) {
        self.timers[f] = (self.timers[f] || Math.random() * FLOWS[f].every) - dt;
        if (self.timers[f] <= 0) { self.timers[f] = FLOWS[f].every * slow * (0.8 + Math.random() * 0.4); self.pulses.push({ f: f, t: 0 }); }
      });
    }
    c.globalCompositeOperation = "lighter";
    var keep = [];
    this.pulses.forEach(function (p) {
      var fl = FLOWS[p.f], path = fl.path, segs = [], L = 0;
      for (var i = 0; i < path.length - 1; i++) { var A = P[path[i]], B = P[path[i + 1]], l = Math.hypot(B.x - A.x, B.y - A.y); segs.push([A, B, l]); L += l; }
      if (!isStill) p.t += (dt * (fl.type === "data" ? 0.24 : fl.type === "work" ? 0.2 : 0.15) / slow) / L * (fl.type === "data" ? 1.6 : 1) * 0.9;
      if (p.t >= 1) return;
      var on = self.active[p.f] ? 1 : 0; p.a = (p.a == null ? on : p.a + (on - p.a) * ease);
      if (p.a < 0.02 && !on) return;
      keep.push(p);
      var spr = pulseSprite(fl.type), size = (fl.type === "sats" ? 30 : 22) * Math.max(0.55, Math.min(z, 1.3)) * d;
      for (var j = 0; j < 4; j++) {
        var tt = p.t - j * (0.012 + 6 / L); if (tt < 0) break;
        var s = tt * L, q = null;
        for (var k = 0; k < segs.length; k++) { if (s <= segs[k][2]) { var u = s / segs[k][2]; q = { x: segs[k][0].x + (segs[k][1].x - segs[k][0].x) * u, y: segs[k][0].y + (segs[k][1].y - segs[k][0].y) * u }; break; } s -= segs[k][2]; }
        if (!q) break;
        var na = Math.min(N[path[0]].a, N[path[path.length - 1]].a);
        c.globalAlpha = Math.max(0, (1 - j * 0.3) * gA * p.a * (0.35 + 0.65 * na));
        var sz = size * (1 - j * 0.2);
        c.drawImage(spr, sx(q) - sz / 2, sy(q) - sz / 2, sz, sz);
      }
    });
    this.pulses = keep;
    c.globalAlpha = 1;

    // nodes
    c.globalCompositeOperation = "source-over";
    var ids = Object.keys(N);
    ids.forEach(function (id) {
      var n = N[id], a = n.a * gA; if (a < 0.02) return;
      var k = K[n.kind], spr = sprite(n.kind), p = P[id];
      var rad = k.r * Math.max(0.55, Math.min(z, 1.6)) * (n.kind === "node" ? 1 : 1.7);
      var s = rad * (SPR / (k.ring ? CORE : 7)) * d;
      if (n.kind === "node") { var tw = 0.75 + 0.25 * Math.sin(t * 0.0012 * n.f + n.ph); c.globalAlpha = a * (isStill ? 0.9 : tw); }
      else c.globalAlpha = a;
      c.drawImage(spr, sx(p) - s / 2, sy(p) - s / 2, s, s);
    });
    // labels
    c.globalAlpha = 1;
    c.font = "500 " + Math.round(12.5 * d) + "px Inter, system-ui, sans-serif"; c.textAlign = "center"; c.textBaseline = "top";
    ids.forEach(function (id) {
      var n = N[id]; if (n.la < 0.03 || !n.label) return;
      var p = P[id], k = K[n.kind], off = (k.r * Math.max(0.55, Math.min(z, 1.6)) * (k.ring ? 1.7 : 1) + 8) * d;
      c.globalAlpha = n.la * gA;
      c.fillStyle = "rgba(5,5,7,0.7)"; var tw2 = c.measureText(n.label).width;
      c.fillRect(sx(p) - tw2 / 2 - 5 * d, sy(p) + off - 3 * d, tw2 + 10 * d, 19 * d);
      c.fillStyle = n.kind === "node" ? "rgba(255,255,255,0.7)" : k.c;
      c.fillText(n.label, sx(p), sy(p) + off);
    });
    c.globalAlpha = 1;
  };

  /* ---------- wiring ---------- */
  var webs = [];
  function init() {
    document.documentElement.classList.add("js");
    // The web is decoration: start it once the page has painted and the browser is idle, so it never delays the
    // first paint or a click; a prerendered page starts it only when it is actually shown.
    if (document.prerendering) { document.addEventListener("prerenderingchange", function () { idle(start); }, { once: true }); return; }
    idle(start);
  }
  function idle(f) { if (window.requestIdleCallback) requestIdleCallback(f, { timeout: 500 }); else setTimeout(f, 50); }
  function start() {
    var list = document.querySelectorAll("canvas[data-web]");
    for (var i = 0; i < list.length; i++) webs.push(new Web(list[i]));
    var home = webs.filter(function (w) { return w.mode === "home"; })[0];
    if (home && window.IntersectionObserver) {
      var secs = document.querySelectorAll("[data-scene]:not(canvas)");
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) home.setScene(e.target.getAttribute("data-scene")); });
      }, { rootMargin: "-48% 0px -48% 0px" });
      for (var j = 0; j < secs.length; j++) io.observe(secs[j]);
    }
    if (reduce && reduce.addEventListener) reduce.addEventListener("change", function () { webs.forEach(function (w) { w.fit(true); w.seedPulses(); w.kick(); }); });
  }
  window.LSWeb = { webs: webs, K: K };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();

/* The live listings page: reads /api/listings and draws a card per shop, hashrate offer, VPN exit and relay.
   Everything from a listing goes into the page as text (textContent), never as markup. */
(function () {
  "use strict";
  var DEMO = "npub1kqdrfmfg6mg52sy3ehu4vv7m3fjpa0830rhjdmvqrf09u3t3724q8cwr6a"; // Lightning Stream Genesis
  var KIND = { video: "Video", app: "Web app", files: "Files", ai: "AI", hashrate: "Hashrate", api: "Web service" };
  var state = { f: "all", stale: false, data: null };
  var grid, statusEl;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function ago(t) {
    var s = Math.max(0, Math.floor(Date.now() / 1000) - t);
    if (s < 90) return "just now"; if (s < 5400) return Math.round(s / 60) + " min ago";
    if (s < 172800) return Math.round(s / 3600) + " h ago"; return Math.round(s / 86400) + " days ago";
  }
  function ths(h) { return h >= 1e12 ? (h / 1e12).toFixed(2) + " TH/s" : h >= 1e9 ? (h / 1e9).toFixed(1) + " GH/s" : Math.round(h) + " H/s"; }
  function copyBox(text) {
    var box = el("div", "copy"), code = el("code", null, text), b = el("button", null, "Copy");
    b.type = "button"; box.appendChild(code);
    if (navigator.clipboard) {
      box.appendChild(b);
      b.addEventListener("click", function () { navigator.clipboard.writeText(text).then(function () { b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy"; }, 1600); }); });
    }
    return box;
  }
  function kindTag(k, label) { return el("span", "kind kind-" + k, label || KIND[k] || k); }
  function foot(card, left, right) { var f = el("div", "foot"); f.appendChild(left); if (right) f.appendChild(right); card.appendChild(f); }
  function checked(ok, what) { return el("span", ok ? "check" : "check-no", (ok ? "✓ " : "⚠ ") + what); }

  function shopCard(s) {
    var card = el("article", "listing" + (s.npub === DEMO ? " featured" : ""));
    if (s.npub === DEMO) card.appendChild(el("span", "tag tag-volt", "Demo shop: try it"));
    card.appendChild(el("h3", null, s.name));
    var kinds = el("div", "kinds"), seen = {};
    s.services.forEach(function (x) { var k = x.kind === "video" ? "app" : x.kind; if (!seen[k]) { seen[k] = 1; kinds.appendChild(kindTag(k)); } });
    card.appendChild(kinds);
    var ul = el("ul", "prices");
    s.services.forEach(function (x) {
      if (x.kind === "app" && s.services.some(function (y) { return y !== x && y.name === x.name && y.kind !== "app"; })) return;
      var li = el("li"); li.appendChild(el("b", null, x.name || KIND[x.kind] || x.kind)); li.appendChild(document.createTextNode(": " + (x.prices.join(", ") || "price on asking")));
      if (x.titles && x.titles.length && x.kind !== "app") li.appendChild(el("span", "who", " · " + x.titles.slice(0, 3).join(", ") + (x.items > 3 ? " and " + (x.items - 3) + " more" : "")));
      ul.appendChild(li);
    });
    card.appendChild(ul);
    if (s.reached === "key") { card.appendChild(el("div", "who", "Reached by its key, with no web address. Shop key:")); card.appendChild(copyBox(s.npub)); }
    else card.appendChild(el("div", "who", "Web address: " + s.origin));
    var left = el("span", null, (s.stale ? "Last seen " : "Published ") + ago(s.published_at) + (s.seen_on.length ? " · on " + s.seen_on.join(", ") : ""));
    foot(card, left, checked(s.checks.listing && s.checks.bind, s.checks.listing && s.checks.bind ? "Signatures checked" : "Signature did not check"));
    return card;
  }
  function hashCard(h) {
    var card = el("article", "listing");
    card.appendChild(el("h3", null, h.name));
    var kinds = el("div", "kinds"); kinds.appendChild(kindTag("hashrate")); if (h.algorithm) kinds.appendChild(el("span", "kind", h.algorithm)); card.appendChild(kinds);
    var ul = el("ul", "prices");
    [["Price", h.price + (h.start_slices ? ", plus a start fee of " + h.start_slices + " slices" : "")], ["Offered", ths(h.hashrate_hs)], ["Miners", h.free_miners + " of " + h.miners + " free when published"]].forEach(function (r) {
      var li = el("li"); li.appendChild(el("b", null, r[0])); li.appendChild(document.createTextNode(": " + r[1])); ul.appendChild(li);
    });
    card.appendChild(ul);
    card.appendChild(el("div", "who", "Rented into your own Stream Gateway, with masked jobs, paid as the work arrives. Find it in the app under Services → Hashrate."));
    foot(card, el("span", null, "Published " + ago(h.published_at)), checked(true, "Link key checked"));
    return card;
  }
  function exitCard(x) {
    var card = el("article", "listing");
    card.appendChild(el("h3", null, "VPN exit" + (x.region ? " · " + x.region : "")));
    var kinds = el("div", "kinds"); kinds.appendChild(kindTag("vpn", "VPN exit")); kinds.appendChild(el("span", "kind", x.filtered ? "Filtered" : "Private")); card.appendChild(kinds);
    var ul = el("ul", "prices");
    [["Price", x.price], ["Country", x.region ? x.region + " as the operator says; your app checks it before a rule that names a country uses it" : "not given"],
     ["Logs", x.logs ? "the operator says it keeps logs" : "none, in the operator's word"], ["Ports refused", x.blocked_ports.length ? x.blocked_ports.join(", ") : "none"]].forEach(function (r) {
      var li = el("li"); li.appendChild(el("b", null, r[0])); li.appendChild(document.createTextNode(": " + r[1])); ul.appendChild(li);
    });
    card.appendChild(ul);
    if (x.shop_npub) { card.appendChild(el("div", "who", "Sold by the shop with key:")); card.appendChild(copyBox(x.shop_npub)); }
    foot(card, el("span", null, "Published " + ago(x.published_at)), checked(true, "Exit key checked"));
    return card;
  }
  function relayCard(r) {
    var card = el("article", "listing");
    card.appendChild(el("h3", null, r.relay));
    var kinds = el("div", "kinds"); kinds.appendChild(kindTag("relay", "Stream relay")); card.appendChild(kinds);
    var ul = el("ul", "prices");
    [["Region", r.region || "not given"], ["Capacity", r.capacity_mbit ? r.capacity_mbit + " Mbit/s, the operator's estimate" : "not given"], ["Price", "free"]].forEach(function (x) {
      var li = el("li"); li.appendChild(el("b", null, x[0])); li.appendChild(document.createTextNode(": " + x[1])); ul.appendChild(li);
    });
    card.appendChild(ul);
    foot(card, el("span", null, "Announced " + ago(r.published_at)), null);
    return card;
  }

  function matches(item, f) {
    if (f === "all") return true;
    if (item.type === "shop") return item.services.some(function (s) { return f === "app" ? (s.kind === "app" || s.kind === "video") : s.kind === f; });
    return ({ hashrate: "hashrate", exit: "vpn", relay: "relay" })[item.type] === f;
  }
  function render() {
    var d = state.data; if (!d) return;
    var items = [].concat(d.shops, d.hashrate, d.exits, d.relays_announced);
    var visible = items.filter(function (i) { return state.stale || !i.stale; });
    ["all", "app", "files", "ai", "hashrate", "vpn", "relay"].forEach(function (f) {
      var c = document.querySelector('[data-c="' + f + '"]'); if (c) c.textContent = visible.filter(function (i) { return matches(i, f); }).length;
    });
    var st = document.querySelector('[data-c="stale"]'); if (st) st.textContent = items.filter(function (i) { return i.stale; }).length;
    var list = visible.filter(function (i) { return matches(i, state.f); });
    // the demo shop first, then as the Worker ordered them (fresh first, newest first)
    list.sort(function (a, b) { return (b.npub === DEMO) - (a.npub === DEMO); });
    grid.textContent = "";
    if (!list.length) { grid.appendChild(el("div", "empty", "Nothing of this kind is listed right now.")); return; }
    list.forEach(function (i) { grid.appendChild(i.type === "shop" ? shopCard(i) : i.type === "hashrate" ? hashCard(i) : i.type === "exit" ? exitCard(i) : relayCard(i)); });
  }
  function load() {
    fetch("/api/listings", { headers: { accept: "application/json" } }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(function (d) {
      state.data = d;
      var ok = d.relays.filter(function (r) { return r.ok; }).length;
      statusEl.textContent = "Read " + ago(d.fetched_at) + " from " + ok + " of " + d.relays.length + " relays";
      render();
    }).catch(function () {
      statusEl.textContent = "The live listings could not be loaded just now.";
      grid.textContent = ""; grid.appendChild(el("div", "empty", "The listings could not be loaded. Try again in a minute."));
    });
  }
  function init() {
    grid = document.getElementById("listings"); statusEl = document.getElementById("status");
    if (!grid) return;
    document.querySelectorAll(".filters [data-f]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.f = b.getAttribute("data-f");
        document.querySelectorAll(".filters [data-f]").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        render();
      });
    });
    var sb = document.querySelector(".filters [data-stale]");
    if (sb) sb.addEventListener("click", function () { state.stale = !state.stale; sb.setAttribute("aria-pressed", state.stale ? "true" : "false"); render(); });
    grid.appendChild(el("div", "empty", "Loading the latest listings…"));
    load();
    setInterval(load, 120000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();

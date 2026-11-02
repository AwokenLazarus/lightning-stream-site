/* Fills the homepage's live figures from this site's /api/ (cached JSON served by the site's Worker).
   Without the API, or with scripts off, the figures stay as dashes. */
(function () {
  "use strict";
  function set(k, v) { var el = document.querySelector('[data-live="' + k + '"]'); if (el && v != null) el.textContent = Number(v).toLocaleString("en-US"); }
  function get(u) { return fetch(u, { headers: { accept: "application/json" } }).then(function (r) { if (!r.ok) throw r.status; return r.json(); }); }
  function go() {
    if (!document.querySelector("[data-live]")) return;
    get("/api/summary").then(function (s) {
      set("shops", s.shops); set("services", s.services); set("exits", s.exits);
      set("nodes", s.graph ? s.graph.nodes : null); set("channels", s.graph ? s.graph.channels : null);
    }).catch(function () {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();

/* Small things every page shares: reveal on scroll, copy buttons, the table of contents, the menu. */
(function () {
  "use strict";
  var d = document;
  d.documentElement.classList.add("js");

  function ready(f) { if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", f); else f(); }

  ready(function () {
    // reveal blocks as they come into view
    var rv = d.querySelectorAll(".reveal");
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
      }, { rootMargin: "0px 0px -8% 0px" });
      for (var i = 0; i < rv.length; i++) io.observe(rv[i]);
    } else for (var j = 0; j < rv.length; j++) rv[j].classList.add("in");

    // copy buttons: <div class="copy"><code>text</code><button hidden>Copy</button></div>
    d.querySelectorAll(".copy").forEach(function (box) {
      var b = box.querySelector("button"), code = box.querySelector("code");
      if (!b || !code || !navigator.clipboard) return;
      b.hidden = false;
      b.addEventListener("click", function () {
        navigator.clipboard.writeText(code.textContent.trim()).then(function () {
          var t = b.textContent; b.textContent = "Copied"; setTimeout(function () { b.textContent = t; }, 1600);
        });
      });
    });

    // close the phone menu after a choice
    d.querySelectorAll(".menu a").forEach(function (a) { a.addEventListener("click", function () { var m = a.closest("details"); if (m) m.open = false; }); });

    // highlight the section being read in the table of contents
    var toc = d.querySelectorAll(".toc a[href^='#']");
    if (toc.length && "IntersectionObserver" in window) {
      var map = {};
      toc.forEach(function (a) { var t = d.getElementById(decodeURIComponent(a.getAttribute("href").slice(1))); if (t) map[t.id] = a; });
      var on = null;
      var io2 = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting && map[e.target.id]) { if (on) on.classList.remove("on"); on = map[e.target.id]; on.classList.add("on"); }
        });
      }, { rootMargin: "-20% 0px -70% 0px" });
      Object.keys(map).forEach(function (id) { io2.observe(d.getElementById(id)); });
    }
  });
})();

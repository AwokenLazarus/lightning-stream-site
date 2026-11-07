#!/usr/bin/env node
// Stamps the shared header and footer into every page under site/, between the markers
//   <!-- chrome:header --> ... <!-- /chrome:header -->   and   <!-- chrome:footer --> ... <!-- /chrome:footer -->
// and marks the current section in the navigation. Run after editing the header or footer here:
//   node scripts/chrome.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "site");
export const VERSION = "0.2.15";

const NAV = [
  ["/how-it-works/", "How it works"],
  ["/guide/", "Guide"],
  ["/shops/", "Shops"],
  ["/map/", "Network map"],
  ["/changelog/", "Changelog"],
  ["/whitepaper/", "Whitepaper"],
  ["/about/", "About"],
];

export const mark = (id = "ls-g") => `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff7cc"/><stop offset=".55" stop-color="#ffd60a"/><stop offset="1" stop-color="#ff9f1c"/></linearGradient></defs><circle cx="16" cy="16" r="15" fill="#0b0c10" stroke="#ffd60a" stroke-opacity=".38"/><circle cx="16" cy="1" r="1.6" fill="#9fd8ff"/><circle cx="3" cy="23.5" r="1.6" fill="#9fd8ff"/><circle cx="29" cy="23.5" r="1.6" fill="#9fd8ff"/><path d="M18.6 5 9.8 17.6h5.9l-2.1 9.6 9.4-13.2h-6.1z" fill="url(#${id})"/></svg>`;

// Speculation Rules: the browser fetches (prefetch) or fully prepares (prerender) a page when a person shows
// intent (hovering a link for a moment, or pressing on it), so the click shows it at once. The main navigation and
// the buttons are prerendered; any other link on the site is prefetched. /api/ is never touched.
// The script is inline, so its hash goes into the CSP in site/_headers (written below).
const RULES = JSON.stringify({
  prerender: [{ where: { and: [{ href_matches: "/*" }, { not: { href_matches: "/api/*" } }, { selector_matches: ".nav a, .menu-panel a, a.brand, a.btn" }] }, eagerness: "moderate" }],
  prefetch: [{ where: { and: [{ href_matches: "/*" }, { not: { href_matches: "/api/*" } }] }, eagerness: "moderate" }],
});
export const SPECULATION = `<script type="speculationrules">${RULES}</script>`;
export const SPECULATION_HASH = "sha256-" + createHash("sha256").update(RULES).digest("base64");

function header(path) {
  const cur = (href) => (href === "/" ? path === "/" : path.startsWith(href)) ? ' aria-current="page"' : "";
  const items = NAV.map(([h, t]) => `<li><a href="${h}"${cur(h)}>${t}</a></li>`).join("");
  return `<!-- chrome:header -->
${SPECULATION}
<a class="skip" href="#main">Skip to content</a>
<header class="site-head">
  <div class="wrap">
    <a class="brand" href="/" aria-label="Lightning Stream, home">${mark()}<span>Lightning Stream</span></a>
    <nav class="nav" aria-label="Main"><ul>${items}</ul><a class="btn btn-volt btn-sm nav-cta" href="/download/"${cur("/download/")}>Download</a></nav>
    <details class="menu"><summary>Menu</summary><nav class="menu-panel" aria-label="Main"><ul>${items}<li><a href="/download/"${cur("/download/")}>Download</a></li></ul><a class="btn btn-volt" href="/download/">Download ${VERSION}</a></nav></details>
  </div>
</header>
<!-- /chrome:header -->`;
}

function footer() {
  const y = new Date().getUTCFullYear();
  return `<!-- chrome:footer -->
<footer class="site-foot">
  <div class="wrap">
    <div class="foot-grid">
      <div class="foot-brand">
        <a class="brand" href="/">${mark("ls-g2")}<span>Lightning Stream</span></a>
        <p>Peer-to-peer streaming and payments for services, on Lightning, on top of Bitcoin. Paid as you use them. No accounts, no custody.</p>
      </div>
      <nav aria-label="Product"><h2>Product</h2><ul>
        <li><a href="/download/">Download</a></li><li><a href="/guide/">Guide</a></li><li><a href="/how-it-works/">How it works</a></li><li><a href="/changelog/">Changelog</a></li></ul></nav>
      <nav aria-label="Live"><h2>Live</h2><ul>
        <li><a href="/shops/">Shops and services</a></li><li><a href="/map/">Network map</a></li></ul></nav>
      <nav aria-label="Papers"><h2>Papers</h2><ul>
        <li><a href="/whitepaper/">Whitepaper</a></li><li><a href="/whitepaper/design/">Design details</a></li><li><a href="/whitepaper/tests/">Tests and numbers</a></li><li><a href="/whitepaper/progress/">Progress and status</a></li><li><a href="/whitepaper/uses/">Uses</a></li></ul></nav>
      <nav aria-label="Project"><h2>Project</h2><ul>
        <li><a href="/about/">About</a></li><li><a href="https://github.com/AwokenLazarus/Lightning-Stream">Source on GitHub</a></li><li><a href="https://github.com/AwokenLazarus/Lightning-Stream/issues">Report an issue</a></li><li><a href="https://github.com/AwokenLazarus/Lightning-Stream/blob/main/docs/LIMITS.md">Known limits</a></li><li><a href="/about/#support">Donate</a></li></ul></nav>
    </div>
    <div class="foot-base">
      <p>Early, unaudited software. Use small amounts you can afford to lose.</p>
      <p>XBT is Bitcoin&rsquo;s ticker. Bitcoin is secured by BLAKE2b proof of work. Code under MIT or Apache-2.0. &copy; ${y} Lightning Stream contributors.</p>
    </div>
  </div>
</footer>
<!-- /chrome:footer -->`;
}

function pages(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "assets" ? [] : pages(p);
    return f.endsWith(".html") ? [p] : [];
  });
}

export function stamp(html, path) {
  return html
    .replace(/<!-- chrome:header -->[\s\S]*?<!-- \/chrome:header -->/, header(path))
    .replace(/<!-- chrome:footer -->[\s\S]*?<!-- \/chrome:footer -->/, footer());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let n = 0;
  for (const file of pages(root)) {
    const rel = "/" + relative(root, file).replace(/index\.html$/, "").replace(/\\/g, "/");
    const before = readFileSync(file, "utf8");
    if (!before.includes("<!-- chrome:header -->")) continue;
    const after = stamp(before, rel === "/404.html" ? "/404" : rel);
    if (after !== before) { writeFileSync(file, after); n++; }
  }
  console.log(`chrome: stamped ${n} page(s)`);
  // the CSP allows exactly this inline script, by its hash
  const hp = join(root, "_headers"), h = readFileSync(hp, "utf8");
  const h2 = h.replace(/script-src 'self'( 'sha256-[A-Za-z0-9+/=]+')?/, `script-src 'self' '${SPECULATION_HASH}'`);
  if (h2 !== h) { writeFileSync(hp, h2); console.log("chrome: CSP allows the speculation rules by hash"); }
}

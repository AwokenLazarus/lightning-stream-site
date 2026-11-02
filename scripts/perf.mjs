#!/usr/bin/env node
// Navigation timing as a person clicks through the site: load the home page, then click each main nav link
// in turn. For each page: TTFB (responseStart), first contentful paint, and the time from the click to that
// paint. Also the response's cf-cache-status. Run twice so the second pass shows warm edge caches.
//   [LATENCY=150] node scripts/perf.mjs <base-url> [rounds]
import { chromium } from "playwright-core";
const base = (process.argv[2] || "https://lightning-stream.com").replace(/\/$/, "");
const rounds = Number(process.argv[3] || 2);
const PATHS = ["/how-it-works/", "/guide/", "/shops/", "/map/", "/changelog/", "/whitepaper/", "/about/", "/download/", "/"];
const b = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome" });
for (let r = 1; r <= rounds; r++) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  // LATENCY=150 emulates a client that far from the edge (added to every round trip)
  if (process.env.LATENCY) { const cdp = await ctx.newCDPSession(page); await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: Number(process.env.LATENCY), downloadThroughput: -1, uploadThroughput: -1 }); }
  let status = "";
  page.on("response", (res) => { if (res.request().isNavigationRequest()) status = res.headers()["cf-cache-status"] || "-"; });
  await page.goto(base + "/", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const rows = [];
  for (const p of PATHS) {
    const sel = `.nav a[href="${p}"], .brand[href="${p}"]`;
    // as a person does: the pointer rests on the link a moment (HOVER ms, default 300), then clicks
    await page.hover(sel); await page.waitForTimeout(Number(process.env.HOVER ?? 300));
    const t0 = await page.evaluate(() => performance.timeOrigin + performance.now());
    await Promise.all([page.waitForURL(base + p, { waitUntil: "load" }), page.click(sel)]);
    const m = await page.evaluate(async () => {
      await new Promise((ok) => { const f = () => performance.getEntriesByName("first-contentful-paint").length ? ok() : setTimeout(f, 20); f(); });
      const n = performance.getEntriesByType("navigation")[0], fcp = performance.getEntriesByName("first-contentful-paint")[0].startTime;
      return { origin: performance.timeOrigin, ttfb: n.responseStart, fcp, type: n.deliveryType || "", act: n.activationStart || 0 };
    });
    rows.push({ p, ttfb: Math.round(m.ttfb - m.act), fcp: Math.round(Math.max(0, m.fcp - m.act)), click: Math.round(m.origin + Math.max(m.fcp, m.act) - t0), cache: status, pre: m.type || (m.act ? "prerender" : "") });
    await page.waitForTimeout(700);
  }
  const avg = (k) => Math.round(rows.reduce((s, x) => s + x[k], 0) / rows.length);
  console.log(`round ${r}: ` + rows.map((x) => `${x.p} ttfb ${x.ttfb} fcp ${x.fcp} click→paint ${x.click} [${x.cache}${x.pre ? " " + x.pre : ""}]`).join("\n         "));
  console.log(`  average: ttfb ${avg("ttfb")} ms, fcp ${avg("fcp")} ms, click→paint ${avg("click")} ms`);
  await ctx.close();
}
await b.close();

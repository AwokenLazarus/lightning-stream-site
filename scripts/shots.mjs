#!/usr/bin/env node
// Screenshots and quick checks of every main page, at desktop and phone widths, in headless Chrome.
//   node scripts/shots.mjs [base-url] [out-dir]
// Checks: console errors and failed requests, horizontal overflow, cumulative layout shift, images
// without alt, and the time to first contentful paint. Prints one line per page and width; exits 1
// when a check fails. Needs playwright-core (npm i) and Chrome at CHROME (default /usr/bin/google-chrome).
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = (process.argv[2] || "http://127.0.0.1:8788").replace(/\/$/, "");
const out = process.argv[3] || new URL("../shots/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const PAGES = [
  ["home", "/"], ["download", "/download/"], ["guide", "/guide/"], ["how-it-works", "/how-it-works/"],
  ["changelog", "/changelog/"], ["whitepaper", "/whitepaper/"], ["design", "/whitepaper/design/"],
  ["tests", "/whitepaper/tests/"], ["progress", "/whitepaper/progress/"], ["uses", "/whitepaper/uses/"],
  ["about", "/about/"], ["shops", "/shops/"], ["map", "/map/"], ["404", "/no-such-page/"],
].filter(([n]) => !process.env.ONLY || process.env.ONLY.split(",").includes(n));
const SIZES = [["desktop", { width: 1440, height: 900 }, 1], ["phone", { width: 390, height: 844 }, 3]];

const browser = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
let bad = 0;
for (const [sizeName, viewport, dpr] of SIZES) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, reducedMotion: process.env.REDUCED ? "reduce" : "no-preference" });
  for (const [name, path] of PAGES) {
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("requestfailed", (r) => errors.push("failed " + r.url()));
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    });
    const res = await page.goto(base + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(name === "map" || name === "shops" ? 2500 : 1200);
    const m = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      cls: window.__cls,
      fcp: (performance.getEntriesByName("first-contentful-paint")[0] || {}).startTime || 0,
      noAlt: [...document.images].filter((i) => !i.hasAttribute("alt")).length,
      h1: document.querySelectorAll("h1").length,
    }));
    const status = res ? res.status() : 0;
    const ok = (status === 200 || (name === "404" && status === 404)) && m.overflow <= 1 && m.cls < 0.1 && !m.noAlt && m.h1 === 1 && !errors.length;
    if (!ok) bad++;
    console.log(`${ok ? "ok " : "BAD"} ${sizeName.padEnd(7)} ${name.padEnd(13)} status=${status} overflow=${m.overflow} cls=${m.cls.toFixed(3)} fcp=${Math.round(m.fcp)}ms h1=${m.h1}${errors.length ? " errors=" + JSON.stringify(errors.slice(0, 3)) : ""}`);
    if (name !== "home" && name !== "map") {
      // walk down the page so every reveal-on-scroll block has shown, then back to the top
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += innerHeight * 0.6) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 140)); } scrollTo(0, 0); });
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: `${out}/${name}-${sizeName}.png`, fullPage: name !== "home" && name !== "map" });
    if (name === "about") { const h = await page.$("#support"); if (h) { await page.evaluate(() => { const e = document.getElementById("support"); scrollTo(0, e.getBoundingClientRect().top + scrollY - 90); }); await page.waitForTimeout(700); await page.screenshot({ path: `${out}/about-${sizeName}-support.png` }); } }
    if (name === "map") { const shell = await page.$(".map-shell"); if (shell) { await shell.scrollIntoViewIfNeeded(); await page.waitForTimeout(800); await shell.screenshot({ path: `${out}/map-${sizeName}-canvas.png` }); } }
    if (name === "home") {
      // the homepage's scenes: one shot per chapter, as the web focuses on each part
      const phone = viewport.width < 900;
      const scenes = await page.$$eval("main [data-scene]", (els, ph) => els.map((e) => [e.getAttribute("data-scene"), e.getBoundingClientRect().top + scrollY + (ph ? innerHeight * 0.55 : e.offsetHeight / 2)]), phone);
      const seen = new Set();
      for (const [scene, y] of scenes) {
        if (seen.has(scene)) continue; seen.add(scene);
        await page.evaluate((yy) => window.scrollTo(0, yy - innerHeight / 2), y);
        await page.waitForTimeout(1800);
        await page.screenshot({ path: `${out}/home-${sizeName}-scene-${scene}.png` });
      }
    }
    await page.close();
  }
  await ctx.close();
}
await browser.close();
process.exit(bad ? 1 : 0);

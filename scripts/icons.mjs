#!/usr/bin/env node
// Renders site/apple-touch-icon.png (180x180, from favicon.svg) and site/assets/og.png (1200x630, the
// homepage hero) with headless Chrome. Needs a local server on the base URL: node scripts/icons.mjs [base]
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const base = (process.argv[2] || "http://127.0.0.1:8788").replace(/\/$/, "");
const root = new URL("../site/", import.meta.url).pathname;
const b = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome" });
const p = await b.newPage({ viewport: { width: 180, height: 180 } });
const svg = readFileSync(root + "favicon.svg", "utf8");
await p.setContent(`<body style="margin:0;background:#050507;display:grid;place-items:center;height:180px">${svg.replace("<svg", '<svg width="150" height="150"')}</body>`);
await p.screenshot({ path: root + "apple-touch-icon.png" });
const o = await b.newPage({ viewport: { width: 1200, height: 630 }, reducedMotion: "reduce" });
await o.goto(base + "/");
await o.addStyleTag({ content: ".site-head,.hero-note,.scroll-cue,.btn-row{display:none!important}.hero{min-height:630px}" });
await o.waitForTimeout(800);
await o.screenshot({ path: root + "assets/og.png" });
await b.close();
console.log("icons: apple-touch-icon.png, assets/og.png");

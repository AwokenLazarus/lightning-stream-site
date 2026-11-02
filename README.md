# lightning-stream.com

The website for Lightning Stream: buy and sell services over XBT Lightning, paid as they're used.
Static pages plus a small Worker that serves cached JSON under `/api/` for the live listings and the
network map. Hosted on Cloudflare Pages, project `lightning-stream-site`.

**Status:** previews deploy to <https://preview.lightning-stream-site.pages.dev> (Pages marks
previews `noindex` itself). Production (`--branch main`, lightning-stream.com and www) is the next step.
The planned 301s from lazarus-xbt.xyz are in `REDIRECTS.md`, not applied.

## Layout

| Path | What |
|---|---|
| `site/` | The pages, as deployed. Plain HTML, one stylesheet (`assets/site.css`), small vanilla scripts. No framework; the only outside load is Cloudflare's cookieless Web Analytics beacon (allowed in the CSP in `site/_headers`). |
| `site/assets/web.js` | The node web: buyers, shops and services joined by channels and links, with payments as pulses of light. The homepage's scroll scenes, and the quiet background on other pages. Still frame with `prefers-reduced-motion`, Save-Data or a low-power device. |
| `site/assets/shops.js`, `site/assets/map.js` | The live pages: listings, and the network map. |
| `site/assets/paper.css` | Figure styles for the whitepaper pages migrated from lazarus-xbt.xyz/stream/. |
| `site/_worker.js`, `site/_routes.json` | Pages advanced mode: bundles `worker/src/index.js`; runs for `/api/*` only. |
| `worker/src/` | The API Worker: `index.js` (routes, Nostr fetch, KV cache), `parse.js` (reading and checking listings), `graph.js` (graph snapshots). |
| `worker/test/` | `npm test`: the parser against real relay events (fixture of 2026-11-02) and a synthetic graph. |
| `scripts/build.sh` | Regenerates the changelog page and the migrated papers, then stamps the shared header and footer. |
| `scripts/changelog.py` | `site/changelog/` from Lightning-Stream's `CHANGELOG.md` (default `../lightning-stream/CHANGELOG.md`, or `CHANGELOG=`). |
| `scripts/migrate_papers.py` | The whitepaper, design, tests, progress and uses pages from the old `/stream/` pages (`PAPERS=` path to `cloudflare/map-site/public/stream` in an AwokenLazarus/Bitcoin checkout). |
| `scripts/chrome.mjs` | The shared header and footer, stamped between `<!-- chrome:… -->` markers. Edit them here. |
| `scripts/publish_graph.py` | The graph publisher (below). |
| `scripts/shots.mjs`, `scripts/icons.mjs` | Headless-Chrome screenshots and checks; the touch icon and social image. |
| `REDIRECTS.md` | Old lazarus-xbt.xyz/stream/* paths → new paths. Not applied. |

## Build and check

```sh
npm install                 # playwright-core and @noble/* (the Worker's signature checks)
scripts/build.sh            # after a new CHANGELOG.md, or after editing the header/footer
npm test                    # Worker parser and graph tests
wrangler pages dev --port 8789          # local site + Worker + local KV (.dev.vars holds a test GRAPH_TOKEN)
node scripts/shots.mjs http://127.0.0.1:8789 shots   # screenshots at 1440 and 390 px, plus checks
```

`shots.mjs` reports per page and width: HTTP status, horizontal overflow, cumulative layout shift,
first contentful paint, images without alt, one `h1`, and console errors. `REDUCED=1` runs it with
reduced motion; `ONLY=home,map` limits it.

## Deploy (preview)

Use wrangler's own login (`wrangler login`), with `CLOUDFLARE_ACCOUNT_ID` set to the account that owns the project:

```sh
wrangler pages deploy --branch preview    # previews
wrangler pages deploy --branch main       # production: lightning-stream.com
```

`wrangler.jsonc` binds the KV namespace `DATA` (`lightning-stream-site-data-preview` for the preview
branch, `lightning-stream-site-data` for production) and the relay list. The secret `GRAPH_TOKEN`
is set separately for production and for previews; the operator keeps both values in a mode-600 env file.

## The API

| | |
|---|---|
| `GET /api/listings` | Shops (kind 30402, `t=lightning-stream`), hashrate offers (30402, `t=lightning-stream-hashrate`), VPN exits (30078, `t=lightning-stream-vpn-exit`) and Stream relays (30078, `t=lightning-stream-relay`), read from the app's four default relays (`wss://relay.lazarus-xbt.xyz`, `wss://relay.kilombino.com`, `wss://relay.damus.io`, `wss://nos.lol`). Each event's NIP-01 signature is checked, and as the app does: a shop's listing signature and the receipt key's binding of the Nostr key; a hashrate offer's link-key binding; an exit's Ed25519 link signature. Newest per author, kind and `d`. Addresses for direct connections are never passed on. Cached in KV: served as-is for 5 minutes, refreshed in the background up to an hour, then refreshed before answering. |
| `GET /api/graph` | The latest graph snapshot (`graph/1`), or `{"graph": null}` before the first one. |
| `GET /api/summary` | Counts for the homepage. |
| `GET /api/health` | Relay results and ages. |
| `POST /api/graph` | A publisher posts a snapshot. `Authorization: Bearer <GRAPH_TOKEN>`. Up to 8 MB, 20,000 nodes, 100,000 channels; node addresses are dropped. |

`HIDE_PUBKEYS` (comma-separated hex Nostr keys) hides those authors' events; empty by default.

## Speed

- **Pages from the edge cache.** Every path passes through the Worker (it 301s www to the bare domain), and a
  Worker's responses aren't cached on their own, so the Worker keeps pages in Cloudflare's edge cache itself
  (Cache API, keyed by deployment: a new deploy is served at once). Pages carry
  `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=86400`; `x-page-cache: hit|miss`
  says which. Assets are versioned by content and cached long.
- **Speculation Rules** (stamped by `scripts/chrome.mjs`, allowed in the CSP by hash): pages are prepared when a
  person hovers or presses on a link (main navigation and buttons: prerender; other links: prefetch). Browsers
  without them prefetch on pointer-down, touch or a short hover (`assets/site.js`).
- **The background web starts when the browser is idle**, and a prerendered page starts it only when shown.
- `node scripts/perf.mjs <url> [rounds]` (optionally `LATENCY=150`, `HOVER=0`) clicks through the main navigation
  and reports TTFB, first paint and click-to-paint per page.

## The graph publisher

A Worker can't reach a node on a home network, so a box with an XBT Lightning node pushes the public
channel graph out on a schedule. `scripts/publish_graph.py` (Python 3, standard library only) reads
the graph from lnd/Lightning Fork (REST `/v1/graph` with a read-only macaroon, or `lncli
describegraph`) or Core Lightning (`listnodes`, `listchannels`), keeps only public gossip (node keys,
aliases, colors, channels and capacities; no addresses, no balances), and posts it to `/api/graph`.

```sh
# a read-only macaroon is enough
lncli bakemacaroon info:read --save_to ~/.lnd/graph-readonly.macaroon
python3 publish_graph.py --lnd-rest https://127.0.0.1:8080 \
    --macaroon ~/.lnd/graph-readonly.macaroon --tlscert ~/.lnd/tls.cert \
    --env-file /path/to/publisher.env --label "<your node alias>"
# cron, every 30 minutes:
# */30 * * * * /usr/bin/python3 /opt/ls-site/publish_graph.py --lnd-rest https://127.0.0.1:8080 --macaroon ... --tlscert ... --env-file ... --quiet
```

`--out file.json` writes the snapshot without sending it. It is **not installed on any host**: which
box runs it is Mike's choice. The env file needs `LS_SITE_URL` and `LS_GRAPH_TOKEN`.

## Launch checklist

1. Production deploy: `wrangler pages deploy --branch main` (the production `GRAPH_TOKEN` secret is set).
2. Custom domains on the Pages project: `lightning-stream.com`, and `www.lightning-stream.com`
   redirecting to the apex.
3. Enable the graph publisher's timer (installed on the Genesis node's host as
   `ls-graph-publisher.timer`, posting to the production site every 15 minutes) and check its first post.
4. After production is checked: apply `REDIRECTS.md` on lazarus-xbt.xyz, and update the links listed there.

## Content rules

Every claim traces to Lightning-Stream's `CHANGELOG.md`, `README.md`, `docs/`, or the existing
whitepaper pages (AwokenLazarus/Bitcoin, branch `stream/0120`, commit 0544a71). Anything not in 0.2.0
is marked **Coming** or **Not built**. The early, unaudited, small-amounts warning stays on the home,
download and guide pages and in the footer. Inter is © Rasmus Andersson, SIL Open Font License 1.1.

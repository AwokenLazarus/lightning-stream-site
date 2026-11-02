# Redirects: lazarus-xbt.xyz/stream/* → lightning-stream.com

The map for the planned 301s from the Lightning Stream pages on the Lazarus site to their new homes.
**Nothing here is applied yet.** The Lazarus site is unchanged. Apply these only after
lightning-stream.com serves this site.

Every old path redirects with **301** to the new URL below. Match each path with and without the
trailing slash, and with `index.html` (for example `/stream/design`, `/stream/design/` and
`/stream/design/index.html`). Keep the query string. Browsers carry the `#fragment` across a
redirect themselves; the section ids of the five paper pages are unchanged, so their deep links
keep working.

| Old (lazarus-xbt.xyz) | New (lightning-stream.com) | Notes |
|---|---|---|
| `/stream/` | `/whitepaper/` | The whitepaper. Section ids unchanged (`#problem` … `#thanks`, `#ref-N`). |
| `/stream/how-it-works/` | `/how-it-works/` | Rewritten page. `#map` still exists; `#money` → `#tickets`, `#more` → top of page. |
| `/stream/start/` | `/guide/` | "Try it" is split: install, channel and requirements moved to `/download/` (see fragments below). |
| `/stream/uses/` | `/whitepaper/uses/` | Ids unchanged. |
| `/stream/progress/` | `/whitepaper/progress/` | Ids unchanged. |
| `/stream/design/` | `/whitepaper/design/` | Ids unchanged. |
| `/stream/tests/` | `/whitepaper/tests/` | Ids unchanged. |
| `/stream/changelog/` | `/changelog/` | Version ids are `#v0-2-0`, `#v0-1-19`, … |
| `/stream/stream.css` | (none) | A stylesheet; let it 404 or keep serving it. Do not redirect. |

## `/stream/start/` fragments

A 301 can't send different fragments to different pages, so `/stream/start/#install` lands on
`/guide/#install`, which does not exist. Two options: accept that (the guide's first lines link to
Download), or have the redirect Worker send `/stream/start/` to `/guide/` and let a tiny script on
the guide forward the three moved fragments. The moved ones:

| Old fragment on `/stream/start/` | New |
|---|---|
| `#need` | `/download/#need` |
| `#install` | `/download/#install` |
| `#channel` | `/download/#channel` |
| `#first` | `/guide/#first` |
| `#buy` | `/guide/#buy` |
| `#shop` | `/guide/#demo` |
| `#sell` | `/guide/#sell` |
| `#help` | `/guide/#help` |

## Old `/stream/how-it-works/` fragments

| Old | New |
|---|---|
| `#map` | `/how-it-works/#map` |
| `#money` | `/how-it-works/#tickets` |
| `#more` | `/how-it-works/` |

## Links elsewhere that point at the old pages

These carry the old URLs and should be updated when the redirects go live (they will keep working
through the 301s meanwhile):

- Lightning-Stream `README.md`: "Website and setup" (`/stream/start/`), "Whitepaper" (`/stream/`),
  changelog link (`/stream/changelog/`), and the setup-page link under Install.
- Lightning-Stream `docs/STARTOS.md`: "its address is on the setup page, https://lazarus-xbt.xyz/stream/start/".
- The Lazarus site's own navigation and footer (`Stream whitepaper` → `/stream/`).

## As CSV (Cloudflare Bulk Redirects)

Source URL, target URL, status, preserve query string, subpath matching, preserve path suffix.
Subpath matching is off: each row is exact. Add the no-slash and `index.html` variants as rows of
their own, or use a Redirect Rule with the same pairs.

```csv
lazarus-xbt.xyz/stream/,https://lightning-stream.com/whitepaper/,301,TRUE,FALSE,FALSE
lazarus-xbt.xyz/stream/how-it-works/,https://lightning-stream.com/how-it-works/,301,TRUE,FALSE,FALSE
lazarus-xbt.xyz/stream/start/,https://lightning-stream.com/guide/,301,TRUE,FALSE,FALSE
lazarus-xbt.xyz/stream/uses/,https://lightning-stream.com/whitepaper/uses/,301,TRUE,FALSE,FALSE
lazarus-xbt.xyz/stream/progress/,https://lightning-stream.com/whitepaper/progress/,301,TRUE,FALSE,FALSE
lazarus-xbt.xyz/stream/design/,https://lightning-stream.com/whitepaper/design/,301,TRUE,FALSE,FALSE
lazarus-xbt.xyz/stream/tests/,https://lightning-stream.com/whitepaper/tests/,301,TRUE,FALSE,FALSE
lazarus-xbt.xyz/stream/changelog/,https://lightning-stream.com/changelog/,301,TRUE,FALSE,FALSE
lazarus-xbt.xyz/stream,https://lightning-stream.com/whitepaper/,301,TRUE,FALSE,FALSE
lazarus-xbt.xyz/stream/how-it-works,https://lightning-stream.com/how-it-works/,301,TRUE,FALSE,FALSE
lazarus-xbt.xyz/stream/start,https://lightning-stream.com/guide/,301,TRUE,FALSE,FALSE
lazarus-xbt.xyz/stream/uses,https://lightning-stream.com/whitepaper/uses/,301,TRUE,FALSE,FALSE
lazarus-xbt.xyz/stream/progress,https://lightning-stream.com/whitepaper/progress/,301,TRUE,FALSE,FALSE
lazarus-xbt.xyz/stream/design,https://lightning-stream.com/whitepaper/design/,301,TRUE,FALSE,FALSE
lazarus-xbt.xyz/stream/tests,https://lightning-stream.com/whitepaper/tests/,301,TRUE,FALSE,FALSE
lazarus-xbt.xyz/stream/changelog,https://lightning-stream.com/changelog/,301,TRUE,FALSE,FALSE
lazarus-xbt.xyz/stream/index.html,https://lightning-stream.com/whitepaper/,301,TRUE,FALSE,FALSE
lazarus-xbt.xyz/stream/how-it-works/index.html,https://lightning-stream.com/how-it-works/,301,TRUE,FALSE,FALSE
lazarus-xbt.xyz/stream/start/index.html,https://lightning-stream.com/guide/,301,TRUE,FALSE,FALSE
lazarus-xbt.xyz/stream/uses/index.html,https://lightning-stream.com/whitepaper/uses/,301,TRUE,FALSE,FALSE
lazarus-xbt.xyz/stream/progress/index.html,https://lightning-stream.com/whitepaper/progress/,301,TRUE,FALSE,FALSE
lazarus-xbt.xyz/stream/design/index.html,https://lightning-stream.com/whitepaper/design/,301,TRUE,FALSE,FALSE
lazarus-xbt.xyz/stream/tests/index.html,https://lightning-stream.com/whitepaper/tests/,301,TRUE,FALSE,FALSE
lazarus-xbt.xyz/stream/changelog/index.html,https://lightning-stream.com/changelog/,301,TRUE,FALSE,FALSE
```

Note: lazarus-xbt.xyz is served by the `lazarus-map` Worker (`run_worker_first` only for `/` and
`/ecosystem/`), so a zone-level Bulk Redirect or Redirect Rule runs before it and needs no change to
that Worker. Its `sitemap-en.xml` lists `/stream/` and should drop it at
the same time.

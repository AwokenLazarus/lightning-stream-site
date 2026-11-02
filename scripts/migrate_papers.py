#!/usr/bin/env python3
"""Carry the whitepaper and its four companion pages over from lazarus-xbt.xyz/stream/ to this site.

    python3 scripts/migrate_papers.py [path/to/public/stream]

The source is cloudflare/map-site/public/stream in a checkout of AwokenLazarus/Bitcoin (branch
stream/0120 at 0544a71 has the wording these pages carry). Give it as the argument or as PAPERS. The words, figures, tables and references are kept as they are;
only the page around them changes: this site's header, title block and table of contents, and
links rewritten to this site's paths (REDIRECTS.md has the same map). Run `node scripts/chrome.mjs`
afterwards (scripts/build.sh does both).
"""
import html
import os
from american import american
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("PAPERS", os.path.join(ROOT, "..", "Bitcoin", "cloudflare", "map-site", "public", "stream"))

# old page -> (new path, eyebrow, short title for <title>)
PAGES = {
    "index.html": ("whitepaper", "Whitepaper", "Whitepaper"),
    "design/index.html": ("whitepaper/design", "Whitepaper · Design details", "Design details"),
    "tests/index.html": ("whitepaper/tests", "Whitepaper · Tests and numbers", "Tests and numbers"),
    "progress/index.html": ("whitepaper/progress", "Whitepaper · Progress and status", "Progress and status"),
    "uses/index.html": ("whitepaper/uses", "Whitepaper · Uses", "Uses"),
}
LINKS = [
    ("/stream/how-it-works/", "/how-it-works/"),
    ("/stream/start/", "/guide/"),
    ("/stream/changelog/", "/changelog/"),
    ("/stream/design/", "/whitepaper/design/"),
    ("/stream/tests/", "/whitepaper/tests/"),
    ("/stream/progress/", "/whitepaper/progress/"),
    ("/stream/uses/", "/whitepaper/uses/"),
    ("/stream/", "/whitepaper/"),
]
COMPANIONS = [("/whitepaper/", "The whitepaper"), ("/whitepaper/design/", "Design details"),
              ("/whitepaper/tests/", "Tests and numbers"), ("/whitepaper/progress/", "Progress and status"),
              ("/whitepaper/uses/", "Uses"), ("/how-it-works/", "How it works"), ("/guide/", "Guide"),
              ("/changelog/", "Changelog")]


def relink(s):
    def fix(m):
        href = m.group(1)
        for old, new in LINKS:
            if href.startswith(old):
                return 'href="' + new + href[len(old):] + '"'
        if href.startswith("/"):  # anything else on the Lazarus site stays on the Lazarus site
            return 'href="https://lazarus-xbt.xyz' + href + '"'
        return m.group(0)
    return re.sub(r'href="([^"]*)"', fix, s)


def text(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def migrate(name, new, eyebrow, short):
    src = open(os.path.join(SRC, name), encoding="utf-8").read()
    hero = re.search(r'<section class="hero wrap">([\s\S]*?)</section>', src).group(1)
    h1 = re.search(r"<h1>([\s\S]*?)</h1>", hero).group(1)
    h1 = re.sub(r'<span class="kicker">[\s\S]*?</span>', "", h1).strip()
    ledes = re.findall(r'<p class="lede">([\s\S]*?)</p>', hero)
    note = re.search(r'<p class="note">([\s\S]*?)</p>', hero)
    toc = re.search(r'<nav class="toc" aria-label="On this page">([\s\S]*?)</nav>', hero)
    toc_links = re.findall(r'<a href="(#[^"]+)">([\s\S]*?)</a>', toc.group(1)) if toc else []
    body = re.search(r'<section class="section wrap">\s*<div class="prose paper"[^>]*>([\s\S]*?)</div>\s*</section>\s*</main>', src).group(1)
    body = relink(body)
    body = body.replace("This page is set in IBM Plex (IBM) and Newsreader (Production Type), both under the SIL Open Font License.",
                        "This page is set in Inter (Rasmus Andersson), under the SIL Open Font License.")
    desc = text(ledes[0]) if ledes else text(h1)
    if len(desc) > 300:
        desc = desc[:297].rsplit(" ", 1)[0] + "…"
    toc_html = "".join(f'<li><a href="{h}">{t}</a></li>' for h, t in toc_links)
    comp = "".join(f'<li><a href="{h}"{" aria-current=\"page\"" if h == "/" + new + "/" else ""}>{t}</a></li>' for h, t in COMPANIONS)
    lede_html = "".join(f'<p class="lede">{relink(l)}</p>' for l in ledes)
    note_html = f'<p class="meta-note">{relink(note.group(1))}</p>' if note else ""
    title = text(h1)
    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{html.escape(short if short != "Whitepaper" else title)}: Lightning Stream</title>
<meta name="description" content="{html.escape(desc)}">
<link rel="canonical" href="https://lightning-stream.com/{new}/">
<meta name="theme-color" content="#050507">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="/assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css">
<link rel="stylesheet" href="/assets/paper.css">
<script src="/assets/site.js" defer></script>
<script src="/assets/web.js" defer></script>
</head>
<body class="paper-page">
<!-- chrome:header -->
<!-- /chrome:header -->
<main id="main">
  <header class="page-hero">
    <canvas class="web-canvas" data-web="ambient" aria-hidden="true"></canvas>
    <div class="wrap">
      <p class="eyebrow">{eyebrow}</p>
      <h1 class="paper-title">{h1}</h1>
      {lede_html}
      {note_html}
    </div>
  </header>
  <div class="page-body">
    <div class="wrap with-toc">
      <aside class="toc" aria-label="On this page"><div class="toc-inner">
        <h2>On this page</h2><ol>{toc_html}</ol>
        <h2 class="toc-sub">The papers</h2><ul>{comp}</ul>
      </div></aside>
      <article class="prose paper">
{body}
      </article>
    </div>
  </div>
</main>
<!-- chrome:footer -->
<!-- /chrome:footer -->
</body>
</html>
"""
    out = os.path.join(ROOT, "site", new, "index.html")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, "w", encoding="utf-8").write(american(page))
    print(f"papers: {name} -> site/{new}/index.html ({len(toc_links)} sections)")


if __name__ == "__main__":
    for name, (new, eyebrow, short) in PAGES.items():
        migrate(name, new, eyebrow, short)

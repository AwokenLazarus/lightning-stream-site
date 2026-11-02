#!/usr/bin/env python3
"""Generate site/changelog/index.html from Lightning Stream's CHANGELOG.md.

    python3 scripts/changelog.py [path/to/CHANGELOG.md]

The default source is ../Lightning-Stream/CHANGELOG.md (a checkout of AwokenLazarus/Lightning-Stream beside this one). The page keeps
every word of the changelog. It understands the subset the changelog uses: "## version (date)"
headings, "**Section**" lines, "- " items with indented continuation lines, plain paragraphs, and
inline `code`, **bold**, *emphasis* and [links](url). Afterwards run `node scripts/chrome.mjs`
to stamp the shared header and footer (scripts/build.sh does both).
"""
import html
import os
from american import american
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "..", "Lightning-Stream", "CHANGELOG.md")
OUT = os.path.join(ROOT, "site", "changelog", "index.html")
REPO = "https://github.com/AwokenLazarus/Lightning-Stream/blob/main/"
# Versions with a GitHub release page.
RELEASES = {"0.2.0": "https://github.com/AwokenLazarus/Lightning-Stream/releases/tag/v0.2.0"}
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
          "October", "November", "December"]


def inline(s):
    """Markdown inline to HTML, escaping everything else."""
    out, i = [], 0
    pat = re.compile(r"`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|(?<![\w*])\*([^*\s][^*]*?)\*(?![\w*])|(https?://[^\s<>()]+[^\s<>().,;:!?'\"])")
    for m in pat.finditer(s):
        out.append(html.escape(s[i:m.start()], quote=False))
        code, bold, ltext, lurl, em, url = m.groups()
        if code is not None:
            # a path in the tree becomes a link to it on GitHub
            if re.fullmatch(r"(docs|scripts|packaging)/[\w./-]+\.(md|sh|py)", code):
                out.append(f'<a href="{REPO}{html.escape(code)}"><code>{html.escape(code)}</code></a>')
            else:
                out.append(f"<code>{html.escape(code, quote=False)}</code>")
        elif bold is not None:
            out.append(f"<strong>{inline(bold)}</strong>")
        elif ltext is not None:
            href = lurl if lurl.startswith("http") else REPO + lurl
            out.append(f'<a href="{html.escape(href)}">{inline(ltext)}</a>')
        elif em is not None:
            out.append(f"<em>{inline(em)}</em>")
        else:
            out.append(f'<a href="{html.escape(url)}">{html.escape(url, quote=False)}</a>')
        i = m.end()
    out.append(html.escape(s[i:], quote=False))
    text = "".join(out)
    # bare doc names in prose (docs/LINUX.md) link to the tree too
    return re.sub(r"(?<![\w/\">])(docs/[A-Z0-9-]+\.md)", lambda m: f'<a href="{REPO}{m.group(1)}">{m.group(1)}</a>', text)


def parse(md):
    """[(version, date, intro_html, [(section, items_or_paras_html)])], thanks_html"""
    releases, thanks = [], ""
    blocks = re.split(r"^## ", md, flags=re.M)[1:]
    for b in blocks:
        head, _, body = b.partition("\n")
        m = re.match(r"(\S+) \((\d{4}-\d{2}-\d{2})\)", head.strip())
        lines = body.strip("\n").split("\n")
        sections, cur, intro = [], None, []
        items, para = [], []

        def flush():
            nonlocal items, para
            target = cur[1] if cur else intro
            if para:
                target.append(("p", " ".join(x.strip() for x in para)))
                para = []
            if items:
                target.append(("ul", items))
                items = []

        for ln in lines:
            if re.fullmatch(r"\*\*[^*]+\*\*", ln.strip()):
                flush()
                cur = (ln.strip()[2:-2], [])
                sections.append(cur)
            elif ln.startswith("- "):
                if para:
                    flush()
                items.append(ln[2:].strip())
            elif ln.startswith("  ") and items and ln.strip():
                items[-1] += " " + ln.strip()
            elif not ln.strip():
                if para:
                    flush()
            else:
                if items:
                    flush()
                para.append(ln)
        flush()
        if not m:
            thanks = render(intro)
            continue
        releases.append((m.group(1), m.group(2), render(intro), [(t, render(c)) for t, c in sections]))
    return releases, thanks


def render(content):
    out = []
    for kind, v in content:
        if kind == "p":
            out.append(f"<p>{inline(v)}</p>")
        else:
            out.append("<ul>" + "".join(f"<li>{inline(x)}</li>" for x in v) + "</ul>")
    return "\n".join(out)


def nice_date(d):
    y, mo, da = d.split("-")
    return f"{int(da)} {MONTHS[int(mo) - 1]} {y}"


def main():
    md = open(SRC, encoding="utf-8").read()
    pre = md.split("\n## ", 1)[0]
    preface = [p.strip().replace("\n", " ") for p in pre.split("\n\n")[1:] if p.strip()]
    releases, thanks = parse(md)
    toc = "\n".join(f'<li><a href="#v{v.replace(".", "-")}">{v} <span class="muted">&middot; {nice_date(d)}</span></a></li>' for v, d, _, _ in releases)
    body = []
    for n, (v, d, intro, sections) in enumerate(releases):
        vid = "v" + v.replace(".", "-")
        parts = [f'<article class="release" id="{vid}" aria-labelledby="{vid}-h">',
                 f'<div class="release-head"><h2 id="{vid}-h">{v}</h2><time datetime="{d}">{nice_date(d)}</time>'
                 + ('<span class="tag tag-volt">Latest</span>' if n == 0 else "")
                 + (f'<a href="{RELEASES[v]}">Release on GitHub</a>' if v in RELEASES else "") + "</div>",
                 f'<div class="prose">{intro}</div>' if intro else ""]
        big = sum(len(c) for _, c in sections) > 6000
        for i, (title, content) in enumerate(sections):
            count = content.count("<li>")
            if big and i > 0:
                label = f"{inline(title)} <span class=\"muted\">&middot; {count} change{'s' if count != 1 else ''}</span>" if count else inline(title)
                parts.append(f'<details><summary>{label}</summary><div class="prose">{content}</div></details>')
            else:
                parts.append(f'<div class="prose"><h3>{inline(title)}</h3>{content}</div>')
        parts.append("</article>")
        body.append("\n".join(p for p in parts if p))
    latest_v, latest_d = releases[0][0], releases[0][1]
    page = TEMPLATE.format(
        preface="\n".join(f"<p>{inline(p)}</p>" for p in preface),
        toc=toc, body="\n\n".join(body), thanks=thanks,
        latest=latest_v, latest_date=nice_date(latest_d), count=len(releases))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "w", encoding="utf-8").write(american(page))
    print(f"changelog: {len(releases)} versions, latest {latest_v} ({latest_d}) -> {os.path.relpath(OUT, ROOT)}")


TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Changelog: Lightning Stream</title>
<meta name="description" content="What changed in each version of Lightning Stream, newest first. Latest: {latest}, {latest_date}.">
<link rel="canonical" href="https://lightning-stream.com/changelog/">
<meta name="theme-color" content="#050507">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="/assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css">
<script src="/assets/site.js" defer></script>
<script src="/assets/web.js" defer></script>
</head>
<body>
<!-- chrome:header -->
<!-- /chrome:header -->
<main id="main">
  <header class="page-hero">
    <canvas class="web-canvas" data-web="ambient" aria-hidden="true"></canvas>
    <div class="wrap">
      <p class="eyebrow">Changelog</p>
      <h1>Every version, newest first.</h1>
      <div class="lede">{preface}</div>
      <div class="meta"><span class="tag tag-volt">Latest: {latest}</span><span>{latest_date}</span><span>{count} versions</span><a href="https://github.com/AwokenLazarus/Lightning-Stream/releases">Releases on GitHub</a><a href="https://github.com/AwokenLazarus/Lightning-Stream/blob/main/CHANGELOG.md">CHANGELOG.md</a></div>
    </div>
  </header>
  <div class="page-body">
    <div class="wrap with-toc">
      <aside class="toc" aria-label="Versions"><div class="toc-inner"><h2>Versions</h2><ol>
{toc}
      </ol></div></aside>
      <div>
{body}
        <section class="release" id="thanks" aria-labelledby="thanks-h"><div class="release-head"><h2 id="thanks-h">Thanks</h2></div><div class="prose">{thanks}</div></section>
        <p class="muted small">This page is generated from the changelog in the source tree. <a href="/download/">Download the latest version.</a></p>
      </div>
    </div>
  </div>
</main>
<!-- chrome:footer -->
<!-- /chrome:footer -->
</body>
</html>
"""

if __name__ == "__main__":
    main()

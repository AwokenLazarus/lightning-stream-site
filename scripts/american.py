"""American spelling for generated pages (Mike, 2026-11-02): color, license, center, behavior, canceled, gray, honor.

Changes words in the page's text only: never inside a tag (so no attribute, URL or id changes), and never inside
<code> or <pre>, where a word may be a field name or a quoted identifier (a listing's `licence` field, say).
"""
import re

WORDS = {
    "cancelled": "canceled", "cancelling": "canceling",
    "licence": "license", "licences": "licenses", "licenced": "licensed",
    "behaviour": "behavior", "behaviours": "behaviors",
    "colour": "color", "colours": "colors", "coloured": "colored",
    "centre": "center", "centres": "centers", "centred": "centered", "centring": "centering",
    "honour": "honor", "honours": "honors", "honoured": "honored", "honouring": "honoring",
    "grey": "gray", "greys": "grays",
    "organise": "organize", "organised": "organized", "organising": "organizing",
    "recognise": "recognize", "recognised": "recognized", "favour": "favor", "favours": "favors",
    "labelled": "labeled", "labelling": "labeling", "modelled": "modeled", "travelled": "traveled",
}
_word = re.compile(r"\b(" + "|".join(sorted(WORDS, key=len, reverse=True)) + r")\b", re.I)


def _fix(m):
    w = m.group(0)
    out = WORDS[w.lower()]
    if w.isupper():
        return out.upper()
    if w[0].isupper():
        return out[0].upper() + out[1:]
    return out


def american(html):
    parts = re.split(r"(<[^>]+>)", html)
    depth = 0
    for i, p in enumerate(parts):
        if p.startswith("<"):
            t = re.match(r"</?\s*(\w+)", p)
            if t and t.group(1).lower() in ("code", "pre", "script", "style"):
                depth += -1 if p.startswith("</") else 1
            continue
        if depth <= 0:
            parts[i] = _word.sub(_fix, p)
    return "".join(parts)

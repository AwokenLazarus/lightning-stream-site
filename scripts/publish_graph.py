#!/usr/bin/env python3
"""Publish a snapshot of the public XBT Lightning channel graph to lightning-stream-site's /api/graph.

Run it on a schedule (every 15 to 60 minutes) on any box that has an XBT Lightning node: the Worker
can't reach a node on a home network, so the node's box pushes the graph out. It sends only public
gossip (node ids, aliases, colours, channels and their capacities). It never sends node addresses,
balances, or anything about the node's own wallet. Python 3.8+, standard library only.

Where the graph comes from (pick one):
  --lnd-rest URL      lnd / Lightning Fork REST, e.g. https://127.0.0.1:8080 (GET /v1/graph)
                      with --macaroon PATH (a read-only one is enough: `lncli bakemacaroon info:read`)
                      and --tlscert PATH (lnd's tls.cert)
  --lncli CMD         a command that prints `lncli describegraph` JSON, e.g.
                      "lncli describegraph" or "docker exec lightning-fork lncli describegraph"
  --cln CMD           Core Lightning's CLI, e.g. "lightning-cli"; runs `listnodes` and `listchannels`
  --from-file PATH    a saved `describegraph` (lnd) JSON; for tests

Where it goes:
  default             POST to $LS_SITE_URL/api/graph with "Authorization: Bearer $LS_GRAPH_TOKEN"
                      (set both in a mode-600 env file: --env-file /path/to/publisher.env)
  --out PATH          write the graph/1 document to a file instead (or "-" for stdout); nothing is sent

Example cron line (every 30 minutes):
  */30 * * * *  /usr/bin/python3 /opt/ls-site/publish_graph.py --lnd-rest https://127.0.0.1:8080 \\
      --macaroon /home/me/.lnd/readonly.macaroon --tlscert /home/me/.lnd/tls.cert \\
      --env-file /etc/ls-graph-publisher/env --quiet
"""
import argparse
import json
import os
import shlex
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request

UA = "lightning-stream-site-graph-publisher/1"


def from_lnd(doc):
    nodes = [{"id": n.get("pub_key", ""), "alias": n.get("alias", ""), "color": n.get("color", ""),
              "last_update": int(n.get("last_update") or 0)} for n in doc.get("nodes", [])]
    chans = [{"id": str(e.get("channel_id", "")), "a": e.get("node1_pub", ""), "b": e.get("node2_pub", ""),
              "sat": int(e.get("capacity") or 0), "last_update": int(e.get("last_update") or 0)}
             for e in doc.get("edges", [])]
    return nodes, chans


def from_cln(cli):
    run = lambda *a: json.loads(subprocess.run(shlex.split(cli) + list(a), check=True, capture_output=True, text=True).stdout)
    nodes = [{"id": n.get("nodeid", ""), "alias": n.get("alias", ""),
              "color": ("#" + n["color"]) if n.get("color") else "", "last_update": int(n.get("last_timestamp") or 0)}
             for n in run("listnodes").get("nodes", [])]
    seen, chans = set(), []
    for c in run("listchannels").get("channels", []):
        scid = c.get("short_channel_id", "")
        if not c.get("public", True) or scid in seen:
            continue
        seen.add(scid)
        msat = c.get("amount_msat", 0)
        msat = int(str(msat).rstrip("msat") or 0)
        chans.append({"id": scid, "a": c.get("source", ""), "b": c.get("destination", ""), "sat": msat // 1000,
                      "last_update": int(c.get("last_update") or 0)})
    return nodes, chans


def lnd_rest(url, macaroon, tlscert):
    ctx = ssl.create_default_context(cafile=tlscert) if tlscert else ssl.create_default_context()
    if tlscert:
        ctx.check_hostname = False  # lnd's self-signed certificate names localhost, not the address used
    mac = open(macaroon, "rb").read().hex()
    req = urllib.request.Request(url.rstrip("/") + "/v1/graph?include_unannounced=false",
                                 headers={"Grpc-Metadata-macaroon": mac, "User-Agent": UA})
    with urllib.request.urlopen(req, context=ctx, timeout=60) as r:
        return json.load(r)


def load_env(path):
    for line in open(os.path.expanduser(path)):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--lnd-rest")
    src.add_argument("--lncli")
    src.add_argument("--cln")
    src.add_argument("--from-file")
    ap.add_argument("--macaroon")
    ap.add_argument("--tlscert")
    ap.add_argument("--env-file")
    ap.add_argument("--label", default="", help="free text shown as the snapshot's source, e.g. a node alias")
    ap.add_argument("--out")
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args()
    if a.env_file:
        load_env(a.env_file)

    if a.lnd_rest:
        if not a.macaroon:
            ap.error("--lnd-rest needs --macaroon")
        nodes, chans = from_lnd(lnd_rest(a.lnd_rest, a.macaroon, a.tlscert)); impl = "lnd"
    elif a.lncli:
        out = subprocess.run(shlex.split(a.lncli), check=True, capture_output=True, text=True).stdout
        nodes, chans = from_lnd(json.loads(out)); impl = "lnd"
    elif a.cln:
        nodes, chans = from_cln(a.cln); impl = "cln"
    else:
        nodes, chans = from_lnd(json.load(open(a.from_file))); impl = "lnd"

    doc = {"version": "graph/1", "network": "xbt", "taken_at": int(time.time()),
           "source": {"impl": impl, "label": a.label[:60]}, "nodes": nodes, "channels": chans}
    body = json.dumps(doc, separators=(",", ":")).encode()

    if a.out:
        (sys.stdout.buffer if a.out == "-" else open(a.out, "wb")).write(body)
        if not a.quiet and a.out != "-":
            print(f"graph: {len(nodes)} nodes, {len(chans)} channels -> {a.out}")
        return 0

    site, token = os.environ.get("LS_SITE_URL", "").rstrip("/"), os.environ.get("LS_GRAPH_TOKEN", "")
    if not site or not token:
        print("set LS_SITE_URL and LS_GRAPH_TOKEN (or --env-file), or use --out", file=sys.stderr)
        return 2
    req = urllib.request.Request(site + "/api/graph", data=body, method="POST",
                                 headers={"Authorization": "Bearer " + token, "Content-Type": "application/json", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            res = json.load(r)
    except urllib.error.HTTPError as e:
        print(f"graph: the site answered {e.code}: {e.read()[:300].decode(errors='replace')}", file=sys.stderr)
        return 1
    if not a.quiet:
        print(f"graph: published {res.get('nodes')} nodes, {res.get('channels')} channels, {res.get('capacity_sat')} sat")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env node
// The XBT donation address: checks it, and stamps its copy box and QR code into site/about/index.html between
//   <!-- donate --> ... <!-- /donate -->
// The QR is an inline SVG made here at build time, so the page loads nothing from anywhere else. It encodes the
// plain address, not a "bitcoin:" URI: XBT wallets have no URI scheme of their own, and a bitcoin: link could
// open a SHA-256 Bitcoin wallet instead.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

export const ADDRESS = "bc1qw9eappz67w9d264ljtv64q7vxvv2680q3x9sxezjey80fcnfncsqheadh9";

// BIP 173: refuse to build with an address whose checksum fails (a typo would send money nowhere).
function bech32ok(a) {
  const CH = "qpzry9x8gf2tvdw0s3jn54khce6mua7l", G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  const i = a.lastIndexOf("1"), hrp = a.slice(0, i), data = [...a.slice(i + 1)].map((c) => CH.indexOf(c));
  if (data.some((d) => d < 0)) return false;
  let c = 1;
  for (const v of [...[...hrp].map((x) => x.charCodeAt(0) >> 5), 0, ...[...hrp].map((x) => x.charCodeAt(0) & 31), ...data]) {
    const b = c >>> 25; c = ((c & 0x1ffffff) << 5) ^ v;
    for (let k = 0; k < 5; k++) if ((b >>> k) & 1) c ^= G[k];
  }
  return c === 1;
}
if (!bech32ok(ADDRESS)) { console.error("donate: the address's checksum fails; not building"); process.exit(1); }

const svg = (await QRCode.toString(ADDRESS, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#000000", light: "#ffffff" } }))
  .replace("<svg ", `<svg role="img" aria-label="QR code of the Bitcoin (XBT) donation address" class="qr" `);
const block = `<!-- donate -->
        <div class="donate">
          <figure class="donate-qr">${svg}</figure>
          <div class="donate-addr">
            <p class="muted small">Bitcoin (XBT) address</p>
            <div class="copy"><code>${ADDRESS}</code><button type="button" hidden>Copy</button></div>
            <p class="muted small">The QR code holds the plain address. Send it from a Bitcoin (XBT) wallet that follows BLAKE2b proof of work, not from a SHA-256 wallet.</p>
          </div>
        </div>
        <!-- /donate -->`;
const page = new URL("../site/about/index.html", import.meta.url);
const html = readFileSync(page, "utf8");
if (!html.includes("<!-- donate -->")) { console.error("donate: no <!-- donate --> marker in about/index.html"); process.exit(1); }
writeFileSync(page, html.replace(/<!-- donate -->[\s\S]*?<!-- \/donate -->/, block));
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log("donate: address checked, QR stamped into about/");

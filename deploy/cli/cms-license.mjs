#!/usr/bin/env node
/**
 * cms-license sign
 * ────────────────
 * Signs a casino license payload with the offline Ed25519 private key.
 *
 * Usage:
 *   node cms-license.mjs sign \
 *     --casino=mwanza \
 *     --package=live_pro \
 *     --expires=2027-01-01 \
 *     --features=cage,cage_slots,reports \
 *     --key=./license-private.pem \
 *     --out=./license.dat
 *
 * The resulting license.dat is a single JSON file:
 *   {
 *     "payload": { casino, package, expires_at, features[], issued_at, license_id },
 *     "signature": "<base64 Ed25519 signature over canonical JSON of payload>"
 *   }
 *
 * Uploaded via /superadmin/license → verified by verify_license() in DB
 * AND by WebCrypto in the browser (defense-in-depth).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createPrivateKey, sign as edSign, randomUUID } from "node:crypto";

function arg(name, def) {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : def;
}

const cmd = process.argv[2];
if (cmd !== "sign") {
  console.error("Usage: cms-license sign --casino=<slug> --package=<code> --expires=<YYYY-MM-DD> [--features=a,b,c] [--key=./license-private.pem] [--out=./license.dat]");
  process.exit(1);
}

const casino = arg("casino");
const pkg = arg("package");
const expires = arg("expires");
const features = arg("features", "").split(",").map((s) => s.trim()).filter(Boolean);
const keyPath = arg("key", "./license-private.pem");
const outPath = arg("out", "./license.dat");

if (!casino || !pkg || !expires) {
  console.error("Missing required flags: --casino, --package, --expires");
  process.exit(1);
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) {
  console.error("--expires must be YYYY-MM-DD");
  process.exit(1);
}

const payload = {
  license_id: randomUUID(),
  casino_slug: casino,
  package_code: pkg,
  features,
  issued_at: new Date().toISOString(),
  expires_at: new Date(`${expires}T23:59:59Z`).toISOString(),
  version: 1,
};

// Canonical JSON: sorted keys, no extra whitespace. Both signer and verifier
// MUST use the exact same serialization or the signature will not match.
function canonical(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonical).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(obj[k])).join(",") + "}";
}

const message = Buffer.from(canonical(payload), "utf8");
const privateKey = createPrivateKey(readFileSync(keyPath));
const signature = edSign(null, message, privateKey).toString("base64");

const licenseFile = { payload, signature };
writeFileSync(outPath, JSON.stringify(licenseFile, null, 2) + "\n");

console.log("✓ Signed license written to", outPath);
console.log("  casino  :", casino);
console.log("  package :", pkg);
console.log("  expires :", payload.expires_at);
console.log("  features:", features.join(", ") || "(package default)");
console.log("  id      :", payload.license_id);

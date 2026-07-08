#!/usr/bin/env node
/**
 * cms-license generate-keys
 * ─────────────────────────
 * Generates an Ed25519 key pair for signing casino licenses.
 *
 * OUTPUT:
 *   ./license-private.pem  ← store OFFLINE, never commit, never upload
 *   ./license-public.b64   ← paste content into src/lib/license/public-key.ts
 *
 * Run ONCE per environment (prod / staging). Rotating the key invalidates
 * every previously signed license.
 */
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const outDir = process.cwd();
const priv = resolve(outDir, "license-private.pem");
const pub = resolve(outDir, "license-public.b64");

if (existsSync(priv) || existsSync(pub)) {
  console.error("Refusing to overwrite existing key files in", outDir);
  console.error("Delete license-private.pem / license-public.b64 first if you really want to regenerate.");
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync("ed25519");

writeFileSync(
  priv,
  privateKey.export({ type: "pkcs8", format: "pem" }),
  { mode: 0o600 }
);

// Export public key as raw 32 bytes → base64 (matches WebCrypto Ed25519 raw import).
const rawPub = publicKey.export({ type: "spki", format: "der" });
// SPKI DER for Ed25519 is 44 bytes: 12-byte header + 32-byte key
const rawKey = rawPub.subarray(rawPub.length - 32);
writeFileSync(pub, rawKey.toString("base64") + "\n");

console.log("✓ Wrote", priv, "(mode 600, KEEP OFFLINE)");
console.log("✓ Wrote", pub, "(paste into src/lib/license/public-key.ts)");
console.log("");
console.log("Public key (base64):");
console.log(rawKey.toString("base64"));

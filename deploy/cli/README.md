# cms-license — offline license signing CLI

Signs casino license files with an Ed25519 key held offline by the release
engineer. The matching public key is compiled into the app
(`src/lib/license/public-key.ts`) and stored in the DB verifier
(`verify_license` SQL function).

## One-time setup

1. On a secure, offline machine (or an air-gapped VM):

   ```bash
   cd deploy/cli
   node generate-keys.mjs
   ```

   Produces:
   - `license-private.pem` — **KEEP OFFLINE**, back up to encrypted media,
     never commit, never upload, never paste into chat.
   - `license-public.b64` — copy the single-line contents into
     `src/lib/license/public-key.ts` → `LICENSE_PUBLIC_KEY_B64`.

2. Commit the updated `public-key.ts`. Rebuild + redeploy the app.
   Every future `license.dat` must be signed with the matching private key.

## Issuing a license

```bash
node cms-license.mjs sign \
  --casino=mwanza \
  --package=live_pro \
  --expires=2027-01-01 \
  --features=cage,cage_slots,reports \
  --key=./license-private.pem \
  --out=./licenses/mwanza-2027.dat
```

Flags:

| Flag         | Required | Notes                                                   |
|--------------|----------|---------------------------------------------------------|
| `--casino`   | yes      | Slug of the target casino (matches `casinos.slug`).     |
| `--package`  | yes      | Package code from `casino_packages` (e.g. `live_pro`).  |
| `--expires`  | yes      | `YYYY-MM-DD`. License is invalid at 23:59:59 UTC.       |
| `--features` | no       | CSV overriding the package's default module list.       |
| `--key`      | no       | Path to private key (default `./license-private.pem`).  |
| `--out`      | no       | Output path (default `./license.dat`).                  |

## Delivering to a casino

1. Send `license.dat` to the customer via a trusted channel.
2. Super-admin uploads via `/superadmin/license` in the app.
3. The DB verifier checks the signature and inserts into `casino_license`.
4. Every client refetches within 30 seconds (React Query invalidation).

## Rotating the key

Only if the private key is suspected compromised:

1. Generate a new key pair (deletes require manual removal — the CLI refuses
   to overwrite by default).
2. Update `LICENSE_PUBLIC_KEY_B64` and redeploy.
3. Re-sign every active casino's license and redistribute the new `.dat`.

Old signatures will no longer verify.

# Releasing

How to cut a new release of `invoicing-kit` and `@invoicing-kit/cli`.

Both packages are versioned and released together (single version line).

## One-time setup

### npm

1. You (or a publisher) must be a member of the **`invoicing-kit`** npm org with publish permission on both `invoicing-kit` and `@invoicing-kit/cli`. Manage at https://www.npmjs.com/settings/invoicing-kit/members.
2. Generate a **Granular Access Token** at https://www.npmjs.com/settings/<your-user>/tokens:
   - **Packages and scopes:** `invoicing-kit`, `@invoicing-kit/*`
   - **Permission:** Read and write
   - **Bypass 2FA:** ON (required for unattended publish from CI)
   - **Expiry:** 1 year (or whatever fits your rotation policy)

### GitHub

1. Visit https://github.com/Bitzer-AI/invoice-kit/settings/secrets/actions.
2. Add a repository secret:
   - **Name:** `NPM_TOKEN`
   - **Value:** the token from step 2 above.

That's the entire CI auth setup. The token is never written to a file or printed in logs — `npm publish` reads it from `NODE_AUTH_TOKEN`, which is scoped to the publish step only.

## Cutting a release (the normal path)

1. **Bump versions** in both `packages/*/package.json` to the same `X.Y.Z`:
   ```bash
   # from repo root, edit by hand or:
   bun pm version --filter '*' patch  # or minor / major
   ```
2. **Commit and push** the version bump:
   ```bash
   git add packages/*/package.json
   git commit -m "chore: release vX.Y.Z"
   git push
   ```
3. **Wait for CI green** on the bump commit (https://github.com/Bitzer-AI/invoice-kit/actions). Don't release on a red build.
4. **Create a GitHub Release** at https://github.com/Bitzer-AI/invoice-kit/releases/new:
   - **Tag:** `vX.Y.Z` (matching the package.json versions)
   - **Target:** `main`
   - **Title:** `vX.Y.Z`
   - **Description:** changelog summary (what changed since last release).
5. **Publish the release.** The `Publish` workflow fires automatically, builds both packages, and runs `npm publish --access public --provenance` on each.
6. **Verify:** check https://www.npmjs.com/package/invoicing-kit and https://www.npmjs.com/package/@invoicing-kit/cli — both should show the new version with a "Provenance" badge.

## Manual run

Sometimes you need to re-run a publish (e.g., the release fired but CI flaked):

1. Go to https://github.com/Bitzer-AI/invoice-kit/actions/workflows/publish.yml.
2. Click **Run workflow** → pick `main`.
3. Optionally check **Dry run** — runs `npm pack --dry-run` on both packages and prints the tarball file lists without publishing. Use this to verify what would ship before you actually publish.

## Versioning policy

- **Semver.** Breaking changes → major bump; new features → minor; bug fixes → patch.
- **Both packages move together.** Even if only the CLI changes, bump both. This keeps `invoicing-kit@X` ↔ `@invoicing-kit/cli@X` always in sync, which matters because the CLI's templates target a specific schema shape the core package expects.
- v0 caveat: anything pre-1.0 is allowed to break in minor bumps per semver — but try not to.

## Local publish (emergency / first-time)

If the GitHub Action is broken and you need to ship from your laptop:

```bash
# from repo root
bun install
bun run --filter '*' build

# auth — use a temporary userconfig so the token doesn't persist in ~/.npmrc
TMPRC=$(mktemp)
trap 'rm -f "$TMPRC"' EXIT
echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" > "$TMPRC"
chmod 600 "$TMPRC"

# verify
npm --userconfig="$TMPRC" whoami

# publish
(cd packages/invoicing-kit && npm --userconfig="$TMPRC" publish --access public)
(cd packages/cli           && npm --userconfig="$TMPRC" publish --access public)
```

Do NOT commit `~/.npmrc` with a token. The temp-userconfig pattern above keeps the token off disk after the shell exits.

## Troubleshooting

| Error | Cause | Fix |
| --- | --- | --- |
| `403 ... Two-factor authentication ... required` | Token doesn't bypass 2FA | Regenerate with **Bypass 2FA: ON** (Granular) or use **Automation** type (Classic) |
| `404 ... Scope not found` (on `@invoicing-kit/cli`) | npm org `invoicing-kit` doesn't exist or you're not a member | Create the org at npmjs.com/org/create or add yourself to it |
| `403 ... cannot publish over previously published version` | Version already on npm | Bump `package.json`, commit, retag, re-release. You **cannot** unpublish and republish the same version. |
| `npm ERR! 402 Payment Required` | First publish on a scoped name without `--access public` | The workflow passes `--access public`; if you're publishing locally, include the flag |
| LICENSE missing from tarball | symlinked LICENSE instead of real file | Both packages already use real copies — don't replace them with symlinks |
| README links broken on npmjs.com | Relative `./` links don't resolve on npm's renderer | Use absolute GitHub URLs in package READMEs if you want them clickable on npm |

## What gets published

Each package's `files` array in `package.json` controls what's in the tarball. Verify with `npm pack --dry-run` before any first-of-its-kind change to the file list.

- `invoicing-kit`: `dist/`, `README.md`, `LICENSE`
- `@invoicing-kit/cli`: `dist/`, `templates/`, `README.md`, `LICENSE`

Source files (`src/`, `tests/`, configs) are intentionally excluded.

# Releasing

Shiploop publishes from a GitHub-hosted runner with npm trusted publishing. The release workflow
does not use a long-lived npm write token.

## One-time setup

1. Create the public GitHub repository and set `repository.url`, `bugs.url`, and `homepage` in
   `package.json` to its exact URL.
2. Publish the package once from a maintainer workstation with npm 2FA. Local workstations cannot
   generate GitHub OIDC provenance, so use `npm publish --provenance=false` for this bootstrap publish
   only. This creates the package settings page needed for trusted publishing.
3. Configure npm's GitHub trusted publisher for the repository and `release.yml`. With npm CLI 11:

   ```bash
   npm trust github shiploop \
     --repo CJianYu/shiploop \
     --file release.yml \
     --allow-publish \
     --yes
   ```

4. Create the `npm-release` GitHub environment and configure its required reviewers.
5. Protect release tags and review who can approve releases.

The npm owner, GitHub owner, repository, and workflow filename are case-sensitive trust inputs.

## Release checklist

1. Move relevant entries from `Unreleased` into a versioned section in `CHANGELOG.md`.
2. Update `package.json` and `package-lock.json` to the same SemVer version.
3. Run the complete local gate:

   ```bash
   npm run check
   npm test
   npm run build
   npm pack --dry-run
   ```

4. Commit the release closeout as `chore(release): prepare X.Y.Z`.
5. Create and push the matching tag, for example `v0.1.0`.

The workflow has separate validation and publication jobs. Validation rejects a tag that does not
exactly match `package.json`, runs every gate, builds the npm tarball, and generates a manifest that
binds its SHA-256 and size to the package identity, tag, and exact Git head. Publication waits for
the `npm-release` environment, downloads that same tarball, verifies the manifest, publishes through
OIDC, and creates GitHub release notes only after npm verification succeeds.

A version already present may proceed only when its npm `gitHead` exactly matches the tag commit;
any other version collision fails closed. Actions are pinned to full commit SHAs, checkout
credentials are not persisted, and only the publication job receives `id-token: write`.

The same evidence can be produced and checked locally:

```bash
npm pack
shiploop release manifest --tag v0.3.0 --artifact shiploop-0.3.0.tgz --output release-manifest.json
shiploop release verify --manifest release-manifest.json --artifact shiploop-0.3.0.tgz
```

## Recovery

Do not reuse a published npm version. Fix forward, increment the version, and publish a new release.
If a release contains a serious issue, use npm deprecation messaging to direct users to the safe
version and follow npm's policy before considering unpublish.

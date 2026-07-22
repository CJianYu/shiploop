# Gradual adoption

Do not install a new workflow everywhere at once. Start by observing the repository, then tighten
one boundary at a time.

## Stage 1: diagnose

```bash
shiploop init --profile team-pr
shiploop doctor
```

Review `.shiploop/config.yml`. Replace invented or overly broad proof commands with commands already
trusted by the project. At this stage no Git behavior is changed.

## Stage 2: prove and review

Use `shiploop proof` and `shiploop review` manually for several changes. Measure whether the selected
checks are fast and relevant. Add `when` patterns for expensive stack-specific checks.

Do not mark a failing required step advisory simply to improve flow. Make it faster, make its scope
more accurate, or keep it in CI.

## Stage 3: safe commits

Adopt `shiploop commit` after contributors understand explicit path ownership. The command refuses
broad pathspecs and unrelated staged work. `team-pr` and `regulated` require a receipt matching the
current diff.

## Stage 4: repository hook

```bash
shiploop hooks install
```

This creates `.githooks/pre-commit` and sets the repository-local `core.hooksPath`. Existing hooks
and custom hook directories are left untouched unless `--force` is explicitly supplied. The hook runs
only steps marked `quick: true`; it cannot issue the full-proof receipt required by a protected
commit. It does not alter global Git configuration. Teams should commit the hook and config, review
changes like code, and provide a documented emergency bypass policy.

## Stage 5: lane discipline

Create task briefs before opening parallel agents. Each brief declares paths the lane owns and paths
it must not touch. Prefer one or two active lanes; add more only when their write surfaces are truly
independent.

```bash
shiploop lane start "Auth cleanup" --owner agent-1 --owns "src/auth/**,test/auth/**"
shiploop lane start "Docs refresh" --owner agent-2 --owns "docs/**"
shiploop lane status
shiploop context --task "Auth cleanup"
```

Lane state is shared through Git's common directory, including across linked worktrees. Likely path
overlap is rejected before a lane starts. Finish a lane when its logical change is integrated:

```bash
shiploop lane finish "Auth cleanup"
```

## Stage 6: evidence and PR gates

Install and authenticate the GitHub CLI, then record evidence only after the final commit exists:

```bash
shiploop evidence run \
  --kind review \
  --summary "Source-aware review completed" \
  --command "codex review --base origin/main"

shiploop evidence add \
  --kind real \
  --summary "Verified the repaired behavior in a real browser" \
  --url "https://example.com/run/123"

shiploop pr inspect
shiploop pr checks --logs
shiploop pr brief
```

Evidence lives under Git's common directory rather than in the working tree. Every record contains
the exact current head SHA; a new commit makes earlier evidence ineligible for that PR head.

After branch protection and GitHub auto-merge are configured, a maintainer may arm a low-risk PR:

```bash
shiploop pr merge --confirm 123
```

This command does not weaken GitHub branch protection. It refuses drafts, conflicts, requested
changes, failing checks, missing configured evidence, and risk above the configured ceiling. The
exact PR number is a mandatory acknowledgement because the operation mutates remote merge state.

## Profile guidance

- `solo-fast`: maintainer controls the repository and can forward-fix quickly.
- `team-pr`: branch protection and review are normal; local proof happens before the PR.
- `regulated`: PRs, recorded evidence, and external controls remain mandatory.

Changing a profile changes defaults, not legal obligations or organizational policy.

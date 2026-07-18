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
shiploop init --profile team-pr --hooks --force
```

This creates `.githooks/pre-commit` and sets the repository-local `core.hooksPath`. The hook runs
only steps marked `quick: true`; it cannot issue the full-proof receipt required by a protected
commit. It does not alter global Git configuration. Teams should commit the hook and config, review
changes like code, and provide a documented emergency bypass policy.

## Stage 5: lane discipline

Create task briefs before opening parallel agents. Each brief declares paths the lane owns and paths
it must not touch. Prefer one or two active lanes; add more only when their write surfaces are truly
independent.

## Profile guidance

- `solo-fast`: maintainer controls the repository and can forward-fix quickly.
- `team-pr`: branch protection and review are normal; local proof happens before the PR.
- `regulated`: PRs, recorded evidence, and external controls remain mandatory.

Changing a profile changes defaults, not legal obligations or organizational policy.

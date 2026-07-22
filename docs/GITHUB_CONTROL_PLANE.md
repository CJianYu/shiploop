# GitHub control plane

Shiploop's GitHub commands turn a pull request into a bounded integration gate. They do not run an
autonomous coding agent, replace branch protection, or grant repository permissions. The local
GitHub CLI remains the authenticated transport.

## Model

```text
final commit
  ├─ exact-head evidence (.git/shiploop/evidence.json)
  ├─ remote checks and review decision (GitHub)
  ├─ changed-file risk (.shiploop/config.yml)
  └─ maintainer confirmation (--confirm PR_NUMBER)
       └─ GitHub auto-merge, still bounded by branch protection
```

Evidence is deliberately attached to a commit SHA rather than a branch name. Updating a PR creates
a new head and invalidates evidence from the earlier revision for merge-gate purposes.

## Evidence

Use `evidence run` when a command can establish the claim:

```bash
shiploop evidence run \
  --kind review \
  --summary "Codex source-aware review clean" \
  --command "codex review --base origin/main"
```

The record is written only when the worktree and index are clean, the command exits successfully,
and the Git head remains stable. Concurrent writers are serialized in Git's common directory.
Use `evidence add` for proof that lives outside the terminal, such as a browser recording, device
test, deployment preview, or externally hosted security report. This is explicitly marked as an
attestation rather than command-verified evidence.

Supported kinds are:

- `proof`: additional targeted or system-level validation.
- `real`: observable after-fix behavior in a real environment.
- `review`: source-aware human or agent review.
- `security`: threat-model, scanner, or security-owner evidence.

## Inspecting a PR

`shiploop pr inspect [number|url|branch]` reads the current PR through `gh` and reports:

- exact head SHA and base branch;
- changed files classified by repository risk rules;
- latest attempt for each GitHub check;
- review decision, draft state, and merge conflicts;
- evidence matching the exact remote head;
- every blocker that prevents arming auto-merge.

GitHub CLI file results are checked against the PR's total changed-file count. Shiploop fails closed
instead of applying a partial risk classification when GitHub returns a truncated list. Renames are
classified using both the old and new paths. Merge policy is loaded from the exact GitHub base SHA,
so neither an uncommitted local edit nor the PR itself can relax its own gate.

`shiploop pr checks --logs` streams failed GitHub Actions logs when check URLs expose run IDs.
`shiploop pr brief` renders a Markdown block suitable for a PR description or maintainer handoff.

## Auto-merge safety

`shiploop pr merge` only arms GitHub auto-merge. It requires `--confirm` to exactly equal the PR
number. It does not press through failing checks, missing evidence, requested changes, conflicts, or
the configured risk ceiling. The assessed head SHA is also sent to GitHub, closing the window where
a newly pushed commit could otherwise inherit an earlier decision. Shiploop also waits for every
visible check—not only branch-protection requirements—to finish successfully before it mutates merge
state. GitHub branch protection remains the final merge authority.

Risk overrides are visible and bounded:

```bash
shiploop pr merge 123 --confirm 123 --allow-risk high
```

An override changes only Shiploop's risk ceiling for that invocation. It does not bypass GitHub
reviews, status checks, rulesets, or permissions.

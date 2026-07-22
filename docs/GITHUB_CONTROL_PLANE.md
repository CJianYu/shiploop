# GitHub control plane

Shiploop's GitHub commands turn a pull request into a bounded integration gate. They do not run an
autonomous coding agent, replace branch protection, or grant repository permissions. The local
GitHub CLI remains the authenticated transport.

## Model

```text
final commit
  ├─ exact head+base evidence (.git/shiploop/evidence.json)
  ├─ remote checks and review decision (GitHub)
  ├─ changed-file risk (.shiploop/config.yml)
  └─ maintainer confirmation (--confirm PR_NUMBER)
       └─ immediate GitHub merge, still bounded by branch protection
```

Diff-aware evidence is deliberately attached to head and base commit SHAs rather than branch names.
Updating the PR or advancing its base invalidates evidence from the earlier diff.

## Evidence

Use `evidence run` when a command can establish the claim:

```bash
shiploop evidence run \
  --kind review \
  --base origin/main \
  --summary "Codex source-aware review completed" \
  --command "codex review --base origin/main"
```

The record is written only when the worktree and index are clean, the command exits successfully,
and the Git head remains stable. `--base` resolves the reviewed base ref to an immutable SHA.
Concurrent writers are serialized in Git's common directory.
Use a review adapter that exits nonzero when actionable findings should block a merge if your policy
requires a clean result rather than proof that a review was completed.
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
- every blocker that prevents a guarded merge.

GitHub CLI file results are checked against the PR's total changed-file count. Shiploop fails closed
instead of applying a partial risk classification when GitHub returns a truncated list. Renames are
classified using both the old and new paths. Merge policy is loaded from the exact GitHub base SHA,
so neither an uncommitted local edit nor the PR itself can relax its own gate.

Shiploop uses `gh pr checks` so check contexts beyond GitHub's first GraphQL page are included; if
the complete rollup cannot be verified, merge assessment fails closed. `shiploop pr checks --logs`
streams failed GitHub Actions logs when check URLs expose run IDs.
`shiploop pr brief` renders a Markdown block suitable for a PR description or maintainer handoff.

## Merge safety

`shiploop pr merge` requires `--confirm` to exactly equal the PR number. It does not press through
failing or pending checks, missing evidence, requested changes, conflicts, or the configured risk
ceiling. The assessed head SHA is sent to GitHub, closing the window where a newly pushed commit could
inherit an earlier decision. Shiploop performs the merge immediately rather than leaving asynchronous
auto-merge armed, because GitHub cannot pin the assessed base SHA while waiting. GitHub branch
protection remains the final merge authority and may still reject the operation. To close the final
base-branch race, Shiploop requires the target branch's classic protection to enforce both strict
up-to-date status checks and protection for administrators. Active ruleset requirements cannot prove
that the merging actor lacks ruleset bypass access and therefore fail closed. Merge-queue branches
are also rejected because an
asynchronously queued merge cannot preserve Shiploop's exact-base evidence guarantee.

Risk overrides are visible and bounded:

```bash
shiploop pr merge 123 --confirm 123 --allow-risk high
```

An override changes only Shiploop's risk ceiling for that invocation. It does not bypass GitHub
reviews, status checks, rulesets, or permissions.

# Shiploop

[![npm version](https://img.shields.io/npm/v/shiploop.svg)](https://www.npmjs.com/package/shiploop)
[![CI](https://github.com/CJianYu/shiploop/actions/workflows/ci.yml/badge.svg)](https://github.com/CJianYu/shiploop/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**The fast path from agent output to trusted software.**

Shiploop is an agent-agnostic local workflow for small tasks, focused proof, risk-aware review,
and explicit atomic commits. It borrows the useful engineering ideas behind high-throughput AI
development—short contexts, parallel lanes, local CI, logical commits, and a releasable default
branch—without assuming that every repository should work directly on `main`.

```text
task brief → agent lane → local proof → explicit commit → head-bound evidence → guarded PR merge
```

## Why Shiploop

Coding agents made generating changes cheap. Trusting and integrating those changes is now the
bottleneck. Shiploop turns repository policy into executable commands:

- `shiploop init` detects Node.js, Python, Go, Rust, and Swift repositories.
- `shiploop doctor` checks that the local fast path is actually usable.
- `shiploop hooks install` adds a quick repository-local hook without rewriting workflow config.
- `shiploop task` creates one-context task briefs with explicit ownership boundaries.
- `shiploop context` emits a compact repository and task packet for any coding agent.
- `shiploop lane` coordinates parallel write surfaces and rejects likely overlap.
- `shiploop proof` selects relevant checks and binds the passing receipt to the current diff.
- `shiploop review` elevates migrations, auth, billing, permissions, CI, and other risky changes.
- `shiploop commit` refuses `.` and globs, requires explicit files, and prevents staged spillover.
- `shiploop closeout` checks cleanliness, proof freshness, branch policy, and upstream sync.
- `shiploop evidence` records review and real-behavior proof against an exact commit SHA.
- `shiploop pr inspect` combines required GitHub checks, changed-file risk, reviews, and local evidence.
- `shiploop pr checks --logs` surfaces failing required Actions logs without hiding red checks.
- `shiploop pr merge` merges only after policy gates and exact-number confirmation.
- Guarded merges require strict up-to-date checks and branch protection enforced for administrators.

No model is hard-coded. Use Shiploop with Codex, Claude Code, Cursor, a shell script, or a human.

## Quick start

Shiploop requires Node.js 20 or newer.

```bash
npm install --global shiploop
cd your-project

shiploop init --profile team-pr --hooks
shiploop doctor
shiploop task "Preserve session expiry" --owner agent-1
shiploop lane start "Preserve session expiry" --owner agent-1 --owns "src/auth/**,test/auth/**"
shiploop context --task "Preserve session expiry"

# Let your preferred coding agent implement the bounded task.
shiploop proof
shiploop review --diff
shiploop commit -m "fix(auth): preserve session expiry" -- src/auth/session.ts test/session.test.ts
shiploop evidence run --kind review --base origin/main --summary "Source-aware review completed" --command "codex review --base origin/main"
shiploop evidence add --kind real --base origin/main --summary "Session expiry reproduced and fixed" --url "https://example.com/artifact"
shiploop pr inspect
shiploop pr brief
shiploop lane finish "Preserve session expiry"
shiploop closeout
```

To work on Shiploop itself from source:

```bash
npm install
npm run build
npm link
```

Hooks are optional. For an already initialized repository, install them independently:

```bash
shiploop hooks install
shiploop hooks status
```

Shiploop refuses to replace an existing `core.hooksPath` or pre-commit file unless `--force` is
explicitly supplied. It never changes global Git configuration.

## Safety profiles

| Profile | Branch strategy | Fresh proof before commit | Best for |
| --- | --- | --- | --- |
| `solo-fast` | Main-first | Recommended | Maintainer-owned repositories |
| `team-pr` | Short branch | Required | Most product teams |
| `regulated` | Pull request | Required | Sensitive or audited systems |

The profiles are starting points, not claims about your risk tolerance. `main-first` is never
silently installed merely because a project has one contributor.

## Configuration

`shiploop init` creates `.shiploop/config.yml` from repository evidence. Review it before use:

```yaml
version: 1
profile: team-pr
repository:
  defaultBranch: main
  strategy: short-branch
proof:
  requireFreshForCommit: true
  steps:
    - name: lint
      command: npm run lint
      required: true
      quick: true
      when:
        - "src/**"
        - "test/**"
risk:
  high:
    - ".shiploop/config.yml"
    - "**/migrations/**"
    - "**/auth/**"
    - ".github/workflows/**"
  medium:
    - "**/api/**"
    - "**/scripts/**"
commit:
  conventional: true
  maxSubjectLength: 72
github:
  requiredEvidence:
    - review
  maxMergeRisk: low
  requireApproval: false
  mergeMethod: squash
```

Proof commands are normal shell commands owned by the repository. A required failure is never
swallowed. After successful proof, Shiploop stores a receipt inside `.git/shiploop/`; editing,
adding, or deleting a file invalidates it.

Steps marked `quick: true` may run from the optional pre-commit hook. Quick proof never creates the
fresh-proof receipt required by protected commits; only a normal `shiploop proof` can do that.
Editors can use [`schemas/config.schema.json`](schemas/config.schema.json) for completion and
validation.

## Operating model

1. **Slice by context, not by org chart.** One task should fit in one agent context.
2. **Assign an ownership boundary.** Parallel lanes must not edit the same hot area.
3. **Prove the changed surface.** Fast local checks protect flow; CI remains the aggregate gate.
4. **Review by risk.** Deep-read authority, money, data, concurrency, and release paths.
5. **Commit logical chunks.** Frequency is an outcome, never a productivity score.
6. **Keep the release path scripted.** A change is not shipped merely because code was generated.

Lane state is local and ephemeral under `.git/shiploop/lanes`; it never dirties the working tree.
Shiploop conservatively rejects overlapping static path prefixes. `--allow-overlap` exists for
coordinated exceptions, not as a default escape hatch.

See [docs/PHILOSOPHY.md](docs/PHILOSOPHY.md) for design trade-offs and
[docs/ADOPTION.md](docs/ADOPTION.md) for gradual rollout. Maintainers should follow
[docs/RELEASING.md](docs/RELEASING.md) for tokenless automated publication. The GitHub PR
control plane is documented in [docs/GITHUB_CONTROL_PLANE.md](docs/GITHUB_CONTROL_PLANE.md).

## Non-goals

- Running autonomous agents with unrestricted permissions.
- Replacing CI, code review, branch protection, or human judgment.
- Manufacturing contribution-graph activity.
- Hiding a failed test behind an advisory status.
- Copying any individual's private prompts, configuration, or identity.

## Status

Shiploop is pre-1.0. Configuration compatibility is not yet guaranteed. The safety invariants of
explicit path commits and non-swallowed required checks are treated as stable.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Shiploop is MIT licensed.

## Inspiration and independence

The workflow is inspired by publicly discussed high-throughput agentic development practices,
including those shared by Peter Steinberger. Shiploop is an independent community project and is
not affiliated with or endorsed by Peter Steinberger.

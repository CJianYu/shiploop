# Changelog

All notable changes will be documented here. This project follows Semantic Versioning and uses
Keep a Changelog categories.

## [Unreleased]

### Added

- Exact-head evidence records for command-verified review, real-behavior, proof, and security runs.
- GitHub PR inspection combining check state, changed-file risk, reviews, and local evidence.
- Failed Actions log retrieval and Markdown readiness blocks for PR descriptions.
- Policy-bounded auto-merge with explicit PR-number confirmation and configurable risk ceilings.
- Fail-closed handling for dirty evidence states, concurrent evidence writes, truncated PR files,
  and PR heads that change while auto-merge is being armed.

### Changed

- Generated profiles now include compatible GitHub evidence and merge policy defaults.

## [0.1.0] - 2026-07-18

### Added

- Repository detection and gradual initialization.
- Read-only environment diagnostics.
- Diff-bound local proof receipts.
- Risk-aware change review.
- Explicit-path atomic commits.
- Agent-lane task briefs and release closeout checks.
- Agent-ready context packets combining task, proof, risk, and active ownership.
- Local parallel lane coordination with conservative overlap detection.
- Idempotent, independently installable hooks that preserve existing repository automation.
- OIDC-based npm release automation with tag/version verification and generated GitHub releases.

### Fixed

- Normalize Git-reported paths across Windows and POSIX before enforcing explicit-path commits.

[Unreleased]: https://github.com/CJianYu/shiploop/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/CJianYu/shiploop/releases/tag/v0.1.0

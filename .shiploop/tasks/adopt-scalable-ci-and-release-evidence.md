# Adopt scalable CI and release evidence

Status: ready
Owner: codex

## Outcome

Shiploop can produce an exact-SHA CI plan, bind GitHub run and artifact metadata to evidence,
and generate or verify an immutable npm release manifest. The repository workflows consume those
primitives with least-privilege, SHA-pinned Actions.

## Ownership boundary

- Files/directories this lane may change: CLI source, tests, schemas, docs, and GitHub workflows.
- Files/directories this lane must not change: unrelated projects or user configuration outside
  this repository.

## Acceptance proof

- [ ] CI planning is tested against exact base/head commits and path lanes
- [ ] Evidence metadata and release-manifest tamper detection have regression coverage
- [ ] `shiploop proof` passes
- [ ] High-risk diffs are deeply reviewed

## Context

Inspired by OpenClaw's preflight routing and release evidence chain, but intentionally limited to
small, reusable primitives rather than repository-specific workflow sprawl.

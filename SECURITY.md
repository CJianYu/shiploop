# Security policy

Shiploop executes repository-configured shell commands and performs Git staging and commits. Treat
changes to `.shiploop/config.yml`, `.githooks/`, and package scripts as executable code.

## Reporting

Do not open a public issue for a vulnerability. Use GitHub's private vulnerability reporting for the
repository. Include reproduction steps, affected versions, and likely impact.

## Supported versions

Before 1.0, only the latest release receives security fixes.

## Invariants

- Shiploop never installs unrestricted agent execution.
- Git hooks are repository-local and opt-in.
- Broad commit pathspecs and path traversal are rejected.
- Required proof failures produce a non-zero exit status.
- Proof receipts live under `.git/` and are invalidated when the working diff changes.

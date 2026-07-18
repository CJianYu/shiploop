# Contributing

Thanks for helping make agent-assisted development more reliable.

## Development

```bash
npm install
npm run check
npm test
npm run build
```

Changes to Git handling require an integration test using a temporary repository. Changes to proof
receipts require a test showing both freshness and invalidation. Never add a code path that silently
swallows a required check failure.

Use Conventional Commits and keep changes scoped. A pull request should explain the user-visible
outcome, its failure modes, and the evidence used to verify it.

## Design principles

- Agent-agnostic artifacts over model-specific orchestration.
- Repository-local configuration over global mutation.
- Explicit paths over broad staging.
- Observable evidence over optimistic status.
- Progressive adoption over surprise enforcement.

By participating, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

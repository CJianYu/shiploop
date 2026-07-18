# Repository instructions

Shiploop is safety-sensitive developer tooling. Preserve these invariants:

- Required proof failures must return a non-zero status.
- A proof receipt must describe the exact current diff and become stale after any change.
- Commit commands must require explicit individual files and refuse broad pathspecs.
- Never discard, unstage, or commit unrelated user work.
- Never modify global Git configuration.
- Agent and model integrations remain optional adapters, not core dependencies.
- Proof must fail if the working diff changes while checks are running.
- Git index mutations must hold the repository-common commit lock.
- Active lane state belongs under Git's common directory, never in the working tree.

Before finishing a change, run:

```bash
npm run check
npm test
npm run build
npm pack --dry-run
```

Add an integration test for changes to Git behavior, proof selection, receipt freshness, or command
exit codes. Keep documentation aligned with observable CLI behavior.

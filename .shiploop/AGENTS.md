# Shiploop operating rules

Ship small, coherent changes. Keep agent context narrow and prove every change locally.

1. Write or select one task brief from `.shiploop/tasks/`.
2. Keep each lane inside the task's declared ownership boundary.
3. Run `shiploop proof` after implementation.
4. Run `shiploop review` and deeply inspect high-risk files.
5. Commit explicit files with `shiploop commit -m "type(scope): subject" -- file...`.
6. Prefer forward fixes. Do not hide failing checks or unrelated work.

Never weaken a proof command merely to get a green result.

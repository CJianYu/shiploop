# Shiploop operating rules

Ship small, coherent changes. Keep agent context narrow and prove every change locally.

1. Write or select one task brief from `.shiploop/tasks/`.
2. Start a lane with explicit ownership; do not overlap another active lane.
3. Load `shiploop context --task "title"` before implementation.
4. Run `shiploop proof` after implementation.
5. Run `shiploop review` and deeply inspect high-risk files.
6. Commit explicit files with `shiploop commit -m "type(scope): subject" -- file...`.
7. Finish the lane and prefer forward fixes. Do not hide failures or unrelated work.

Never weaken a proof command merely to get a green result.

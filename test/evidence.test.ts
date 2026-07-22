import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addEvidence, listEvidence, runEvidence } from '../src/evidence.js';
import { run } from '../src/lib/process.js';

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'shiploop-evidence-'));
  await run('git init -b main', root);
  await run('git config user.name "Shiploop Test"', root);
  await run('git config user.email "shiploop@example.invalid"', root);
  await writeFile(join(root, 'README.md'), '# fixture\n');
  await run('git add README.md && git commit -m "chore: initial fixture"', root);
  return root;
}

describe('head-bound evidence', () => {
  it('records evidence outside the worktree and filters it by exact head', async () => {
    const root = await repository();
    const first = await addEvidence(root, { kind: 'real', summary: 'Verified the browser flow', url: 'https://example.com/run/1' });
    expect((await listEvidence(root)).map((item) => item.id)).toEqual([first.id]);
    expect((await run('git status --short', root)).stdout).toBe('');

    await writeFile(join(root, 'README.md'), '# changed\n');
    await run('git add README.md && git commit -m "docs: change fixture"', root);
    expect(await listEvidence(root)).toEqual([]);
    expect(await listEvidence(root, { all: true })).toHaveLength(1);
  });

  it('records successful command evidence and refuses failed commands', async () => {
    const root = await repository();
    const record = await runEvidence(root, {
      kind: 'review',
      summary: 'Source-aware review is clean',
      command: 'node -e "process.exit(0)"',
    });
    expect(record.source).toBe('command');
    expect(record.durationMs).toBeGreaterThanOrEqual(0);
    await expect(runEvidence(root, {
      kind: 'security',
      summary: 'Security scan',
      command: 'node -e "process.exit(9)"',
    })).rejects.toThrow('nothing was recorded');
    expect(await listEvidence(root)).toHaveLength(1);
  });

  it('refuses evidence from an uncommitted repository state', async () => {
    const root = await repository();
    await writeFile(join(root, 'README.md'), '# uncommitted fix\n');
    await expect(runEvidence(root, {
      kind: 'review',
      summary: 'Would run against dirty code',
      command: 'node -e "process.exit(0)"',
    })).rejects.toThrow('clean worktree and index');
    expect(await listEvidence(root)).toHaveLength(0);
  });

  it('serializes concurrent evidence writes without losing records', async () => {
    const root = await repository();
    await Promise.all([
      addEvidence(root, { kind: 'review', summary: 'Review clean' }),
      addEvidence(root, { kind: 'real', summary: 'Real behavior clean' }),
    ]);
    expect(await listEvidence(root)).toHaveLength(2);
  });
});

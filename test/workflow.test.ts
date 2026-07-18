import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commitCommand } from '../src/commands/commit.js';
import { initCommand } from '../src/commands/init.js';
import { proofCommand } from '../src/commands/proof.js';
import { run } from '../src/lib/process.js';
import { hasFreshReceipt } from '../src/proof-state.js';
import { readReceipt } from '../src/proof-state.js';

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'shiploop-workflow-'));
  await run('git init -b main', root);
  await run('git config user.name "Shiploop Test"', root);
  await run('git config user.email "shiploop@example.invalid"', root);
  await writeFile(join(root, 'package.json'), JSON.stringify({
    name: 'fixture',
    scripts: {
      lint: 'node -e "process.exit(0)"',
      test: 'node -e "process.exit(0)"',
    },
  }));
  await run('git add package.json && git commit -m "chore: initial fixture"', root);
  return root;
}

describe('safe workflow', () => {
  it('invalidates proof receipts when the diff changes', async () => {
    const root = await repository();
    await initCommand(root, { profile: 'team-pr' });
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src/index.js'), 'export const answer = 42;\n');

    await proofCommand(root, {});
    expect(await hasFreshReceipt(root)).toBe(true);
    await writeFile(join(root, 'src/index.js'), 'export const answer = 43;\n');
    expect(await hasFreshReceipt(root)).toBe(false);
  });

  it('commits only explicitly named files after fresh proof', async () => {
    const root = await repository();
    await initCommand(root, { profile: 'team-pr' });
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src/index.js'), 'export const answer = 42;\n');
    await writeFile(join(root, 'notes.txt'), 'unrelated\n');
    await proofCommand(root, {});

    await commitCommand(root, ['src/index.js'], { message: 'feat(core): expose the answer' });
    const committed = await run('git show --pretty="" --name-only HEAD', root);
    expect(committed.stdout.trim()).toBe('src/index.js');
    const status = await run('git status --short', root);
    expect(status.stdout).toContain('notes.txt');
    expect(status.stdout).toContain('.shiploop/');
  });

  it('rejects broad pathspecs and non-conventional messages', async () => {
    const root = await repository();
    await initCommand(root, { profile: 'solo-fast' });
    await expect(commitCommand(root, ['.'], { message: 'feat: unsafe' })).rejects.toThrow('Unsafe path');
    await expect(commitCommand(root, ['package.json'], { message: 'update things' })).rejects.toThrow('Conventional Commits');
  });

  it('returns a failure and does not issue a receipt when a required proof fails', async () => {
    const root = await repository();
    await initCommand(root, { profile: 'team-pr' });
    const configPath = join(root, '.shiploop/config.yml');
    await writeFile(configPath, `version: 1
profile: team-pr
repository:
  defaultBranch: main
  strategy: short-branch
proof:
  requireFreshForCommit: true
  steps:
    - name: failing-check
      command: node -e "process.exit(7)"
      required: true
risk:
  high: []
  medium: []
commit:
  conventional: true
  maxSubjectLength: 72
`);
    const previousExitCode = process.exitCode;
    try {
      process.exitCode = undefined;
      await proofCommand(root, {});
      expect(process.exitCode).toBe(1);
      expect(await readReceipt(root)).toBeUndefined();
    } finally {
      process.exitCode = previousExitCode;
    }
  });
});

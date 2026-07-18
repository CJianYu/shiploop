import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectStacks } from '../src/detect.js';

describe('stack detection', () => {
  it('derives proof commands from package scripts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'shiploop-detect-'));
    await writeFile(join(root, 'package.json'), JSON.stringify({
      scripts: { lint: 'eslint .', typecheck: 'tsc --noEmit', test: 'vitest run' },
    }));
    await writeFile(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9');

    const stacks = await detectStacks(root);
    expect(stacks).toHaveLength(1);
    expect(stacks[0]?.name).toBe('Node.js');
    expect(stacks[0]?.proofSteps.map((step) => step.command)).toEqual([
      'pnpm lint', 'pnpm typecheck', 'pnpm test',
    ]);
  });
});

import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLane, finishLane, listLanes, overlappingPatterns } from '../src/lanes.js';
import { run } from '../src/lib/process.js';

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'shiploop-lanes-'));
  await run('git init -b main', root);
  return root;
}

describe('agent lanes', () => {
  it('conservatively detects path ownership overlap', () => {
    expect(overlappingPatterns(['src/auth/**'], ['src/auth/session.ts'])).toHaveLength(1);
    expect(overlappingPatterns(['src/**'], ['src/api/**'])).toHaveLength(1);
    expect(overlappingPatterns(['docs/**'], ['src/**'])).toHaveLength(0);
    expect(overlappingPatterns(['**/*.sql'], ['src/data/**'])).toHaveLength(1);
  });

  it('rejects overlap with active lanes and permits it after completion', async () => {
    const root = await repository();
    await createLane(root, { title: 'Auth cleanup', owner: 'agent-1', owns: ['src/auth/**'] });
    await createLane(root, { title: 'Docs', owner: 'agent-2', owns: ['docs/**'] });

    await expect(createLane(root, {
      title: 'Session fix', owner: 'agent-3', owns: ['src/auth/session.ts'],
    })).rejects.toThrow('Ownership overlaps an active lane');

    await finishLane(root, 'Auth cleanup');
    await expect(createLane(root, {
      title: 'Session fix', owner: 'agent-3', owns: ['src/auth/session.ts'],
    })).resolves.toMatchObject({ status: 'active' });
    expect((await listLanes(root)).filter((lane) => lane.status === 'active')).toHaveLength(2);
  });

  it('stores coordination state outside the working tree', async () => {
    const root = await repository();
    await createLane(root, { title: 'API', owner: 'agent-1', owns: ['src/api/**'] });
    const status = await run('git status --short', root);
    expect(status.stdout).toBe('');
  });

  it('rejects ownership outside the repository', async () => {
    const root = await repository();
    await expect(createLane(root, {
      title: 'Escape', owner: 'agent-1', owns: ['../other-repo/**'],
    })).rejects.toThrow('Invalid ownership pattern');
  });
});

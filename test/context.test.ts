import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { contextCommand } from '../src/commands/context.js';
import { initCommand } from '../src/commands/init.js';
import { taskCommand } from '../src/commands/task.js';
import { createLane } from '../src/lanes.js';
import { run } from '../src/lib/process.js';

describe('agent context packet', () => {
  it('combines policy, task, lanes, proof, and risk as JSON', async () => {
    const root = await mkdtemp(join(tmpdir(), 'shiploop-context-'));
    await run('git init -b main', root);
    await writeFile(join(root, 'package.json'), JSON.stringify({
      scripts: { lint: 'node -e "process.exit(0)"' },
    }));
    await initCommand(root, { profile: 'team-pr' });
    await taskCommand(root, 'Session expiry', { owner: 'agent-1' });
    await createLane(root, { title: 'Session expiry', owner: 'agent-1', owns: ['src/auth/**'] });
    await writeFile(join(root, 'package-lock.json'), '{}\n');

    const output: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((value?: unknown) => { output.push(String(value)); });
    try {
      await contextCommand(root, { task: 'Session expiry', json: true });
    } finally {
      spy.mockRestore();
    }
    const value = JSON.parse(output.join('\n')) as {
      profile: string;
      activeLanes: Array<{ id: string }>;
      changedFiles: Array<{ file: string; risk: string }>;
      task: { id: string };
    };
    expect(value.profile).toBe('team-pr');
    expect(value.task.id).toBe('session-expiry');
    expect(value.activeLanes).toEqual([{ id: 'session-expiry', owner: 'agent-1', owns: ['src/auth/**'] }]);
    expect(value.changedFiles).toContainEqual({ file: 'package-lock.json', risk: 'high' });
  });
});

import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { withGitLock } from '../src/lib/lock.js';
import { run } from '../src/lib/process.js';

describe('Git-common locks', () => {
  it('serializes operations with a useful owner error and releases afterward', async () => {
    const root = await mkdtemp(join(tmpdir(), 'shiploop-lock-'));
    await run('git init -b main', root);
    await withGitLock(root, 'commit', async () => {
      await expect(withGitLock(root, 'commit', async () => undefined))
        .rejects.toThrow(`pid ${process.pid}`);
    });
    await expect(withGitLock(root, 'commit', async () => 'released')).resolves.toBe('released');
  });
});

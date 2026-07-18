import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { changedFiles } from '../src/lib/git.js';
import { run } from '../src/lib/process.js';

describe('changed file discovery', () => {
  it('omits common untracked dependency trees but keeps project files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'shiploop-git-'));
    await run('git init -b main', root);
    await mkdir(join(root, 'node_modules/example'), { recursive: true });
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'node_modules/example/index.js'), 'generated\n');
    await writeFile(join(root, 'src/index.js'), 'source\n');
    expect(await changedFiles(root)).toEqual(['src/index.js']);
  });
});

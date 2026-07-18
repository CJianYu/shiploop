import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hookStatus, installHooks, MANAGED_PRE_COMMIT_HOOK } from '../src/hooks.js';
import { run } from '../src/lib/process.js';

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'shiploop-hooks-'));
  await run('git init -b main', root);
  return root;
}

describe('repository-local hooks', () => {
  it('installs an idempotent managed hook without global configuration', async () => {
    const root = await repository();
    await installHooks(root);
    await installHooks(root);
    expect(await hookStatus(root)).toEqual({
      hooksPath: '.githooks', configured: true, present: true, managed: true,
    });
    expect(await readFile(join(root, '.githooks/pre-commit'), 'utf8')).toBe(MANAGED_PRE_COMMIT_HOOK);
  });

  it('refuses to overwrite an existing hook', async () => {
    const root = await repository();
    await mkdir(join(root, '.githooks'));
    await writeFile(join(root, '.githooks/pre-commit'), '#!/bin/sh\necho custom\n');
    await chmod(join(root, '.githooks/pre-commit'), 0o755);
    await expect(installHooks(root)).rejects.toThrow('not managed by Shiploop');
    expect(await readFile(join(root, '.githooks/pre-commit'), 'utf8')).toContain('echo custom');
  });

  it('refuses to replace another configured hooks directory', async () => {
    const root = await repository();
    await run('git config core.hooksPath custom-hooks', root);
    await expect(installHooks(root)).rejects.toThrow('custom-hooks');
  });
});

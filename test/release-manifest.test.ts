import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createReleaseManifest, verifyReleaseManifest } from '../src/release-manifest.js';
import { run } from '../src/lib/process.js';

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'shiploop-release-'));
  await run('git init -b main', root);
  await run('git config user.name "Shiploop Test"', root);
  await run('git config user.email "shiploop@example.invalid"', root);
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.2.3' }));
  await run('git add package.json && git commit -m "chore: release fixture" && git tag v1.2.3', root);
  await writeFile(join(root, 'fixture-1.2.3.tgz'), 'package bytes');
  return root;
}

describe('release manifest', () => {
  it('binds an artifact to an exact package, tag, and head', async () => {
    const root = await repository();
    const manifest = await createReleaseManifest(root, {
      tag: 'v1.2.3',
      artifact: 'fixture-1.2.3.tgz',
    });
    await writeFile(join(root, 'release-manifest.json'), `${JSON.stringify(manifest)}\n`);
    const verified = await verifyReleaseManifest(root, {
      manifest: 'release-manifest.json',
      artifact: 'fixture-1.2.3.tgz',
    });
    expect(verified.git.headSha).toMatch(/^[a-f0-9]{40}$/);
    expect(verified.artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a modified artifact', async () => {
    const root = await repository();
    const manifest = await createReleaseManifest(root, {
      tag: 'v1.2.3',
      artifact: 'fixture-1.2.3.tgz',
    });
    await writeFile(join(root, 'release-manifest.json'), `${JSON.stringify(manifest)}\n`);
    await writeFile(join(root, 'fixture-1.2.3.tgz'), `${await readFile(join(root, 'fixture-1.2.3.tgz'), 'utf8')}tampered`);
    await expect(verifyReleaseManifest(root, {
      manifest: 'release-manifest.json',
      artifact: 'fixture-1.2.3.tgz',
    })).rejects.toThrow('does not match');
  });

  it('rejects a mismatched tag and unrelated source changes', async () => {
    const root = await repository();
    await expect(createReleaseManifest(root, {
      tag: 'v9.9.9',
      artifact: 'fixture-1.2.3.tgz',
    })).rejects.toThrow('does not match package version');
    await writeFile(join(root, 'unexpected.ts'), 'uncommitted source\n');
    await expect(createReleaseManifest(root, {
      tag: 'v1.2.3',
      artifact: 'fixture-1.2.3.tgz',
    })).rejects.toThrow('clean source snapshot');
  });
});

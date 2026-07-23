import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCiPlan } from '../src/ci-plan.js';
import { baseConfig, serializeConfig } from '../src/config.js';
import { run } from '../src/lib/process.js';

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'shiploop-ci-plan-'));
  await run('git init -b main', root);
  await run('git config user.name "Shiploop Test"', root);
  await run('git config user.email "shiploop@example.invalid"', root);
  await mkdir(join(root, '.shiploop'));
  const config = baseConfig('team-pr');
  config.ci = {
    docs: ['**/*.md', 'docs/**'],
    lanes: [
      { name: 'test', when: ['src/**', 'test/**'] },
      { name: 'package', when: ['package.json', 'src/**'] },
    ],
  };
  await writeFile(join(root, '.shiploop/config.yml'), serializeConfig(config));
  await writeFile(join(root, 'README.md'), '# fixture\n');
  await run('git add . && git commit -m "chore: initial fixture"', root);
  return root;
}

describe('exact-SHA CI planning', () => {
  it('selects lanes from files changed since the merge base', async () => {
    const root = await repository();
    const base = (await run('git rev-parse HEAD', root)).stdout.trim();
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src/index.ts'), 'export const answer = 42;\n');
    await run('git add src/index.ts && git commit -m "feat: add answer"', root);

    const plan = await createCiPlan(root, base);
    expect(plan.baseSha).toBe(base);
    expect(plan.files).toEqual(['src/index.ts']);
    expect(plan.docsOnly).toBe(false);
    expect(plan.lanes).toEqual(['test', 'package']);
  });

  it('takes the docs-only fast path without scheduling code lanes', async () => {
    const root = await repository();
    const base = (await run('git rev-parse HEAD', root)).stdout.trim();
    await writeFile(join(root, 'README.md'), '# documented\n');
    await run('git add README.md && git commit -m "docs: improve readme"', root);

    const plan = await createCiPlan(root, base);
    expect(plan.docsOnly).toBe(true);
    expect(plan.lanes).toEqual([]);
  });

  it('includes both sides of a rename in risk and lane planning', async () => {
    const root = await repository();
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src/old.ts'), 'export const answer = 42;\n');
    await run('git add src/old.ts && git commit -m "feat: add source"', root);
    const base = (await run('git rev-parse HEAD', root)).stdout.trim();
    await run('git mv src/old.ts README-renamed.md && git commit -m "docs: move source"', root);

    const plan = await createCiPlan(root, base);
    expect(plan.files).toEqual(['README-renamed.md', 'src/old.ts']);
    expect(plan.docsOnly).toBe(false);
    expect(plan.lanes).toEqual(['test', 'package']);
  });
});

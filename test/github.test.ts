import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baseConfig } from '../src/config.js';
import { addEvidence } from '../src/evidence.js';
import { assessPullRequest, parsePullRequest } from '../src/github.js';
import { run } from '../src/lib/process.js';

async function repository(): Promise<{ root: string; head: string }> {
  const root = await mkdtemp(join(tmpdir(), 'shiploop-github-'));
  await run('git init -b main', root);
  await run('git config user.name "Shiploop Test"', root);
  await run('git config user.email "shiploop@example.invalid"', root);
  await writeFile(join(root, 'README.md'), '# fixture\n');
  await run('git add README.md && git commit -m "chore: initial fixture"', root);
  const head = (await run('git rev-parse HEAD', root)).stdout.trim();
  return { root, head };
}

function rawPullRequest(head: string): Record<string, unknown> {
  return {
    number: 42,
    url: 'https://github.com/example/repo/pull/42',
    title: 'fix(auth): preserve sessions',
    state: 'OPEN',
    isDraft: false,
    author: { login: 'agent' },
    headRefName: 'agent/session-fix',
    headRefOid: head,
    baseRefName: 'main',
    mergeStateStatus: 'CLEAN',
    reviewDecision: 'APPROVED',
    files: [{ path: 'src/auth/session.ts' }],
    statusCheckRollup: [
      { name: 'test', status: 'COMPLETED', conclusion: 'FAILURE', completedAt: '2026-01-01T00:00:00Z' },
      { name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS', completedAt: '2026-01-01T00:01:00Z' },
    ],
  };
}

describe('GitHub PR control plane', () => {
  it('normalizes the latest check attempt and enforces risk plus evidence policy', async () => {
    const { root, head } = await repository();
    const snapshot = parsePullRequest(rawPullRequest(head));
    expect(snapshot.checks).toEqual([{ name: 'test', state: 'passing', completedAt: '2026-01-01T00:01:00Z' }]);

    const config = baseConfig('team-pr');
    const blocked = await assessPullRequest(root, snapshot, config);
    expect(blocked.risk).toBe('high');
    expect(blocked.blockers).toContain('Missing required evidence: review.');
    expect(blocked.blockers).toContain('Risk is high; policy allows low.');

    await addEvidence(root, { kind: 'review', summary: 'Review clean' });
    const ready = await assessPullRequest(root, snapshot, config, { allowRisk: 'high' });
    expect(ready.readyToArm).toBe(true);
    expect(ready.evidence).toHaveLength(1);
  });

  it('blocks drafts, requested changes, conflicts, and current failing checks', async () => {
    const { root, head } = await repository();
    const raw = rawPullRequest(head);
    raw.isDraft = true;
    raw.mergeStateStatus = 'DIRTY';
    raw.reviewDecision = 'CHANGES_REQUESTED';
    raw.files = [{ path: 'README.md' }];
    raw.statusCheckRollup = [{ name: 'test', status: 'COMPLETED', conclusion: 'FAILURE' }];
    const config = baseConfig('solo-fast');
    const value = await assessPullRequest(root, parsePullRequest(raw), config);
    expect(value.blockers).toEqual(expect.arrayContaining([
      'PR is still a draft.',
      'PR has merge conflicts.',
      'A reviewer requested changes.',
      '1 check(s) are failing.',
    ]));
  });
});

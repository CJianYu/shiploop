import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { baseConfig } from '../src/config.js';
import { addEvidence } from '../src/evidence.js';
import { assessPullRequest, parseBranchRules, parsePullRequest, parsePullRequestFiles } from '../src/github.js';
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
    baseRefOid: `${head.slice(0, -1)}0`,
    mergeStateStatus: 'CLEAN',
    reviewDecision: 'APPROVED',
    files: [{ path: 'src/auth/session.ts' }],
    changedFiles: 1,
    requiresStrictStatusChecks: true,
    protectionEnforcedForAdmins: true,
    currentHeadApprovalRequired: true,
    requiresMergeQueue: false,
    hasRulesetRequirements: false,
    branchRulesKnown: true,
    checksKnown: true,
    statusCheckRollup: [
      { name: 'test', workflowName: 'CI', detailsUrl: 'https://github.com/example/repo/actions/runs/100/job/2', status: 'COMPLETED', conclusion: 'SUCCESS', completedAt: '2026-01-01T00:01:00Z' },
    ],
  };
}

describe('GitHub PR control plane', () => {
  it('normalizes checks and enforces risk plus evidence policy', async () => {
    const { root, head } = await repository();
    const snapshot = parsePullRequest(rawPullRequest(head));
    expect(snapshot.checks).toEqual([{ name: 'test', state: 'passing', url: 'https://github.com/example/repo/actions/runs/100/job/2', completedAt: '2026-01-01T00:01:00Z', workflow: 'CI' }]);

    const config = baseConfig('team-pr');
    const blocked = await assessPullRequest(root, snapshot, config);
    expect(blocked.risk).toBe('high');
    expect(blocked.blockers).toContain('Missing required evidence: review.');
    expect(blocked.blockers).toContain('Risk is high; policy allows low.');

    await addEvidence(root, { kind: 'review', summary: 'Review clean', base: 'HEAD' });
    snapshot.baseSha = head;
    const ready = await assessPullRequest(root, snapshot, config, { allowRisk: 'high' });
    expect(ready.readyToMerge).toBe(true);
    expect(ready.evidence).toHaveLength(1);
  });

  it('keeps separate Actions jobs visible even when their names match', async () => {
    const { head } = await repository();
    const raw = rawPullRequest(head);
    raw.statusCheckRollup = [
      { name: 'test', workflowName: 'CI', detailsUrl: 'https://github.com/example/repo/actions/runs/100/job/1', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-01-01T00:00:00Z', completedAt: '2026-01-01T00:01:00Z' },
      { name: 'test', workflowName: 'CI', detailsUrl: 'https://github.com/example/repo/actions/runs/100/job/2', status: 'IN_PROGRESS', startedAt: '2026-01-01T00:02:00Z' },
    ];
    expect(parsePullRequest(raw).checks).toEqual([
      { name: 'test', state: 'passing', url: 'https://github.com/example/repo/actions/runs/100/job/1', completedAt: '2026-01-01T00:01:00Z', startedAt: '2026-01-01T00:00:00Z', workflow: 'CI' },
      { name: 'test', state: 'pending', url: 'https://github.com/example/repo/actions/runs/100/job/2', startedAt: '2026-01-01T00:02:00Z', workflow: 'CI' },
    ]);
  });

  it('normalizes the buckets returned by the paginated gh checks command', async () => {
    const { head } = await repository();
    const raw = rawPullRequest(head);
    raw.statusCheckRollup = [
      { name: 'pass', bucket: 'pass', link: 'https://example.com/pass' },
      { name: 'skip', bucket: 'skipping' },
      { name: 'wait', bucket: 'pending' },
      { name: 'fail', bucket: 'fail' },
      { name: 'cancel', bucket: 'cancel' },
    ];
    expect(parsePullRequest(raw).checks.map(({ name, state }) => ({ name, state }))).toEqual([
      { name: 'cancel', state: 'failing' },
      { name: 'fail', state: 'failing' },
      { name: 'pass', state: 'passing' },
      { name: 'skip', state: 'passing' },
      { name: 'wait', state: 'pending' },
    ]);
  });

  it('preserves same-named checks from different workflows and blocks pending checks', async () => {
    const { root, head } = await repository();
    const raw = rawPullRequest(head);
    raw.files = [{ path: 'README.md' }];
    raw.statusCheckRollup = [
      { name: 'test', workflowName: 'CI', detailsUrl: 'https://github.com/example/repo/actions/runs/100/job/1', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { name: 'test', workflowName: 'CI', detailsUrl: 'https://github.com/example/repo/actions/runs/200/job/2', status: 'IN_PROGRESS', startedAt: '2026-01-01T00:02:00Z' },
    ];
    const value = await assessPullRequest(root, parsePullRequest(raw), baseConfig('solo-fast'));
    expect(value.checks.passing).toHaveLength(1);
    expect(value.checks.pending).toHaveLength(1);
    expect(value.blockers).toContain('1 check(s) are still pending.');
  });

  it('invalidates required evidence when the PR base advances', async () => {
    const { root, head } = await repository();
    const snapshot = parsePullRequest(rawPullRequest(head));
    snapshot.files = ['README.md'];
    snapshot.listedFileCount = 1;
    snapshot.baseSha = head;
    await addEvidence(root, { kind: 'review', summary: 'Review complete', base: 'HEAD' });
    expect((await assessPullRequest(root, snapshot, baseConfig('team-pr'))).missingEvidence).toEqual([]);
    snapshot.baseSha = `${head.slice(0, -1)}0`;
    const stale = await assessPullRequest(root, snapshot, baseConfig('team-pr'));
    expect(stale.missingEvidence).toEqual(['review']);
    expect(stale.evidence).toEqual([]);
  });

  it('classifies startup failures as failing', async () => {
    const { root, head } = await repository();
    const raw = rawPullRequest(head);
    raw.files = [{ path: 'README.md' }];
    raw.statusCheckRollup = [{ name: 'test', workflowName: 'CI', status: 'COMPLETED', conclusion: 'STARTUP_FAILURE' }];
    const value = await assessPullRequest(root, parsePullRequest(raw), baseConfig('solo-fast'));
    expect(value.checks.failing).toHaveLength(1);
    expect(value.readyToMerge).toBe(false);
  });

  it('includes both sides of a rename in risk input', () => {
    expect(parsePullRequestFiles([[{
      filename: 'src/session.ts',
      previous_filename: 'src/auth/session.ts',
    }]])).toEqual({ paths: ['src/session.ts', 'src/auth/session.ts'], fileCount: 1 });
  });

  it('always treats the merge-policy file as high risk', async () => {
    const { root, head } = await repository();
    const raw = rawPullRequest(head);
    raw.files = [{ path: '.shiploop/config.yml' }];
    const value = await assessPullRequest(root, parsePullRequest(raw), baseConfig('solo-fast'));
    expect(value.risk).toBe('high');
    expect(value.readyToMerge).toBe(false);
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

  it('fails closed unless GitHub confirms a clean merge state', async () => {
    const { root, head } = await repository();
    const raw = rawPullRequest(head);
    raw.files = [{ path: 'README.md' }];
    raw.mergeStateStatus = 'UNKNOWN';
    const value = await assessPullRequest(root, parsePullRequest(raw), baseConfig('solo-fast'));
    expect(value.blockers).toContain('GitHub merge state is UNKNOWN, not clean.');
    expect(value.readyToMerge).toBe(false);
  });

  it('permits an unstable merge state when every required check passes', async () => {
    const { root, head } = await repository();
    const raw = rawPullRequest(head);
    raw.files = [{ path: 'README.md' }];
    raw.mergeStateStatus = 'UNSTABLE';
    const value = await assessPullRequest(root, parsePullRequest(raw), baseConfig('solo-fast'));
    expect(value.blockers).not.toContain(expect.stringContaining('merge state'));
    expect(value.readyToMerge).toBe(true);
  });

  it('requires remote strict status checks to close the base race', async () => {
    const { root, head } = await repository();
    const raw = rawPullRequest(head);
    raw.files = [{ path: 'README.md' }];
    raw.requiresStrictStatusChecks = false;
    const value = await assessPullRequest(root, parsePullRequest(raw), baseConfig('solo-fast'));
    expect(value.blockers).toContain('Base branch does not require strict up-to-date status checks.');
    expect(value.readyToMerge).toBe(false);
  });

  it('requires branch protection to apply to administrators', async () => {
    const { root, head } = await repository();
    const raw = rawPullRequest(head);
    raw.files = [{ path: 'README.md' }];
    raw.protectionEnforcedForAdmins = false;
    const value = await assessPullRequest(root, parsePullRequest(raw), baseConfig('solo-fast'));
    expect(value.blockers).toContain('Base branch protection is not enforced for administrators.');
    expect(value.readyToMerge).toBe(false);
  });

  it('requires current-head remote approval protection for regulated policy', async () => {
    const { root, head } = await repository();
    const raw = rawPullRequest(head);
    raw.files = [{ path: 'README.md' }];
    raw.currentHeadApprovalRequired = false;
    const value = await assessPullRequest(root, parsePullRequest(raw), baseConfig('regulated'));
    expect(value.blockers).toContain('Policy approval is not remotely enforced for the current head.');
    expect(value.readyToMerge).toBe(false);
  });

  it('recognizes merge queues across ruleset pages and rejects them', async () => {
    expect(parseBranchRules([
      [{ type: 'required_status_checks', parameters: { strict_required_status_checks_policy: true } }],
      [{ type: 'merge_queue' }],
    ])).toEqual({ mergeQueue: true, hasRequirements: true });

    const { root, head } = await repository();
    const raw = rawPullRequest(head);
    raw.files = [{ path: 'README.md' }];
    raw.requiresMergeQueue = true;
    const value = await assessPullRequest(root, parsePullRequest(raw), baseConfig('solo-fast'));
    expect(value.blockers).toContain('Base branch requires a merge queue, which exact-diff merge does not support.');
    expect(value.readyToMerge).toBe(false);
  });

  it('fails closed when any active ruleset requirement may be bypassable', async () => {
    const { root, head } = await repository();
    const raw = rawPullRequest(head);
    raw.files = [{ path: 'README.md' }];
    raw.hasRulesetRequirements = true;
    const value = await assessPullRequest(root, parsePullRequest(raw), baseConfig('solo-fast'));
    expect(value.blockers).toContain('Active ruleset requirements cannot be proven safe from actor bypass.');
    expect(value.readyToMerge).toBe(false);
  });

  it('fails closed when GitHub truncates the changed-file list', async () => {
    const { root, head } = await repository();
    const raw = rawPullRequest(head);
    raw.files = Array.from({ length: 100 }, (_, index) => ({ path: `src/file-${index}.ts` }));
    raw.changedFiles = 101;
    const value = await assessPullRequest(root, parsePullRequest(raw), baseConfig('solo-fast'));
    expect(value.readyToMerge).toBe(false);
    expect(value.blockers).toContain('GitHub returned 100 of 101 changed files; risk cannot be assessed safely.');
  });

  it('fails closed when the complete check rollup cannot be verified', async () => {
    const { root, head } = await repository();
    const raw = rawPullRequest(head);
    raw.files = [{ path: 'README.md' }];
    raw.checksKnown = false;
    const value = await assessPullRequest(root, parsePullRequest(raw), baseConfig('solo-fast'));
    expect(value.readyToMerge).toBe(false);
    expect(value.blockers).toContain('The complete GitHub check rollup could not be verified.');
  });
});

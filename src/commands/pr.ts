import { githubPolicy, loadConfig } from '../config.js';
import { assessPullRequest, fetchPullRequest, type PullRequestAssessment, type PullRequestSnapshot } from '../github.js';
import { runArgs } from '../lib/process.js';
import type { PolicyRiskLevel } from '../types.js';
import { ui } from '../ui.js';

function printable(snapshot: PullRequestSnapshot, assessment: PullRequestAssessment): object {
  return {
    pullRequest: snapshot,
    readiness: assessment,
  };
}

function printSummary(snapshot: PullRequestSnapshot, assessment: PullRequestAssessment): void {
  ui.heading(`PR #${snapshot.number}: ${snapshot.title}`);
  ui.info(`${snapshot.headRefName} → ${snapshot.baseRefName} · ${snapshot.files.length} file(s) · ${assessment.risk} risk`);
  console.log(`URL: ${snapshot.url}`);
  console.log(`Checks: ${assessment.checks.passing.length} passing, ${assessment.checks.pending.length} pending, ${assessment.checks.failing.length} failing`);
  console.log(`Evidence: ${assessment.evidence.length ? assessment.evidence.map((item) => item.kind).join(', ') : 'none for this head'}`);
  if (assessment.readyToArm) ui.ok('Ready to arm for policy-bounded auto-merge.');
  else {
    ui.warn('Not ready to arm:');
    for (const blocker of assessment.blockers) console.log(`  - ${blocker}`);
  }
}

function repositoryFromUrl(url: string): string | undefined {
  return url.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/\d+/)?.[1];
}

async function snapshotAndAssessment(
  cwd: string,
  selector: string | undefined,
  allowRisk?: PolicyRiskLevel,
): Promise<{ snapshot: PullRequestSnapshot; assessment: PullRequestAssessment }> {
  const snapshot = await fetchPullRequest(cwd, selector);
  const config = await loadConfig(cwd);
  const assessment = await assessPullRequest(cwd, snapshot, config, { ...(allowRisk ? { allowRisk } : {}) });
  return { snapshot, assessment };
}

export async function prInspectCommand(
  cwd: string,
  selector: string | undefined,
  options: { json?: boolean },
): Promise<void> {
  const { snapshot, assessment } = await snapshotAndAssessment(cwd, selector);
  if (options.json) console.log(JSON.stringify(printable(snapshot, assessment), null, 2));
  else printSummary(snapshot, assessment);
}

export async function prChecksCommand(
  cwd: string,
  selector: string | undefined,
  options: { logs?: boolean; json?: boolean },
): Promise<void> {
  const { snapshot, assessment } = await snapshotAndAssessment(cwd, selector);
  if (options.json) {
    console.log(JSON.stringify({ number: snapshot.number, checks: assessment.checks }, null, 2));
    return;
  }
  ui.heading(`Checks for PR #${snapshot.number}`);
  for (const check of snapshot.checks) {
    const marker = check.state === 'passing' ? '✓' : check.state === 'failing' ? '✗' : '…';
    console.log(`${marker} ${check.name}${check.url ? ` · ${check.url}` : ''}`);
  }
  if (options.logs && assessment.checks.failing.length) {
    const runIds = [...new Set(assessment.checks.failing.flatMap((check) => {
      const match = check.url?.match(/\/actions\/runs\/(\d+)/);
      return match?.[1] ? [match[1]] : [];
    }))];
    if (!runIds.length) ui.warn('Failing checks do not expose GitHub Actions run URLs.');
    for (const id of runIds) {
      ui.info(`Failed logs from run ${id}`);
      const repository = repositoryFromUrl(snapshot.url);
      const result = await runArgs('gh', [
        'run', 'view', id, '--log-failed', ...(repository ? ['--repo', repository] : []),
      ], cwd, { inherit: true });
      if (result.code !== 0) process.exitCode = result.code;
    }
  }
  if (assessment.checks.failing.length) process.exitCode = 1;
}

export async function prBriefCommand(cwd: string, selector?: string): Promise<void> {
  const { snapshot, assessment } = await snapshotAndAssessment(cwd, selector);
  console.log('## Shiploop readiness');
  console.log(`\n- Head: \`${snapshot.headSha}\``);
  console.log(`- Change surface: ${snapshot.files.length} file(s), **${assessment.risk} risk**`);
  console.log(`- Checks: ${assessment.checks.passing.length} passing, ${assessment.checks.pending.length} pending, ${assessment.checks.failing.length} failing`);
  console.log('\n### Evidence');
  if (!assessment.evidence.length) console.log('\n- No evidence recorded for this exact head.');
  for (const item of assessment.evidence) {
    const suffix = item.url ? ` ([artifact](${item.url}))` : '';
    console.log(`\n- **${item.kind}**: ${item.summary}${suffix}`);
    if (item.command) console.log(`  - Command: \`${item.command.replaceAll('`', '\\`')}\``);
  }
  console.log('\n### Policy gate');
  if (assessment.readyToArm) console.log('\n- Ready to arm for policy-bounded auto-merge.');
  else for (const blocker of assessment.blockers) console.log(`\n- [ ] ${blocker}`);
  console.log(`\n<!-- shiploop-readiness:v1 head=${snapshot.headSha} -->`);
}

export async function prMergeCommand(
  cwd: string,
  selector: string | undefined,
  options: { confirm: string; allowRisk?: PolicyRiskLevel },
): Promise<void> {
  const { snapshot, assessment } = await snapshotAndAssessment(cwd, selector, options.allowRisk);
  if (options.confirm !== String(snapshot.number)) {
    throw new Error(`Confirmation must exactly match PR number ${snapshot.number}.`);
  }
  if (!assessment.readyToArm) {
    throw new Error(`Refusing to arm auto-merge:\n${assessment.blockers.map((item) => `  - ${item}`).join('\n')}`);
  }
  const config = await loadConfig(cwd);
  const method = githubPolicy(config).mergeMethod;
  const result = await runArgs('gh', ['pr', 'merge', snapshot.url, '--auto', `--${method}`], cwd, { inherit: true });
  if (result.code !== 0) {
    process.exitCode = result.code;
    return;
  }
  ui.ok(`Armed PR #${snapshot.number} for ${method} auto-merge.`);
  if (assessment.checks.pending.length) ui.info(`${assessment.checks.pending.length} pending check(s) still gate the merge.`);
}

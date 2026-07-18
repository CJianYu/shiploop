import { loadConfig } from '../config.js';
import { changedFiles, currentBranch } from '../lib/git.js';
import { runArgs } from '../lib/process.js';
import { hasFreshReceipt } from '../proof-state.js';
import { ui } from '../ui.js';

export async function closeoutCommand(cwd: string, options: { json?: boolean }): Promise<void> {
  const config = await loadConfig(cwd);
  const branch = await currentBranch(cwd);
  const files = await changedFiles(cwd);
  const freshProof = await hasFreshReceipt(cwd);
  const upstream = await runArgs('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], cwd);
  let ahead = 0;
  let behind = 0;
  if (upstream.code === 0) {
    const counts = await runArgs('git', ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], cwd);
    const [left = '0', right = '0'] = counts.stdout.trim().split(/\s+/);
    ahead = Number(left);
    behind = Number(right);
  }
  const checks = [
    { name: 'working tree', passed: files.length === 0, detail: files.length ? `${files.length} uncommitted file(s)` : 'clean' },
    { name: 'branch', passed: branch === config.repository.defaultBranch || config.repository.strategy !== 'main-first', detail: branch || 'detached HEAD' },
    { name: 'proof', passed: files.length === 0 || freshProof, detail: freshProof ? 'fresh' : files.length ? 'missing or stale' : 'not needed' },
    { name: 'upstream', passed: upstream.code === 0, detail: upstream.code === 0 ? upstream.stdout.trim() : 'not configured' },
    { name: 'sync', passed: upstream.code === 0 && ahead === 0 && behind === 0, detail: `${ahead} ahead, ${behind} behind` },
  ];
  if (options.json) console.log(JSON.stringify({ checks }, null, 2));
  else {
    ui.heading('Release closeout');
    for (const check of checks) {
      (check.passed ? ui.ok : ui.warn)(`${check.name}: ${check.detail}`);
    }
  }
  if (checks.some((check) => !check.passed)) process.exitCode = 1;
}

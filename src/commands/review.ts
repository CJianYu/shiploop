import { loadConfig } from '../config.js';
import { changedFiles } from '../lib/git.js';
import { runArgs } from '../lib/process.js';
import { classifyFiles } from '../risk.js';
import { ui } from '../ui.js';

export async function reviewCommand(cwd: string, options: { json?: boolean; diff?: boolean }): Promise<void> {
  const config = await loadConfig(cwd);
  const files = await changedFiles(cwd);
  const classified = classifyFiles(files, config);

  if (options.json) {
    console.log(JSON.stringify({ files: classified }, null, 2));
    return;
  }

  ui.heading('Risk-aware review');
  if (!classified.length) {
    ui.warn('No changed files.');
    return;
  }
  for (const risk of ['high', 'medium', 'low'] as const) {
    const group = classified.filter((item) => item.risk === risk);
    if (!group.length) continue;
    const label = `${risk.toUpperCase()} RISK (${group.length})`;
    if (risk === 'high') ui.fail(label);
    else if (risk === 'medium') ui.warn(label);
    else ui.ok(label);
    for (const item of group) console.log(`  ${item.file}`);
  }
  if (classified.some((item) => item.risk === 'high')) {
    ui.info('Deep-read high-risk diffs; verify migrations, rollback paths, permissions, and secrets.');
  }
  const stats = await runArgs('git', ['diff', '--stat', 'HEAD'], cwd);
  if (stats.stdout.trim()) console.log(`\n${stats.stdout.trimEnd()}`);
  if (options.diff) {
    const diff = await runArgs('git', ['diff', 'HEAD'], cwd, { inherit: true });
    if (diff.code !== 0) process.exitCode = diff.code;
  }
}

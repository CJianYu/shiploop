import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runArgs } from './lib/process.js';

export const MANAGED_PRE_COMMIT_HOOK = `#!/usr/bin/env sh
set -eu

if command -v shiploop >/dev/null 2>&1; then
  shiploop proof --staged --quick
elif [ -x node_modules/.bin/shiploop ]; then
  node_modules/.bin/shiploop proof --staged --quick
elif [ -f dist/cli.js ] && [ "$(node -p "require('./package.json').name" 2>/dev/null || true)" = "shiploop" ]; then
  node dist/cli.js proof --staged --quick
else
  echo "shiploop is not installed; skipping project hook" >&2
fi
`;

export interface HookStatus {
  hooksPath: string;
  configured: boolean;
  present: boolean;
  managed: boolean;
}

export async function installHooks(root: string, options: { force?: boolean } = {}): Promise<void> {
  const status = await hookStatus(root);
  if (status.hooksPath && status.hooksPath !== '.githooks' && !options.force) {
    throw new Error(`core.hooksPath is already set to ${status.hooksPath}. Refusing to replace it without --force.`);
  }
  if (status.present && !status.managed && !options.force) {
    throw new Error('.githooks/pre-commit already exists and is not managed by Shiploop. Use --force only after reviewing it.');
  }
  const hookDir = join(root, '.githooks');
  const hookPath = join(hookDir, 'pre-commit');
  await mkdir(hookDir, { recursive: true });
  await writeFile(hookPath, MANAGED_PRE_COMMIT_HOOK);
  await chmod(hookPath, 0o755);
  const configured = await runArgs('git', ['config', 'core.hooksPath', '.githooks'], root);
  if (configured.code !== 0) throw new Error(configured.stderr || 'Could not configure Git hooks.');
}

export async function hookStatus(root: string): Promise<HookStatus> {
  const setting = await runArgs('git', ['config', '--get', 'core.hooksPath'], root);
  const hooksPath = setting.code === 0 ? setting.stdout.trim() : '';
  let content: string | undefined;
  try { content = await readFile(join(root, '.githooks/pre-commit'), 'utf8'); } catch { /* absent */ }
  return {
    hooksPath,
    configured: hooksPath === '.githooks',
    present: content !== undefined,
    managed: content === MANAGED_PRE_COMMIT_HOOK,
  };
}

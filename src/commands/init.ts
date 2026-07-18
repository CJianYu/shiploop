import { access, chmod, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { baseConfig, CONFIG_PATH, serializeConfig } from '../config.js';
import { detectStacks } from '../detect.js';
import { defaultBranch, isGitRepository } from '../lib/git.js';
import { runArgs } from '../lib/process.js';
import type { Profile } from '../types.js';
import { ui } from '../ui.js';

const guide = `# Shiploop operating rules

Ship small, coherent changes. Keep agent context narrow and prove every change locally.

1. Write or select one task brief from \`.shiploop/tasks/\`.
2. Start a lane with explicit ownership; do not overlap another active lane.
3. Load \`shiploop context --task "title"\` before implementation.
4. Run \`shiploop proof\` after implementation.
5. Run \`shiploop review\` and deeply inspect high-risk files.
6. Commit explicit files with \`shiploop commit -m "type(scope): subject" -- file...\`.
7. Finish the lane and prefer forward fixes. Do not hide failures or unrelated work.

Never weaken a proof command merely to get a green result.
`;

const preCommitHook = `#!/usr/bin/env sh
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

async function pathExists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

export async function initCommand(
  cwd: string,
  options: { profile: Profile; force?: boolean; hooks?: boolean },
): Promise<void> {
  if (!(await isGitRepository(cwd))) throw new Error('Run shiploop init inside a Git repository.');
  const configPath = join(cwd, CONFIG_PATH);
  if ((await pathExists(configPath)) && !options.force) {
    throw new Error(`${CONFIG_PATH} already exists. Use --force to replace it.`);
  }

  const stacks = await detectStacks(cwd);
  const config = baseConfig(options.profile);
  config.repository.defaultBranch = await defaultBranch(cwd);
  config.proof.steps = stacks.flatMap((stack) => stack.proofSteps);

  await mkdir(dirname(configPath), { recursive: true });
  await mkdir(join(cwd, '.shiploop/tasks'), { recursive: true });
  await writeFile(configPath, serializeConfig(config));
  await writeFile(join(cwd, '.shiploop/AGENTS.md'), guide);
  await writeFile(join(cwd, '.shiploop/tasks/.gitkeep'), '');

  if (options.hooks) {
    const hookDir = join(cwd, '.githooks');
    const hookPath = join(hookDir, 'pre-commit');
    await mkdir(hookDir, { recursive: true });
    await writeFile(hookPath, preCommitHook);
    await chmod(hookPath, 0o755);
    const configured = await runArgs('git', ['config', 'core.hooksPath', '.githooks'], cwd);
    if (configured.code !== 0) throw new Error(configured.stderr || 'Could not configure Git hooks.');
  }

  ui.ok(`Created ${CONFIG_PATH} with the ${options.profile} profile.`);
  if (stacks.length) ui.info(`Detected: ${stacks.map((stack) => stack.name).join(', ')}`);
  else ui.warn('No supported stack detected. Add proof steps to the generated config.');
  if (options.hooks) ui.ok('Installed a repository-local pre-commit hook.');
  ui.info('Next: review the config, then run shiploop doctor.');
}

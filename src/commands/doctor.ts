import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { CONFIG_PATH, loadConfig } from '../config.js';
import { detectStacks } from '../detect.js';
import { currentBranch, isGitRepository } from '../lib/git.js';
import { runArgs } from '../lib/process.js';
import { ui } from '../ui.js';

interface Check { name: string; status: 'pass' | 'warn' | 'fail'; detail: string }

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

function executableFrom(command: string): string | undefined {
  const match = command.trim().match(/^([A-Za-z0-9_.-]+)/);
  return match?.[1];
}

export async function doctorCommand(cwd: string, options: { json?: boolean }): Promise<void> {
  const checks: Check[] = [];
  const git = await isGitRepository(cwd);
  checks.push({ name: 'git', status: git ? 'pass' : 'fail', detail: git ? 'Git repository found' : 'Not a Git repository' });
  if (!git) return finish(checks, options.json);

  let config;
  try {
    config = await loadConfig(cwd);
    checks.push({ name: 'config', status: 'pass', detail: `${CONFIG_PATH} is valid` });
  } catch (error) {
    checks.push({ name: 'config', status: 'fail', detail: (error as Error).message });
    return finish(checks, options.json);
  }

  const stacks = await detectStacks(cwd);
  checks.push({
    name: 'stack', status: stacks.length ? 'pass' : 'warn',
    detail: stacks.length ? stacks.map((stack) => stack.name).join(', ') : 'No supported stack detected',
  });

  const tools = [...new Set(config.proof.steps.map((step) => executableFrom(step.command)).filter(Boolean))] as string[];
  for (const tool of tools) {
    const locator = process.platform === 'win32' ? 'where' : 'which';
    const found = (await runArgs(locator, [tool], cwd)).code === 0;
    checks.push({ name: `tool:${tool}`, status: found ? 'pass' : 'fail', detail: found ? 'Available' : 'Not found on PATH' });
  }

  checks.push({
    name: 'proof', status: config.proof.steps.length ? 'pass' : 'warn',
    detail: config.proof.steps.length ? `${config.proof.steps.length} configured step(s)` : 'No proof steps configured',
  });
  const branch = await currentBranch(cwd);
  const branchOkay = config.repository.strategy !== 'main-first' || branch === config.repository.defaultBranch;
  checks.push({
    name: 'branch', status: branchOkay ? 'pass' : 'warn',
    detail: branch ? `Current branch: ${branch}` : 'Detached HEAD',
  });

  const hookPath = join(cwd, '.githooks/pre-commit');
  const hooksSetting = (await runArgs('git', ['config', '--get', 'core.hooksPath'], cwd)).stdout.trim();
  const hookReady = hooksSetting === '.githooks' && await exists(hookPath);
  checks.push({
    name: 'hooks', status: hookReady ? 'pass' : 'warn',
    detail: hookReady ? 'Repository-local hook enabled' : 'Hooks not enabled (optional)',
  });
  finish(checks, options.json);
}

function finish(checks: Check[], json = false): void {
  if (json) console.log(JSON.stringify({ checks }, null, 2));
  else {
    ui.heading('Shiploop doctor');
    for (const check of checks) {
      const message = `${check.name}: ${check.detail}`;
      if (check.status === 'pass') ui.ok(message);
      else if (check.status === 'warn') ui.warn(message);
      else ui.fail(message);
    }
  }
  if (checks.some((check) => check.status === 'fail')) process.exitCode = 1;
}

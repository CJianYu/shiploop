import { CONFIG_PATH, loadConfig } from '../config.js';
import { detectStacks } from '../detect.js';
import { hookStatus } from '../hooks.js';
import { currentBranch, isGitRepository } from '../lib/git.js';
import { runArgs } from '../lib/process.js';
import { ui } from '../ui.js';

interface Check { name: string; status: 'pass' | 'warn' | 'fail'; detail: string }

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
  if (config.github) {
    const locator = process.platform === 'win32' ? 'where' : 'which';
    const ghFound = (await runArgs(locator, ['gh'], cwd)).code === 0;
    checks.push({
      name: 'github:gh', status: ghFound ? 'pass' : 'warn',
      detail: ghFound ? 'GitHub CLI available' : 'GitHub CLI not found; PR commands are unavailable',
    });
    if (ghFound) {
      const authenticated = (await runArgs('gh', ['auth', 'status'], cwd)).code === 0;
      checks.push({
        name: 'github:auth', status: authenticated ? 'pass' : 'warn',
        detail: authenticated ? 'GitHub CLI authenticated' : 'Run gh auth login before using PR commands',
      });
    }
  }
  const branch = await currentBranch(cwd);
  const branchOkay = config.repository.strategy !== 'main-first' || branch === config.repository.defaultBranch;
  checks.push({
    name: 'branch', status: branchOkay ? 'pass' : 'warn',
    detail: branch ? `Current branch: ${branch}` : 'Detached HEAD',
  });

  const hooks = await hookStatus(cwd);
  const hookReady = hooks.configured && hooks.managed;
  checks.push({
    name: 'hooks', status: hookReady ? 'pass' : 'warn',
    detail: hookReady
      ? 'Managed repository-local hook enabled'
      : hooks.present && !hooks.managed
        ? 'Non-Shiploop hook present; left untouched'
        : 'Hooks not enabled (optional)',
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

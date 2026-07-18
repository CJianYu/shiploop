import { hookStatus, installHooks } from '../hooks.js';
import { ui } from '../ui.js';

export async function hooksInstallCommand(cwd: string, options: { force?: boolean }): Promise<void> {
  await installHooks(cwd, options);
  ui.ok('Installed the repository-local Shiploop pre-commit hook.');
}

export async function hooksStatusCommand(cwd: string, options: { json?: boolean }): Promise<void> {
  const status = await hookStatus(cwd);
  if (options.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  ui.heading('Shiploop hooks');
  if (status.configured && status.managed) ui.ok('Managed pre-commit hook is installed and enabled.');
  else {
    if (!status.configured) ui.warn(`core.hooksPath is ${status.hooksPath || 'not configured'}.`);
    if (status.present && !status.managed) ui.warn('A non-Shiploop .githooks/pre-commit file exists.');
    if (!status.present) ui.info('No .githooks/pre-commit file exists.');
  }
}

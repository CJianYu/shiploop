import { lstat } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { loadConfig } from '../config.js';
import { stagedFiles } from '../lib/git.js';
import { runArgs } from '../lib/process.js';
import { withGitLock } from '../lib/lock.js';
import { hasFreshReceipt } from '../proof-state.js';
import { ui } from '../ui.js';

const conventional = /^(feat|fix|refactor|perf|test|docs|build|ci|chore|revert)(\([a-z0-9._/-]+\))?!?: .+/;

async function validatePath(root: string, file: string): Promise<string> {
  if (!file || file === '.' || file === ':/' || /[*?[\]{}]/.test(file)) {
    throw new Error(`Unsafe path "${file}". List individual files explicitly.`);
  }
  const clean = normalizeGitPath(file);
  try {
    const stat = await lstat(join(root, clean));
    if (stat.isDirectory()) throw new Error(`Directories are not accepted: ${file}`);
  } catch (error) {
    const tracked = await runArgs('git', ['ls-files', '--error-unmatch', '--', clean], root);
    if (tracked.code !== 0) throw error;
  }
  return clean;
}

export function normalizeGitPath(file: string): string {
  const portable = file.replaceAll('\\', '/');
  if (posix.isAbsolute(portable) || /^[A-Za-z]:/.test(portable)) {
    throw new Error(`Path escapes the repository: ${file}`);
  }
  const clean = posix.normalize(portable).replace(/^\.\//, '');
  if (clean === '..' || clean.startsWith('../')) throw new Error(`Path escapes the repository: ${file}`);
  return clean;
}

export async function commitCommand(
  cwd: string,
  files: string[],
  options: { message: string; noProof?: boolean; dryRun?: boolean },
): Promise<void> {
  const config = await loadConfig(cwd);
  if (!files.length) throw new Error('No files supplied. Use: shiploop commit -m "..." -- file1 file2');
  const paths = await Promise.all(files.map((file) => validatePath(cwd, file)));
  if (config.commit.conventional && !conventional.test(options.message)) {
    throw new Error('Commit message must use Conventional Commits, e.g. feat(cli): add proof command.');
  }
  if (options.message.length > config.commit.maxSubjectLength) {
    throw new Error(`Commit subject exceeds ${config.commit.maxSubjectLength} characters.`);
  }
  if (options.dryRun) {
    ui.info(`Would commit ${paths.length} file(s) as: ${options.message}`);
    for (const path of paths) console.log(`  ${path}`);
    return;
  }
  await withGitLock(cwd, 'commit', async () => {
    if (config.proof.requireFreshForCommit && !options.noProof && !(await hasFreshReceipt(cwd))) {
      throw new Error('Proof is missing or stale. Run shiploop proof, or explicitly use --no-proof.');
    }
    const preStaged = await stagedFiles(cwd);
    const outside = preStaged.filter((file) => !paths.includes(file));
    if (outside.length) {
      throw new Error(`Refusing to mix unrelated staged files:\n${outside.map((file) => `  ${file}`).join('\n')}`);
    }
    const add = await runArgs('git', ['add', '-A', '--', ...paths], cwd);
    if (add.code !== 0) throw new Error(add.stderr || 'git add failed.');
    const staged = await stagedFiles(cwd);
    if (!staged.length) throw new Error('No changes were staged.');
    const unexpected = staged.filter((file) => !paths.includes(file));
    if (unexpected.length) throw new Error(`Unexpected staged files: ${unexpected.join(', ')}`);
    if (config.proof.requireFreshForCommit && !options.noProof && !(await hasFreshReceipt(cwd))) {
      throw new Error('The diff changed while preparing the commit. Re-run shiploop proof.');
    }
    const result = await runArgs('git', ['commit', '-m', options.message, '--', ...paths], cwd, { inherit: true });
    if (result.code !== 0) {
      process.exitCode = result.code;
      return;
    }
    ui.ok(`Committed ${staged.length} explicit file(s).`);
  });
}

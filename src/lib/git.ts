import { createHash } from 'node:crypto';
import { lstat, readFile, readlink } from 'node:fs/promises';
import { join } from 'node:path';
import { runArgs } from './process.js';

const BUILTIN_UNTRACKED_EXCLUDES = [
  'node_modules/**',
  '.venv/**',
  'venv/**',
  'target/**',
  '.build/**',
  '**/__pycache__/**',
];

export async function isGitRepository(cwd: string): Promise<boolean> {
  return (await runArgs('git', ['rev-parse', '--is-inside-work-tree'], cwd)).stdout.trim() === 'true';
}

export async function gitRoot(cwd: string): Promise<string> {
  const result = await runArgs('git', ['rev-parse', '--show-toplevel'], cwd);
  if (result.code !== 0) throw new Error('Not inside a Git repository.');
  return result.stdout.trim();
}

export async function gitDir(cwd: string): Promise<string> {
  const root = await gitRoot(cwd);
  const result = await runArgs('git', ['rev-parse', '--git-dir'], cwd);
  if (result.code !== 0) throw new Error('Cannot locate the Git directory.');
  const value = result.stdout.trim();
  return value.startsWith('/') ? value : join(root, value);
}

export async function gitCommonDir(cwd: string): Promise<string> {
  const root = await gitRoot(cwd);
  const result = await runArgs('git', ['rev-parse', '--git-common-dir'], cwd);
  if (result.code !== 0) throw new Error('Cannot locate the common Git directory.');
  const value = result.stdout.trim();
  return value.startsWith('/') ? value : join(root, value);
}

export async function currentBranch(cwd: string): Promise<string> {
  const result = await runArgs('git', ['branch', '--show-current'], cwd);
  return result.stdout.trim();
}

export async function headSha(cwd: string): Promise<string> {
  const result = await runArgs('git', ['rev-parse', 'HEAD'], cwd);
  if (result.code !== 0) throw new Error('Cannot resolve the current Git commit.');
  return result.stdout.trim();
}

export async function resolveCommit(cwd: string, ref: string): Promise<string> {
  const result = await runArgs('git', ['rev-parse', '--verify', `${ref}^{commit}`], cwd);
  if (result.code !== 0) throw new Error(`Cannot resolve Git base ref: ${ref}`);
  return result.stdout.trim();
}

export async function mergeBase(cwd: string, base: string, head: string): Promise<string> {
  const result = await runArgs('git', ['merge-base', base, head], cwd);
  if (result.code !== 0 || !result.stdout.trim()) {
    throw new Error(`Cannot find a merge base between ${base} and ${head}.`);
  }
  return result.stdout.trim();
}

export async function diffFiles(cwd: string, base: string, head: string): Promise<string[]> {
  const result = await runArgs('git', ['diff', '--name-status', '-z', '--find-renames', base, head], cwd);
  if (result.code !== 0) throw new Error(`Cannot compare Git commits ${base} and ${head}.`);
  const fields = result.stdout.split('\0').filter(Boolean);
  const files: string[] = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++] ?? '';
    const first = fields[index++];
    if (first) files.push(first);
    if (/^[RC]/.test(status)) {
      const second = fields[index++];
      if (second) files.push(second);
    }
  }
  return [...new Set(files)].sort();
}

export async function defaultBranch(cwd: string): Promise<string> {
  const remote = await runArgs('git', ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], cwd);
  if (remote.code === 0) return remote.stdout.trim().replace(/^origin\//, '');
  for (const candidate of ['main', 'master']) {
    const found = await runArgs('git', ['show-ref', '--verify', '--quiet', `refs/heads/${candidate}`], cwd);
    if (found.code === 0) return candidate;
  }
  return await currentBranch(cwd) || 'main';
}

function lines(value: string): string[] {
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

export async function changedFiles(cwd: string): Promise<string[]> {
  let tracked = await runArgs('git', ['diff', '--name-only', 'HEAD'], cwd);
  if (tracked.code !== 0) tracked = await runArgs('git', ['diff', '--name-only'], cwd);
  const untracked = await runArgs('git', [
    'ls-files',
    '--others',
    '--exclude-standard',
    ...BUILTIN_UNTRACKED_EXCLUDES.map((pattern) => `--exclude=${pattern}`),
  ], cwd);
  return [...new Set([...lines(tracked.stdout), ...lines(untracked.stdout)])].sort();
}

export async function stagedFiles(cwd: string): Promise<string[]> {
  return lines((await runArgs('git', ['diff', '--cached', '--name-only'], cwd)).stdout).sort();
}

export async function repositoryFingerprint(cwd: string): Promise<string> {
  const root = await gitRoot(cwd);
  const files = await changedFiles(root);
  const hash = createHash('sha256');

  for (const file of files) {
    hash.update(file);
    try {
      const fileStat = await lstat(join(root, file));
      hash.update(`mode:${fileStat.mode & 0o111};`);
      if (fileStat.isSymbolicLink()) {
        hash.update(`symlink:${await readlink(join(root, file))}`);
      } else if (fileStat.isFile()) {
        hash.update(await readFile(join(root, file)));
      } else {
        const metadata = await runArgs('git', ['diff', 'HEAD', '--raw', '--', file], root);
        hash.update(`special:${metadata.stdout}`);
      }
    } catch {
      hash.update('<deleted>');
    }
  }
  return hash.digest('hex');
}

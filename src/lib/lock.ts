import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gitCommonDir } from './git.js';

interface LockOwner {
  pid: number;
  startedAt: string;
}

export async function withGitLock<T>(
  root: string,
  name: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Invalid lock name: ${name}`);
  const dir = join(await gitCommonDir(root), 'shiploop', 'locks');
  const path = join(dir, `${name}.lock`);
  await mkdir(dir, { recursive: true });
  const owner: LockOwner = { pid: process.pid, startedAt: new Date().toISOString() };

  try {
    await writeFile(path, `${JSON.stringify(owner)}\n`, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const existing = await readOwner(path);
    if (existing && processIsAlive(existing.pid)) {
      throw new Error(`Another Shiploop process holds the ${name} lock (pid ${existing.pid}).`);
    }
    await unlink(path);
    await writeFile(path, `${JSON.stringify(owner)}\n`, { flag: 'wx' });
  }

  try {
    return await operation();
  } finally {
    await unlink(path).catch(() => undefined);
  }
}

async function readOwner(path: string): Promise<LockOwner | undefined> {
  try {
    const value = JSON.parse(await readFile(path, 'utf8')) as Partial<LockOwner>;
    return typeof value.pid === 'number' && typeof value.startedAt === 'string'
      ? value as LockOwner
      : undefined;
  } catch {
    return undefined;
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

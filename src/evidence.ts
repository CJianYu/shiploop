import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { changedFiles, gitCommonDir, headSha, resolveCommit } from './lib/git.js';
import { withGitLock } from './lib/lock.js';
import { run } from './lib/process.js';
import type { EvidenceKind, EvidenceRecord } from './types.js';

interface EvidenceStore {
  version: 1;
  records: EvidenceRecord[];
}

async function storePath(root: string): Promise<string> {
  return join(await gitCommonDir(root), 'shiploop', 'evidence.json');
}

async function readStore(root: string): Promise<EvidenceStore> {
  try {
    const value = JSON.parse(await readFile(await storePath(root), 'utf8')) as EvidenceStore;
    if (value.version !== 1 || !Array.isArray(value.records)) throw new Error('invalid evidence store');
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, records: [] };
    throw new Error(`Cannot read Shiploop evidence: ${(error as Error).message}`);
  }
}

async function writeStore(root: string, store: EvidenceStore): Promise<void> {
  const path = await storePath(root);
  await mkdir(join(path, '..'), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`);
  await rename(temporaryPath, path);
}

async function requireCleanHead(root: string, expectedHead?: string): Promise<string> {
  const head = await headSha(root);
  if (expectedHead && head !== expectedHead) {
    throw new Error('The Git head changed while evidence was running; nothing was recorded.');
  }
  if ((await changedFiles(root)).length) {
    throw new Error('Evidence requires a clean worktree and index so it matches the recorded Git head.');
  }
  return head;
}

async function appendEvidence(root: string, record: EvidenceRecord): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await withGitLock(root, 'evidence', async () => {
        await requireCleanHead(root, record.headSha);
        const store = await readStore(root);
        store.records.push(record);
        await writeStore(root, store);
      });
      return;
    } catch (error) {
      const busy = error instanceof Error && error.message.includes('holds the evidence lock');
      if (!busy || attempt >= 100) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}

function validateInput(kind: EvidenceKind, summary: string, url?: string): void {
  if (!summary.trim()) throw new Error('Evidence summary must not be empty.');
  if (url && !/^https?:\/\//.test(url)) throw new Error('Evidence URL must start with http:// or https://.');
  if (!['proof', 'real', 'review', 'security'].includes(kind)) throw new Error(`Unsupported evidence kind: ${kind}`);
}

export async function addEvidence(
  root: string,
  input: { kind: EvidenceKind; summary: string; command?: string; url?: string; base?: string },
): Promise<EvidenceRecord> {
  validateInput(input.kind, input.summary, input.url);
  const currentHead = await requireCleanHead(root);
  const baseSha = input.base ? await resolveCommit(root, input.base) : undefined;
  const record: EvidenceRecord = {
    version: 1,
    id: randomUUID(),
    kind: input.kind,
    summary: input.summary.trim(),
    source: 'attestation',
    headSha: currentHead,
    ...(baseSha ? { baseSha } : {}),
    createdAt: new Date().toISOString(),
    ...(input.command ? { command: input.command } : {}),
    ...(input.url ? { url: input.url } : {}),
  };
  await appendEvidence(root, record);
  return record;
}

export async function runEvidence(
  root: string,
  input: { kind: EvidenceKind; summary: string; command: string; url?: string; base?: string },
): Promise<EvidenceRecord> {
  validateInput(input.kind, input.summary, input.url);
  if (!input.command.trim()) throw new Error('Evidence command must not be empty.');
  const expectedHead = await requireCleanHead(root);
  const baseSha = input.base ? await resolveCommit(root, input.base) : undefined;
  const result = await run(input.command, root, { inherit: true });
  if (result.code !== 0) throw new Error(`Evidence command failed with exit code ${result.code}; nothing was recorded.`);
  await requireCleanHead(root, expectedHead);
  if (input.base && await resolveCommit(root, input.base) !== baseSha) {
    throw new Error('The Git base ref changed while evidence was running; nothing was recorded.');
  }
  const record: EvidenceRecord = {
    version: 1,
    id: randomUUID(),
    kind: input.kind,
    summary: input.summary.trim(),
    source: 'command',
    headSha: expectedHead,
    ...(baseSha ? { baseSha } : {}),
    createdAt: new Date().toISOString(),
    command: input.command,
    durationMs: result.durationMs,
    ...(input.url ? { url: input.url } : {}),
  };
  await appendEvidence(root, record);
  return record;
}

export async function listEvidence(root: string, options: { all?: boolean; head?: string } = {}): Promise<EvidenceRecord[]> {
  const records = (await readStore(root)).records;
  if (options.all) return records;
  const selectedHead = options.head ?? await headSha(root);
  return records.filter((record) => record.headSha === selectedHead);
}

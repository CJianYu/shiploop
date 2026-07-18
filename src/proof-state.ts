import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gitDir, repositoryFingerprint } from './lib/git.js';
import type { ProofReceipt } from './types.js';

async function receiptPath(root: string): Promise<string> {
  return join(await gitDir(root), 'shiploop', 'proof.json');
}

export async function saveReceipt(root: string, receipt: ProofReceipt): Promise<void> {
  const path = await receiptPath(root);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`);
}

export async function readReceipt(root: string): Promise<ProofReceipt | undefined> {
  try {
    return JSON.parse(await readFile(await receiptPath(root), 'utf8')) as ProofReceipt;
  } catch {
    return undefined;
  }
}

export async function hasFreshReceipt(root: string): Promise<boolean> {
  const receipt = await readReceipt(root);
  return Boolean(receipt && receipt.fingerprint === await repositoryFingerprint(root));
}

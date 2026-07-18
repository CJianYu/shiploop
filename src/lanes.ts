import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { gitCommonDir } from './lib/git.js';
import { withGitLock } from './lib/lock.js';
import { slugify } from './lib/slug.js';

export interface Lane {
  version: 1;
  id: string;
  title: string;
  owner: string;
  status: 'active' | 'completed';
  owns: string[];
  startedAt: string;
  completedAt?: string;
}

async function lanesDir(root: string): Promise<string> {
  return join(await gitCommonDir(root), 'shiploop', 'lanes');
}

export async function listLanes(root: string): Promise<Lane[]> {
  const dir = await lanesDir(root);
  let names: string[];
  try { names = await readdir(dir); } catch { return []; }
  const lanes: Lane[] = [];
  for (const name of names.filter((file) => file.endsWith('.yml')).sort()) {
    const value = parse(await readFile(join(dir, name), 'utf8')) as unknown;
    assertLane(value, name);
    lanes.push(value);
  }
  return lanes;
}

export async function createLane(
  root: string,
  input: { title: string; owner: string; owns: string[]; allowOverlap?: boolean },
): Promise<Lane> {
  return await withGitLock(root, 'lanes', async () => {
    const id = slugify(input.title);
    const owns = [...new Set(input.owns.map(normalizeOwnership))].sort();
    if (!owns.length) throw new Error('At least one ownership pattern is required.');
    const lanes = await listLanes(root);
    if (lanes.some((lane) => lane.id === id && lane.status === 'active')) {
      throw new Error(`Lane is already active: ${id}`);
    }
    const conflicts = lanes
      .filter((lane) => lane.status === 'active')
      .flatMap((lane) => overlappingPatterns(owns, lane.owns).map((pattern) => ({ lane, pattern })));
    if (conflicts.length && !input.allowOverlap) {
      const detail = conflicts.map(({ lane, pattern }) => `  ${lane.id} (${lane.owner}): ${pattern}`).join('\n');
      throw new Error(`Ownership overlaps an active lane:\n${detail}\nUse --allow-overlap only after coordinating.`);
    }
    const lane: Lane = {
      version: 1,
      id,
      title: input.title,
      owner: input.owner,
      status: 'active',
      owns,
      startedAt: new Date().toISOString(),
    };
    const dir = await lanesDir(root);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${id}.yml`), stringify(lane), { flag: 'w' });
    return lane;
  });
}

function normalizeOwnership(pattern: string): string {
  const value = pattern.trim().replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/');
  if (!value || value === '.' || value === ':/' || value.startsWith('/')
    || value === '..' || value.startsWith('../') || value.includes('/../')) {
    throw new Error(`Invalid ownership pattern: ${pattern}`);
  }
  return value;
}

export async function finishLane(root: string, name: string): Promise<Lane> {
  return await withGitLock(root, 'lanes', async () => {
    const id = slugify(name);
    const lane = (await listLanes(root)).find((item) => item.id === id);
    if (!lane) throw new Error(`Lane not found: ${id}`);
    if (lane.status === 'completed') return lane;
    const completed: Lane = { ...lane, status: 'completed', completedAt: new Date().toISOString() };
    await writeFile(join(await lanesDir(root), `${id}.yml`), stringify(completed));
    return completed;
  });
}

export function overlappingPatterns(left: string[], right: string[]): string[] {
  const overlaps: string[] = [];
  for (const a of left) {
    for (const b of right) {
      if (patternsMayOverlap(a, b)) overlaps.push(`${a} ↔ ${b}`);
    }
  }
  return overlaps;
}

function patternsMayOverlap(a: string, b: string): boolean {
  if (a === b) return true;
  const aPrefix = staticPrefix(a);
  const bPrefix = staticPrefix(b);
  if (!aPrefix || !bPrefix) return true;
  return aPrefix === bPrefix || aPrefix.startsWith(`${bPrefix}/`) || bPrefix.startsWith(`${aPrefix}/`);
}

function staticPrefix(pattern: string): string {
  const wildcard = pattern.search(/[*?[\]{}]/);
  const prefix = (wildcard === -1 ? pattern : pattern.slice(0, wildcard)).replace(/\/$/, '');
  return prefix;
}

function assertLane(value: unknown, source: string): asserts value is Lane {
  if (!value || typeof value !== 'object') throw new Error(`Invalid lane state: ${source}`);
  const lane = value as Partial<Lane>;
  if (lane.version !== 1 || typeof lane.id !== 'string' || typeof lane.title !== 'string'
    || typeof lane.owner !== 'string' || !['active', 'completed'].includes(lane.status ?? '')
    || !Array.isArray(lane.owns) || lane.owns.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid lane state: ${source}`);
  }
}

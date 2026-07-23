import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { changedFiles, headSha, resolveCommit } from './lib/git.js';
import type { ReleaseManifest } from './types.js';

interface PackageIdentity {
  name: string;
  version: string;
}

async function packageIdentity(path: string): Promise<PackageIdentity> {
  const value = JSON.parse(await readFile(path, 'utf8')) as Partial<PackageIdentity>;
  if (!value.name || !value.version) throw new Error('Package manifest requires non-empty name and version.');
  return { name: value.name, version: value.version };
}

async function artifactIdentity(path: string): Promise<{ sha256: string; bytes: number }> {
  const contents = await readFile(path);
  return {
    sha256: createHash('sha256').update(contents).digest('hex'),
    bytes: (await stat(path)).size,
  };
}

async function requireReleaseSnapshot(
  root: string,
  tag: string,
  version: string,
  allowedUntracked: string[],
): Promise<string> {
  if (tag !== `v${version}`) throw new Error(`Release tag ${tag} does not match package version ${version}.`);
  const head = await headSha(root);
  const tagSha = await resolveCommit(root, tag);
  if (tagSha !== head) throw new Error(`Release tag ${tag} does not point to the current Git head.`);
  const allowed = new Set(allowedUntracked.map((path) => relative(root, resolve(path)).replaceAll('\\', '/')));
  const dirty = (await changedFiles(root)).filter((file) => !allowed.has(file));
  if (dirty.length) throw new Error(`Release manifest requires a clean source snapshot; changed: ${dirty.join(', ')}`);
  return head;
}

export async function createReleaseManifest(
  root: string,
  input: { tag: string; artifact: string; packageJson?: string },
): Promise<ReleaseManifest> {
  const artifactPath = resolve(root, input.artifact);
  const packageJsonPath = resolve(root, input.packageJson ?? 'package.json');
  const pkg = await packageIdentity(packageJsonPath);
  const head = await requireReleaseSnapshot(root, input.tag, pkg.version, [artifactPath]);
  const artifact = await artifactIdentity(artifactPath);
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    git: { headSha: head, tag: input.tag },
    package: pkg,
    artifact: { file: basename(artifactPath), ...artifact },
  };
}

function assertReleaseManifest(value: unknown): asserts value is ReleaseManifest {
  if (!value || typeof value !== 'object') throw new Error('Release manifest must be a JSON object.');
  const manifest = value as Partial<ReleaseManifest>;
  if (manifest.version !== 1 || !manifest.git || !manifest.package || !manifest.artifact) {
    throw new Error('Unsupported or incomplete release manifest.');
  }
  if (!/^[a-f0-9]{40}$/.test(manifest.git.headSha)
    || !manifest.git.tag
    || !manifest.package.name
    || !manifest.package.version
    || !manifest.artifact.file
    || !/^[a-f0-9]{64}$/.test(manifest.artifact.sha256)
    || !Number.isInteger(manifest.artifact.bytes)
    || manifest.artifact.bytes < 0) {
    throw new Error('Release manifest contains invalid identity fields.');
  }
}

export async function verifyReleaseManifest(
  root: string,
  input: { manifest: string; artifact?: string; packageJson?: string },
): Promise<ReleaseManifest> {
  const manifestPath = resolve(root, input.manifest);
  const value: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
  assertReleaseManifest(value);
  const artifactPath = resolve(root, input.artifact ?? join(dirname(manifestPath), value.artifact.file));
  const packageJsonPath = resolve(root, input.packageJson ?? 'package.json');
  const pkg = await packageIdentity(packageJsonPath);
  const head = await requireReleaseSnapshot(root, value.git.tag, pkg.version, [manifestPath, artifactPath]);
  if (head !== value.git.headSha) throw new Error('Release manifest head does not match the current Git head.');
  if (pkg.name !== value.package.name || pkg.version !== value.package.version) {
    throw new Error('Release manifest package identity does not match package.json.');
  }
  const artifact = await artifactIdentity(artifactPath);
  if (artifact.sha256 !== value.artifact.sha256 || artifact.bytes !== value.artifact.bytes) {
    throw new Error('Release artifact does not match the manifest digest and size.');
  }
  return value;
}

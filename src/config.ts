import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import type { EvidenceKind, Profile, ShiploopConfig } from './types.js';

export const CONFIG_PATH = '.shiploop/config.yml';

const profileStrategy: Record<Profile, ShiploopConfig['repository']['strategy']> = {
  'solo-fast': 'main-first',
  'team-pr': 'short-branch',
  regulated: 'pull-request',
};

export function baseConfig(profile: Profile): ShiploopConfig {
  return {
    version: 1,
    profile,
    repository: {
      defaultBranch: 'main',
      strategy: profileStrategy[profile],
    },
    proof: {
      requireFreshForCommit: profile !== 'solo-fast',
      steps: [],
    },
    risk: {
      high: [
        '.shiploop/config.yml',
        '**/migrations/**',
        '**/auth/**',
        '**/billing/**',
        '**/permissions/**',
        '.github/workflows/**',
        '**/package-lock.json',
        '**/pnpm-lock.yaml',
        '**/yarn.lock',
        '**/Cargo.lock',
        '**/poetry.lock',
        '**/uv.lock',
        '**/go.sum',
        '**/Package.resolved',
      ],
      medium: ['**/api/**', '**/config/**', '**/scripts/**', '**/*.sql'],
    },
    commit: {
      conventional: true,
      maxSubjectLength: 72,
    },
    ci: {
      docs: ['**/*.md', 'docs/**', '.github/ISSUE_TEMPLATE/**'],
      lanes: [
        { name: 'test', when: ['**'] },
        { name: 'package', when: ['package.json', 'package-lock.json', 'src/**', 'schemas/**'] },
      ],
    },
    github: {
      requiredEvidence: profile === 'regulated' ? ['review', 'real'] : profile === 'team-pr' ? ['review'] : [],
      maxMergeRisk: 'low',
      requireApproval: profile === 'regulated',
      mergeMethod: 'squash',
    },
  };
}

export function githubPolicy(config: ShiploopConfig): NonNullable<ShiploopConfig['github']> {
  return config.github ?? {
    requiredEvidence: [],
    maxMergeRisk: 'low',
    requireApproval: false,
    mergeMethod: 'squash',
  };
}

export async function loadConfig(root: string): Promise<ShiploopConfig> {
  const path = join(root, CONFIG_PATH);
  try {
    return parseConfigText(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read ${CONFIG_PATH}: ${(error as Error).message}`);
  }
}

export function parseConfigText(contents: string): ShiploopConfig {
  const value: unknown = parse(contents);
  assertConfig(value);
  return value;
}

export function serializeConfig(config: ShiploopConfig): string {
  return stringify(config, { lineWidth: 100 });
}

function assertConfig(value: unknown): asserts value is ShiploopConfig {
  if (!value || typeof value !== 'object') throw new Error('Configuration must be a YAML object.');
  const config = value as Partial<ShiploopConfig>;
  if (config.version !== 1) throw new Error('Unsupported configuration version. Expected version: 1.');
  if (!['solo-fast', 'team-pr', 'regulated'].includes(config.profile ?? '')) {
    throw new Error('profile must be solo-fast, team-pr, or regulated.');
  }
  if (!config.repository || !config.proof || !config.risk || !config.commit) {
    throw new Error('Configuration is missing a required section.');
  }
  if (typeof config.repository.defaultBranch !== 'string' || !config.repository.defaultBranch) {
    throw new Error('repository.defaultBranch must be a non-empty string.');
  }
  if (!['main-first', 'short-branch', 'pull-request'].includes(config.repository.strategy)) {
    throw new Error('repository.strategy is invalid.');
  }
  if (typeof config.proof.requireFreshForCommit !== 'boolean' || !Array.isArray(config.proof.steps)) {
    throw new Error('proof requires requireFreshForCommit and a steps array.');
  }
  for (const [index, step] of config.proof.steps.entries()) {
    if (!step || typeof step.name !== 'string' || !step.name || typeof step.command !== 'string' || !step.command) {
      throw new Error(`proof.steps[${index}] requires non-empty name and command strings.`);
    }
    if (typeof step.required !== 'boolean') throw new Error(`proof.steps[${index}].required must be boolean.`);
    if (step.quick !== undefined && typeof step.quick !== 'boolean') {
      throw new Error(`proof.steps[${index}].quick must be boolean.`);
    }
    if (step.when !== undefined && (!Array.isArray(step.when) || step.when.some((item) => typeof item !== 'string'))) {
      throw new Error(`proof.steps[${index}].when must be an array of strings.`);
    }
  }
  if (!isStringArray(config.risk.high) || !isStringArray(config.risk.medium)) {
    throw new Error('risk.high and risk.medium must be arrays of strings.');
  }
  if (typeof config.commit.conventional !== 'boolean'
    || !Number.isInteger(config.commit.maxSubjectLength)
    || config.commit.maxSubjectLength < 1) {
    throw new Error('commit requires conventional and a positive maxSubjectLength.');
  }
  if (config.ci !== undefined) {
    if (!isStringArray(config.ci.docs)) throw new Error('ci.docs must be an array of strings.');
    if (!Array.isArray(config.ci.lanes)) throw new Error('ci.lanes must be an array.');
    const names = new Set<string>();
    for (const [index, lane] of config.ci.lanes.entries()) {
      if (!lane || typeof lane.name !== 'string' || !lane.name.trim()) {
        throw new Error(`ci.lanes[${index}].name must be a non-empty string.`);
      }
      if (names.has(lane.name)) throw new Error(`ci.lanes contains duplicate name: ${lane.name}`);
      names.add(lane.name);
      if (!isStringArray(lane.when) || !lane.when.length) {
        throw new Error(`ci.lanes[${index}].when must be a non-empty array of strings.`);
      }
    }
  }
  if (config.github !== undefined) {
    const validEvidence: EvidenceKind[] = ['proof', 'real', 'review', 'security'];
    if (!Array.isArray(config.github.requiredEvidence)
      || config.github.requiredEvidence.some((item) => !validEvidence.includes(item))) {
      throw new Error('github.requiredEvidence contains an unsupported evidence kind.');
    }
    if (!['low', 'medium', 'high'].includes(config.github.maxMergeRisk)) {
      throw new Error('github.maxMergeRisk must be low, medium, or high.');
    }
    if (typeof config.github.requireApproval !== 'boolean') {
      throw new Error('github.requireApproval must be boolean.');
    }
    if (!['squash', 'merge', 'rebase'].includes(config.github.mergeMethod)) {
      throw new Error('github.mergeMethod must be squash, merge, or rebase.');
    }
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

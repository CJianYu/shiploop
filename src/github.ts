import { githubPolicy } from './config.js';
import { listEvidence } from './evidence.js';
import { runArgs } from './lib/process.js';
import { classifyFiles, type RiskLevel } from './risk.js';
import type { EvidenceKind, EvidenceRecord, PolicyRiskLevel, ShiploopConfig } from './types.js';

export type CheckState = 'passing' | 'pending' | 'failing';

export interface PullRequestCheck {
  name: string;
  state: CheckState;
  url?: string;
  completedAt?: string;
}

export interface PullRequestSnapshot {
  number: number;
  url: string;
  title: string;
  state: string;
  isDraft: boolean;
  author: string;
  headRefName: string;
  headSha: string;
  baseRefName: string;
  mergeStateStatus: string;
  reviewDecision: string;
  files: string[];
  checks: PullRequestCheck[];
}

export interface PullRequestAssessment {
  risk: RiskLevel;
  classifiedFiles: ReturnType<typeof classifyFiles>;
  evidence: EvidenceRecord[];
  missingEvidence: EvidenceKind[];
  checks: {
    passing: PullRequestCheck[];
    pending: PullRequestCheck[];
    failing: PullRequestCheck[];
  };
  blockers: string[];
  readyToArm: boolean;
}

type UnknownRecord = Record<string, unknown>;

function object(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? value as UnknownRecord : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function checkState(raw: UnknownRecord): CheckState {
  const status = text(raw.status).toUpperCase();
  const conclusion = text(raw.conclusion || raw.state).toUpperCase();
  if (status && status !== 'COMPLETED') return 'pending';
  if (['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(conclusion)) return 'passing';
  if (['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STALE'].includes(conclusion)) return 'failing';
  if (['PENDING', 'EXPECTED', 'QUEUED', 'IN_PROGRESS'].includes(conclusion)) return 'pending';
  return 'pending';
}

export function normalizeChecks(value: unknown): PullRequestCheck[] {
  if (!Array.isArray(value)) return [];
  const checks = value.map((item): PullRequestCheck => {
    const raw = object(item);
    const name = text(raw.name || raw.context) || 'unnamed check';
    const url = text(raw.detailsUrl || raw.targetUrl);
    const completedAt = text(raw.completedAt);
    return {
      name,
      state: checkState(raw),
      ...(url ? { url } : {}),
      ...(completedAt ? { completedAt } : {}),
    };
  });
  const latest = new Map<string, PullRequestCheck>();
  for (const check of checks) {
    const current = latest.get(check.name);
    if (!current || (check.completedAt ?? '') >= (current.completedAt ?? '')) latest.set(check.name, check);
  }
  return [...latest.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function parsePullRequest(value: unknown): PullRequestSnapshot {
  const raw = object(value);
  const files = Array.isArray(raw.files)
    ? raw.files.map((item) => text(object(item).path)).filter(Boolean)
    : [];
  const author = text(object(raw.author).login);
  if (!Number.isInteger(raw.number) || !text(raw.url) || !text(raw.headRefOid)) {
    throw new Error('GitHub returned an incomplete pull request payload.');
  }
  return {
    number: raw.number as number,
    url: text(raw.url),
    title: text(raw.title),
    state: text(raw.state),
    isDraft: raw.isDraft === true,
    author,
    headRefName: text(raw.headRefName),
    headSha: text(raw.headRefOid),
    baseRefName: text(raw.baseRefName),
    mergeStateStatus: text(raw.mergeStateStatus),
    reviewDecision: text(raw.reviewDecision),
    files,
    checks: normalizeChecks(raw.statusCheckRollup),
  };
}

export async function fetchPullRequest(root: string, selector?: string): Promise<PullRequestSnapshot> {
  const fields = [
    'number', 'url', 'title', 'state', 'isDraft', 'author', 'headRefName', 'headRefOid',
    'baseRefName', 'mergeStateStatus', 'reviewDecision', 'files', 'statusCheckRollup',
  ].join(',');
  const args = ['pr', 'view', ...(selector ? [selector] : []), '--json', fields];
  const result = await runArgs('gh', args, root);
  if (result.code !== 0) throw new Error(result.stderr.trim() || 'Cannot read the GitHub pull request.');
  try {
    return parsePullRequest(JSON.parse(result.stdout));
  } catch (error) {
    throw new Error(`Cannot parse the GitHub pull request: ${(error as Error).message}`);
  }
}

function highestRisk(files: ReturnType<typeof classifyFiles>): RiskLevel {
  if (files.some((item) => item.risk === 'high')) return 'high';
  if (files.some((item) => item.risk === 'medium')) return 'medium';
  return 'low';
}

function riskRank(value: PolicyRiskLevel): number {
  return value === 'low' ? 0 : value === 'medium' ? 1 : 2;
}

export async function assessPullRequest(
  root: string,
  snapshot: PullRequestSnapshot,
  config: ShiploopConfig,
  options: { allowRisk?: PolicyRiskLevel } = {},
): Promise<PullRequestAssessment> {
  const policy = githubPolicy(config);
  const classifiedFiles = classifyFiles(snapshot.files, config);
  const risk = highestRisk(classifiedFiles);
  const evidence = await listEvidence(root, { head: snapshot.headSha });
  const kinds = new Set(evidence.map((record) => record.kind));
  const missingEvidence = policy.requiredEvidence.filter((kind) => !kinds.has(kind));
  const checks = {
    passing: snapshot.checks.filter((check) => check.state === 'passing'),
    pending: snapshot.checks.filter((check) => check.state === 'pending'),
    failing: snapshot.checks.filter((check) => check.state === 'failing'),
  };
  const blockers: string[] = [];
  if (snapshot.state !== 'OPEN') blockers.push(`PR is ${snapshot.state.toLowerCase()}, not open.`);
  if (snapshot.isDraft) blockers.push('PR is still a draft.');
  if (snapshot.mergeStateStatus === 'DIRTY') blockers.push('PR has merge conflicts.');
  if (snapshot.reviewDecision === 'CHANGES_REQUESTED') blockers.push('A reviewer requested changes.');
  if (policy.requireApproval && snapshot.reviewDecision !== 'APPROVED') blockers.push('Policy requires an approving review.');
  if (checks.failing.length) blockers.push(`${checks.failing.length} check(s) are failing.`);
  if (missingEvidence.length) blockers.push(`Missing required evidence: ${missingEvidence.join(', ')}.`);
  const allowedRisk = options.allowRisk ?? policy.maxAutomergeRisk;
  if (riskRank(risk) > riskRank(allowedRisk)) blockers.push(`Risk is ${risk}; policy allows ${allowedRisk}.`);
  return {
    risk,
    classifiedFiles,
    evidence,
    missingEvidence,
    checks,
    blockers,
    readyToArm: blockers.length === 0,
  };
}

import { githubPolicy, parseConfigText } from './config.js';
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
  startedAt?: string;
  workflow?: string;
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
  baseSha: string;
  mergeStateStatus: string;
  reviewDecision: string;
  files: string[];
  listedFileCount: number;
  changedFileCount: number;
  requiresStrictStatusChecks: boolean;
  protectionEnforcedForAdmins: boolean;
  requiresMergeQueue: boolean;
  hasRulesetRequirements: boolean;
  branchRulesKnown: boolean;
  checksKnown: boolean;
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
  readyToMerge: boolean;
}

type UnknownRecord = Record<string, unknown>;

function object(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? value as UnknownRecord : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function checkState(raw: UnknownRecord): CheckState {
  const bucket = text(raw.bucket).toUpperCase();
  if (['PASS', 'SKIPPING'].includes(bucket)) return 'passing';
  if (['FAIL', 'CANCEL'].includes(bucket)) return 'failing';
  if (bucket === 'PENDING') return 'pending';
  const status = text(raw.status).toUpperCase();
  const conclusion = text(raw.conclusion || raw.state).toUpperCase();
  if (status && status !== 'COMPLETED') return 'pending';
  if (['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(conclusion)) return 'passing';
  if (['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STALE', 'STARTUP_FAILURE'].includes(conclusion)) return 'failing';
  if (['PENDING', 'EXPECTED', 'QUEUED', 'IN_PROGRESS'].includes(conclusion)) return 'pending';
  return 'pending';
}

export function normalizeChecks(value: unknown): PullRequestCheck[] {
  if (!Array.isArray(value)) return [];
  const checks = value.map((item, index): { identity: string; check: PullRequestCheck } => {
    const raw = object(item);
    const name = text(raw.name || raw.context) || 'unnamed check';
    const workflow = text(raw.workflowName || raw.workflow);
    const url = text(raw.detailsUrl || raw.targetUrl || raw.link);
    const completedAt = text(raw.completedAt);
    const startedAt = text(raw.startedAt || raw.createdAt);
    const check: PullRequestCheck = {
      name,
      state: checkState(raw),
      ...(url ? { url } : {}),
      ...(completedAt ? { completedAt } : {}),
      ...(startedAt ? { startedAt } : {}),
      ...(workflow ? { workflow } : {}),
    };
    const actionsJob = url.match(/\/actions\/runs\/(\d+)\/job\/(\d+)(?:\/|$)/);
    const identity = raw.context
      ? `context:${text(raw.context)}`
      : actionsJob ? `actions:${actionsJob[1]}:job:${actionsJob[2]}` : `unknown:${index}:${name}`;
    return { identity, check };
  });
  const latest = new Map<string, PullRequestCheck>();
  for (const item of checks) {
    const { check, identity } = item;
    const current = latest.get(identity);
    const checkTime = check.startedAt || check.completedAt || '';
    const currentTime = current?.startedAt || current?.completedAt || '';
    if (!current || checkTime > currentTime || (checkTime === currentTime && check.state === 'pending')) {
      latest.set(identity, check);
    }
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
    baseSha: text(raw.baseRefOid),
    mergeStateStatus: text(raw.mergeStateStatus),
    reviewDecision: text(raw.reviewDecision),
    files,
    listedFileCount: files.length,
    changedFileCount: typeof raw.changedFiles === 'number' ? raw.changedFiles : files.length,
    requiresStrictStatusChecks: raw.requiresStrictStatusChecks === true,
    protectionEnforcedForAdmins: raw.protectionEnforcedForAdmins === true,
    requiresMergeQueue: raw.requiresMergeQueue === true,
    hasRulesetRequirements: raw.hasRulesetRequirements === true,
    branchRulesKnown: raw.branchRulesKnown === true,
    checksKnown: raw.checksKnown === true,
    checks: normalizeChecks(raw.statusCheckRollup),
  };
}

export async function fetchPullRequest(root: string, selector?: string): Promise<PullRequestSnapshot> {
  const fields = [
    'number', 'url', 'title', 'state', 'isDraft', 'author', 'headRefName', 'headRefOid',
    'baseRefName', 'baseRefOid', 'mergeStateStatus', 'reviewDecision', 'changedFiles', 'files', 'statusCheckRollup',
  ].join(',');
  const args = ['pr', 'view', ...(selector ? [selector] : []), '--json', fields];
  const result = await runArgs('gh', args, root);
  if (result.code !== 0) throw new Error(result.stderr.trim() || 'Cannot read the GitHub pull request.');
  try {
    const snapshot = parsePullRequest(JSON.parse(result.stdout));
    const repository = repositoryFromPullRequestUrl(snapshot.url);
    if (!repository) throw new Error('Only GitHub pull request URLs are currently supported.');
    const filesResult = await runArgs('gh', [
      'api', `repos/${repository}/pulls/${snapshot.number}/files`, '--paginate', '--slurp',
    ], root);
    if (filesResult.code !== 0) throw new Error(filesResult.stderr.trim() || 'Cannot read all changed pull request files.');
    const parsedFiles = parsePullRequestFiles(JSON.parse(filesResult.stdout));
    snapshot.files = parsedFiles.paths;
    snapshot.listedFileCount = parsedFiles.fileCount;
    const checksResult = await runArgs('gh', [
      'pr', 'checks', snapshot.url,
      '--json', 'name,state,bucket,link,startedAt,completedAt,workflow',
    ], root);
    try {
      const checks = JSON.parse(checksResult.stdout) as unknown;
      if (Array.isArray(checks)) {
        snapshot.checks = normalizeChecks(checks);
        snapshot.checksKnown = true;
      }
    } catch {
      snapshot.checksKnown = false;
    }
    const protectionResult = await runArgs('gh', [
      'api', `repos/${repository}/branches/${encodeURIComponent(snapshot.baseRefName)}/protection`,
    ], root);
    if (protectionResult.code === 0) {
      const protection = object(JSON.parse(protectionResult.stdout));
      snapshot.requiresStrictStatusChecks = object(protection.required_status_checks).strict === true;
      snapshot.protectionEnforcedForAdmins = object(protection.enforce_admins).enabled === true;
    }
    const rulesResult = await runArgs('gh', [
      'api', `repos/${repository}/rules/branches/${encodeURIComponent(snapshot.baseRefName)}`,
      '--paginate', '--slurp',
    ], root);
    if (rulesResult.code === 0) {
      const rules = parseBranchRules(JSON.parse(rulesResult.stdout));
      snapshot.branchRulesKnown = true;
      snapshot.requiresMergeQueue = rules.mergeQueue;
      snapshot.hasRulesetRequirements = rules.hasRequirements;
    }
    return snapshot;
  } catch (error) {
    throw new Error(`Cannot parse the GitHub pull request: ${(error as Error).message}`);
  }
}

export function parseBranchRules(value: unknown): { mergeQueue: boolean; hasRequirements: boolean } {
  const pages = Array.isArray(value) ? value : [];
  const rules = pages.flatMap((page) => Array.isArray(page) ? page : [page]).map(object);
  return {
    mergeQueue: rules.some((rule) => rule.type === 'merge_queue'),
    hasRequirements: rules.length > 0,
  };
}

export function repositoryFromPullRequestUrl(url: string): string | undefined {
  return url.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/\d+/)?.[1];
}

export function parsePullRequestFiles(value: unknown): { paths: string[]; fileCount: number } {
  const pages = Array.isArray(value) ? value : [];
  const files = pages.flatMap((page) => Array.isArray(page) ? page : [page]).map(object);
  const paths = files.flatMap((file) => [text(file.filename), text(file.previous_filename)]).filter(Boolean);
  return { paths: [...new Set(paths)], fileCount: files.length };
}

export async function fetchBaseConfig(root: string, snapshot: PullRequestSnapshot): Promise<ShiploopConfig> {
  const repository = repositoryFromPullRequestUrl(snapshot.url);
  if (!repository || !snapshot.baseSha) throw new Error('Cannot resolve the pull request base policy.');
  const result = await runArgs('gh', [
    'api', `repos/${repository}/contents/.shiploop/config.yml`, '--method', 'GET', '-f', `ref=${snapshot.baseSha}`,
  ], root);
  if (result.code !== 0) throw new Error(result.stderr.trim() || 'Cannot read Shiploop policy from the pull request base.');
  const payload = object(JSON.parse(result.stdout));
  if (payload.encoding !== 'base64' || typeof payload.content !== 'string') {
    throw new Error('GitHub returned an unsupported Shiploop policy payload.');
  }
  return parseConfigText(Buffer.from(payload.content.replace(/\s/g, ''), 'base64').toString('utf8'));
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
  const risk = snapshot.files.includes('.shiploop/config.yml') ? 'high' : highestRisk(classifiedFiles);
  const evidence = await listEvidence(root, { head: snapshot.headSha });
  const baseBoundEvidence = evidence.filter((record) => record.baseSha === snapshot.baseSha);
  const kinds = new Set(baseBoundEvidence.map((record) => record.kind));
  const missingEvidence = policy.requiredEvidence.filter((kind) => !kinds.has(kind));
  const checks = {
    passing: snapshot.checks.filter((check) => check.state === 'passing'),
    pending: snapshot.checks.filter((check) => check.state === 'pending'),
    failing: snapshot.checks.filter((check) => check.state === 'failing'),
  };
  const blockers: string[] = [];
  if (snapshot.state !== 'OPEN') blockers.push(`PR is ${snapshot.state.toLowerCase()}, not open.`);
  if (snapshot.isDraft) blockers.push('PR is still a draft.');
  if (!snapshot.requiresStrictStatusChecks) {
    blockers.push('Base branch does not require strict up-to-date status checks.');
  }
  if (!snapshot.protectionEnforcedForAdmins) {
    blockers.push('Base branch protection is not enforced for administrators.');
  }
  if (!snapshot.branchRulesKnown) blockers.push('GitHub branch rules could not be verified.');
  if (snapshot.hasRulesetRequirements) {
    blockers.push('Active ruleset requirements cannot be proven safe from actor bypass.');
  }
  if (!snapshot.checksKnown) blockers.push('The complete GitHub check rollup could not be verified.');
  if (snapshot.requiresMergeQueue) blockers.push('Base branch requires a merge queue, which exact-diff merge does not support.');
  if (snapshot.mergeStateStatus === 'DIRTY') blockers.push('PR has merge conflicts.');
  else if (snapshot.mergeStateStatus !== 'CLEAN') {
    blockers.push(`GitHub merge state is ${snapshot.mergeStateStatus || 'unknown'}, not clean.`);
  }
  if (snapshot.reviewDecision === 'CHANGES_REQUESTED') blockers.push('A reviewer requested changes.');
  if (policy.requireApproval && snapshot.reviewDecision !== 'APPROVED') blockers.push('Policy requires an approving review.');
  if (checks.failing.length) blockers.push(`${checks.failing.length} check(s) are failing.`);
  if (checks.pending.length) blockers.push(`${checks.pending.length} check(s) are still pending.`);
  if (snapshot.listedFileCount < snapshot.changedFileCount) {
    blockers.push(`GitHub returned ${snapshot.listedFileCount} of ${snapshot.changedFileCount} changed files; risk cannot be assessed safely.`);
  }
  if (missingEvidence.length) blockers.push(`Missing required evidence: ${missingEvidence.join(', ')}.`);
  const allowedRisk = options.allowRisk ?? policy.maxMergeRisk;
  if (riskRank(risk) > riskRank(allowedRisk)) blockers.push(`Risk is ${risk}; policy allows ${allowedRisk}.`);
  return {
    risk,
    classifiedFiles,
    evidence: baseBoundEvidence,
    missingEvidence,
    checks,
    blockers,
    readyToMerge: blockers.length === 0,
  };
}

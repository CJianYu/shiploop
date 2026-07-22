export type Profile = 'solo-fast' | 'team-pr' | 'regulated';
export type EvidenceKind = 'proof' | 'real' | 'review' | 'security';
export type MergeMethod = 'squash' | 'merge' | 'rebase';
export type PolicyRiskLevel = 'low' | 'medium' | 'high';

export interface ProofStep {
  name: string;
  command: string;
  required: boolean;
  quick?: boolean;
  when?: string[];
}

export interface ShiploopConfig {
  version: 1;
  profile: Profile;
  repository: {
    defaultBranch: string;
    strategy: 'main-first' | 'short-branch' | 'pull-request';
  };
  proof: {
    requireFreshForCommit: boolean;
    steps: ProofStep[];
  };
  risk: {
    high: string[];
    medium: string[];
  };
  commit: {
    conventional: boolean;
    maxSubjectLength: number;
  };
  github?: {
    requiredEvidence: EvidenceKind[];
    maxMergeRisk: PolicyRiskLevel;
    requireApproval: boolean;
    mergeMethod: MergeMethod;
  };
}

export interface DetectedStack {
  name: string;
  evidence: string;
  tools: string[];
  proofSteps: ProofStep[];
}

export interface CommandResult {
  command: string;
  code: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface ProofReceipt {
  version: 1;
  fingerprint: string;
  createdAt: string;
  files: string[];
  steps: Array<{
    name: string;
    command: string;
    code: number;
    durationMs: number;
  }>;
}

export interface EvidenceRecord {
  version: 1;
  id: string;
  kind: EvidenceKind;
  summary: string;
  source: 'attestation' | 'command';
  headSha: string;
  baseSha?: string;
  createdAt: string;
  command?: string;
  url?: string;
  durationMs?: number;
}

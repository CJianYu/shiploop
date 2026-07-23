import { loadConfig } from './config.js';
import { diffFiles, mergeBase, resolveCommit } from './lib/git.js';
import { matchesAny } from './lib/pattern.js';
import { classifyFiles, type RiskLevel } from './risk.js';

export interface CiPlan {
  version: 1;
  baseSha: string;
  headSha: string;
  mergeBaseSha: string;
  files: string[];
  risk: RiskLevel;
  docsOnly: boolean;
  lanes: string[];
}

function highestRisk(files: ReturnType<typeof classifyFiles>): RiskLevel {
  if (files.some((item) => item.risk === 'high')) return 'high';
  if (files.some((item) => item.risk === 'medium')) return 'medium';
  return 'low';
}

export async function createCiPlan(root: string, base: string, head = 'HEAD'): Promise<CiPlan> {
  const config = await loadConfig(root);
  const baseSha = await resolveCommit(root, base);
  const headSha = await resolveCommit(root, head);
  const mergeBaseSha = await mergeBase(root, baseSha, headSha);
  const files = await diffFiles(root, mergeBaseSha, headSha);
  const docs = config.ci?.docs ?? ['**/*.md', 'docs/**'];
  const docsOnly = files.length > 0 && files.every((file) => matchesAny(file, docs));
  const laneConfig = config.ci?.lanes
    ?? config.proof.steps.map((step) => ({ name: step.name, when: step.when?.length ? step.when : ['**'] }));
  const lanes = docsOnly
    ? []
    : laneConfig.filter((lane) => files.some((file) => matchesAny(file, lane.when))).map((lane) => lane.name);

  return {
    version: 1,
    baseSha,
    headSha,
    mergeBaseSha,
    files,
    risk: highestRisk(classifyFiles(files, config)),
    docsOnly,
    lanes,
  };
}

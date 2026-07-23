import { addEvidence, listEvidence, runEvidence, type EvidenceMetadata } from '../evidence.js';
import type { EvidenceKind } from '../types.js';
import { ui } from '../ui.js';

export async function evidenceAddCommand(
  cwd: string,
  options: { kind: EvidenceKind; summary: string; command?: string; url?: string; base?: string } & EvidenceMetadata,
): Promise<void> {
  const record = await addEvidence(cwd, options);
  ui.ok(`Recorded ${record.kind} evidence for ${record.headSha.slice(0, 12)}.`);
  ui.warn('Attested evidence is a human claim. Use evidence run when a command can verify it.');
}

export async function evidenceRunCommand(
  cwd: string,
  options: { kind: EvidenceKind; summary: string; command: string; url?: string; base?: string } & EvidenceMetadata,
): Promise<void> {
  const record = await runEvidence(cwd, options);
  ui.ok(`Verified and recorded ${record.kind} evidence in ${((record.durationMs ?? 0) / 1000).toFixed(1)}s.`);
}

export async function evidenceListCommand(
  cwd: string,
  options: { all?: boolean; json?: boolean },
): Promise<void> {
  const records = await listEvidence(cwd, options);
  if (options.json) {
    console.log(JSON.stringify({ records }, null, 2));
    return;
  }
  ui.heading(options.all ? 'All evidence' : 'Evidence for current head');
  if (!records.length) {
    ui.warn('No evidence recorded.');
    return;
  }
  for (const record of records) {
    console.log(`- [${record.kind}] ${record.summary} (${record.source}, ${record.headSha.slice(0, 12)})`);
    if (record.command) console.log(`  command: ${record.command}`);
    if (record.baseSha) console.log(`  base: ${record.baseSha}`);
    if (record.url) console.log(`  url: ${record.url}`);
    if (record.github) {
      console.log(`  github run: ${record.github.runId}${record.github.runAttempt ? ` (attempt ${record.github.runAttempt})` : ''}`);
      if (record.github.checkName) console.log(`  check: ${record.github.checkName}`);
      if (record.github.artifactSha256) console.log(`  artifact sha256: ${record.github.artifactSha256}`);
    }
  }
}

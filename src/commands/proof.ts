import { loadConfig } from '../config.js';
import { changedFiles, repositoryFingerprint, stagedFiles } from '../lib/git.js';
import { matchesAny } from '../lib/pattern.js';
import { run } from '../lib/process.js';
import { saveReceipt } from '../proof-state.js';
import type { ProofStep } from '../types.js';
import { ui } from '../ui.js';

function selectSteps(steps: ProofStep[], files: string[], all: boolean): ProofStep[] {
  return steps.filter((step) => all || !step.when?.length || files.some((file) => matchesAny(file, step.when ?? [])));
}

export async function proofCommand(
  cwd: string,
  options: { all?: boolean; staged?: boolean; quick?: boolean; json?: boolean },
): Promise<void> {
  const config = await loadConfig(cwd);
  const files = options.staged ? await stagedFiles(cwd) : await changedFiles(cwd);
  let steps = selectSteps(config.proof.steps, files, Boolean(options.all));
  if (options.quick) steps = steps.filter((step) => step.quick);

  if (!files.length && !options.all) {
    ui.warn('No changed files. Use --all to run every proof step.');
    return;
  }
  if (!steps.length) {
    ui.warn(options.quick
      ? 'No quick proof steps match this change.'
      : 'No proof steps match this change. Configure proof.steps or use --all.');
    return;
  }

  if (!options.json) {
    ui.heading('Local proof');
    ui.info(`${files.length} changed file(s), ${steps.length} selected step(s)`);
  }
  const results = [];
  let requiredFailure = false;
  for (const step of steps) {
    if (!options.json) ui.info(`${step.name}: ${step.command}`);
    const result = await run(step.command, cwd, { inherit: !options.json });
    results.push({ name: step.name, command: step.command, code: result.code, durationMs: result.durationMs });
    if (result.code === 0) {
      if (!options.json) ui.ok(`${step.name} passed in ${(result.durationMs / 1000).toFixed(1)}s`);
    } else if (step.required) {
      requiredFailure = true;
      if (!options.json) ui.fail(`${step.name} failed with exit code ${result.code}`);
    } else if (!options.json) {
      ui.warn(`${step.name} failed but is advisory`);
    }
  }

  if (options.json) console.log(JSON.stringify({ files, results, passed: !requiredFailure }, null, 2));
  if (requiredFailure) {
    process.exitCode = 1;
    return;
  }

  if (options.quick) {
    if (!options.json) ui.ok('Quick proof passed. Run full proof before a protected commit.');
    return;
  }
  await saveReceipt(cwd, {
    version: 1,
    fingerprint: await repositoryFingerprint(cwd),
    createdAt: new Date().toISOString(),
    files,
    steps: results,
  });
  if (!options.json) ui.ok('Proof passed. Receipt is bound to the current diff.');
}

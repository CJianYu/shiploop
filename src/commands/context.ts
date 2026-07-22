import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { listLanes } from '../lanes.js';
import { changedFiles, currentBranch } from '../lib/git.js';
import { slugify } from '../lib/slug.js';
import { classifyFiles } from '../risk.js';

export async function contextCommand(
  cwd: string,
  options: { task?: string; json?: boolean },
): Promise<void> {
  const config = await loadConfig(cwd);
  const files = classifyFiles(await changedFiles(cwd), config);
  const lanes = (await listLanes(cwd)).filter((lane) => lane.status === 'active');
  const branch = await currentBranch(cwd);
  let task: { id: string; content: string } | undefined;
  if (options.task) {
    const id = slugify(options.task);
    try {
      task = { id, content: await readFile(join(cwd, '.shiploop/tasks', `${id}.md`), 'utf8') };
    } catch {
      throw new Error(`Task brief not found: .shiploop/tasks/${id}.md`);
    }
  }

  const context = {
    profile: config.profile,
    branch: { current: branch, default: config.repository.defaultBranch, strategy: config.repository.strategy },
    operatingContract: [
      'Stay inside the task and lane ownership boundary.',
      'Do not overwrite, revert, stage, or commit unrelated work.',
      'Run shiploop proof, then shiploop review before committing.',
      'Deep-read high-risk changes even when automated proof passes.',
      'Commit only explicit files as one logical change.',
      'Bind review and real-behavior evidence to the final Git head before merge.',
      'Remote merge requires explicit maintainer confirmation and every configured gate.',
    ],
    proof: config.proof.steps.map(({ name, command, required, quick, when }) => ({ name, command, required, quick: Boolean(quick), when: when ?? [] })),
    changedFiles: files,
    activeLanes: lanes.map(({ id, owner, owns }) => ({ id, owner, owns })),
    task,
  };
  if (options.json) {
    console.log(JSON.stringify(context, null, 2));
    return;
  }

  console.log('# Shiploop agent context');
  console.log(`\nProfile: ${context.profile}`);
  console.log(`Branch: ${branch || 'detached'} · strategy: ${context.branch.strategy} · default: ${context.branch.default}`);
  if (task) console.log(`\n${task.content.trim()}`);
  console.log('\n## Operating contract');
  for (const rule of context.operatingContract) console.log(`- ${rule}`);
  console.log('\n## Local proof');
  for (const step of context.proof) {
    console.log(`- ${step.required ? 'required' : 'advisory'}${step.quick ? ', quick' : ''}: \`${step.command}\``);
  }
  console.log('\n## Active lanes');
  if (!context.activeLanes.length) console.log('- None');
  for (const lane of context.activeLanes) console.log(`- ${lane.id} (${lane.owner}): ${lane.owns.join(', ')}`);
  console.log('\n## Current change surface');
  if (!context.changedFiles.length) console.log('- Clean');
  for (const item of context.changedFiles) console.log(`- [${item.risk}] ${item.file}`);
}

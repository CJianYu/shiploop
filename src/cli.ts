#!/usr/bin/env node
import { Command, Option } from 'commander';
import { closeoutCommand } from './commands/closeout.js';
import { commitCommand } from './commands/commit.js';
import { doctorCommand } from './commands/doctor.js';
import { initCommand } from './commands/init.js';
import { proofCommand } from './commands/proof.js';
import { reviewCommand } from './commands/review.js';
import { taskCommand } from './commands/task.js';
import { gitRoot, isGitRepository } from './lib/git.js';
import type { Profile } from './types.js';
import { ui } from './ui.js';

const program = new Command();

async function root(): Promise<string> {
  const cwd = process.cwd();
  return await isGitRepository(cwd) ? await gitRoot(cwd) : cwd;
}

program
  .name('shiploop')
  .description('Prove, review, and ship small changes with any coding agent.')
  .version('0.1.0')
  .showSuggestionAfterError();

program.command('init')
  .description('Detect the repository and create a gradual Shiploop setup')
  .addOption(new Option('-p, --profile <profile>', 'workflow safety profile').choices(['solo-fast', 'team-pr', 'regulated']).default('team-pr'))
  .option('-f, --force', 'replace an existing Shiploop config')
  .option('--hooks', 'install a repository-local pre-commit hook')
  .action(async (options: { profile: Profile; force?: boolean; hooks?: boolean }) => {
    await initCommand(await root(), options);
  });

program.command('doctor')
  .description('Diagnose repository readiness without changing it')
  .option('--json', 'emit machine-readable output')
  .action(async (options: { json?: boolean }) => doctorCommand(await root(), options));

program.command('task')
  .description('Create a bounded task brief for one agent lane')
  .argument('<title>', 'short task title')
  .option('--owner <owner>', 'lane owner or agent name')
  .action(async (title: string, options: { owner?: string }) => taskCommand(await root(), title, options));

program.command('proof')
  .description('Run the smallest relevant local checks and record a diff-bound receipt')
  .option('--all', 'run every configured proof step')
  .option('--staged', 'select checks from staged files only')
  .option('--quick', 'run only hook-safe quick checks; does not issue a commit receipt')
  .option('--json', 'emit machine-readable output')
  .action(async (options: { all?: boolean; staged?: boolean; quick?: boolean; json?: boolean }) => proofCommand(await root(), options));

program.command('review')
  .description('Classify changed files by risk before human review')
  .option('--diff', 'open the full textual diff after the risk summary')
  .option('--json', 'emit machine-readable output')
  .action(async (options: { diff?: boolean; json?: boolean }) => reviewCommand(await root(), options));

program.command('commit')
  .description('Commit an explicit set of files as one logical change')
  .requiredOption('-m, --message <message>', 'Conventional Commit subject')
  .option('--no-proof', 'explicitly bypass the fresh-proof requirement')
  .option('--dry-run', 'validate and print the commit without changing Git')
  .argument('<files...>', 'individual files; directories and globs are rejected')
  .action(async (
    files: string[],
    options: { message: string; proof: boolean; dryRun?: boolean },
  ) => commitCommand(await root(), files, {
    message: options.message,
    noProof: options.proof === false,
    dryRun: Boolean(options.dryRun),
  }));

program.command('closeout')
  .description('Check whether the branch is clean, proved, and synchronized')
  .option('--json', 'emit machine-readable output')
  .action(async (options: { json?: boolean }) => closeoutCommand(await root(), options));

program.parseAsync().catch((error: unknown) => {
  ui.fail(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

#!/usr/bin/env node
import { Command, Option } from 'commander';
import { readFileSync } from 'node:fs';
import { closeoutCommand } from './commands/closeout.js';
import { ciPlanCommand } from './commands/ci.js';
import { commitCommand } from './commands/commit.js';
import { contextCommand } from './commands/context.js';
import { doctorCommand } from './commands/doctor.js';
import { evidenceAddCommand, evidenceListCommand, evidenceRunCommand } from './commands/evidence.js';
import { hooksInstallCommand, hooksStatusCommand } from './commands/hooks.js';
import { initCommand } from './commands/init.js';
import { laneFinishCommand, laneStartCommand, laneStatusCommand } from './commands/lane.js';
import { proofCommand } from './commands/proof.js';
import { prBriefCommand, prChecksCommand, prInspectCommand, prMergeCommand } from './commands/pr.js';
import { reviewCommand } from './commands/review.js';
import { releaseManifestCommand, releaseVerifyCommand } from './commands/release.js';
import { taskCommand } from './commands/task.js';
import { gitRoot, isGitRepository } from './lib/git.js';
import type { EvidenceKind, PolicyRiskLevel, Profile } from './types.js';
import type { EvidenceMetadata } from './evidence.js';
import { ui } from './ui.js';

const program = new Command();
const packageVersion = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

async function root(): Promise<string> {
  const cwd = process.cwd();
  return await isGitRepository(cwd) ? await gitRoot(cwd) : cwd;
}

program
  .name('shiploop')
  .description('Prove, review, and ship small changes with any coding agent.')
  .version(packageVersion)
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

const ci = program.command('ci').description('Plan exact-SHA CI work from repository policy');
ci.command('plan')
  .description('Produce the single routing manifest for a base/head change')
  .requiredOption('--base <ref>', 'base branch, tag, or commit')
  .option('--head <ref>', 'head branch, tag, or commit', 'HEAD')
  .option('--json', 'emit machine-readable output')
  .action(async (options: { base: string; head?: string; json?: boolean }) => ciPlanCommand(await root(), options));

const hooks = program.command('hooks').description('Install or inspect repository-local Git hooks');
hooks.command('install')
  .description('Install the Shiploop pre-commit hook without changing workflow config')
  .option('--force', 'replace an existing hooks path or pre-commit hook after review')
  .action(async (options: { force?: boolean }) => hooksInstallCommand(await root(), options));
hooks.command('status')
  .description('Inspect hook ownership and Git configuration')
  .option('--json', 'emit machine-readable output')
  .action(async (options: { json?: boolean }) => hooksStatusCommand(await root(), options));

program.command('task')
  .description('Create a bounded task brief for one agent lane')
  .argument('<title>', 'short task title')
  .option('--owner <owner>', 'lane owner or agent name')
  .action(async (title: string, options: { owner?: string }) => taskCommand(await root(), title, options));

program.command('context')
  .description('Print a compact, agent-ready repository context packet')
  .option('--task <title>', 'include a task brief by title or id')
  .option('--json', 'emit machine-readable output')
  .action(async (options: { task?: string; json?: boolean }) => contextCommand(await root(), options));

const lane = program.command('lane').description('Coordinate parallel agent ownership without branches');
lane.command('start')
  .description('Start a local lane and reject ownership overlap')
  .argument('<title>', 'lane title')
  .requiredOption('--owner <owner>', 'agent or human responsible for the lane')
  .requiredOption('--owns <patterns>', 'comma-separated path patterns owned by the lane')
  .option('--allow-overlap', 'accept detected overlap after explicit coordination')
  .action(async (title: string, options: { owner: string; owns: string; allowOverlap?: boolean }) => {
    await laneStartCommand(await root(), title, options);
  });
lane.command('status')
  .description('List active local lanes')
  .option('--json', 'emit machine-readable output')
  .action(async (options: { json?: boolean }) => laneStatusCommand(await root(), options));
lane.command('finish')
  .description('Mark a local lane complete')
  .argument('<title>', 'lane title or id')
  .action(async (title: string) => laneFinishCommand(await root(), title));

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

const evidence = program.command('evidence').description('Record head-bound proof, review, and real-behavior evidence');
function addEvidenceMetadataOptions(command: Command): Command {
  return command
    .option('--run-id <id>', 'GitHub Actions run ID')
    .option('--run-attempt <number>', 'GitHub Actions run attempt', (value) => Number.parseInt(value, 10))
    .option('--check <name>', 'GitHub check or job name')
    .option('--artifact-sha256 <digest>', 'SHA-256 of the evidence artifact');
}
addEvidenceMetadataOptions(evidence.command('add')
  .description('Attest external evidence for the current Git head')
  .addOption(new Option('--kind <kind>', 'evidence kind').choices(['proof', 'real', 'review', 'security']).makeOptionMandatory())
  .requiredOption('--summary <summary>', 'short description of what the evidence proves')
  .option('--command <command>', 'command that produced the external evidence')
  .option('--url <url>', 'artifact, run, screenshot, or report URL')
  .option('--base <ref>', 'base ref to bind when the evidence assesses a diff'))
  .action(async (options: { kind: EvidenceKind; summary: string; command?: string; url?: string; base?: string } & EvidenceMetadata) => evidenceAddCommand(await root(), options));
addEvidenceMetadataOptions(evidence.command('run')
  .description('Run a command and record evidence only when it succeeds on a stable head')
  .addOption(new Option('--kind <kind>', 'evidence kind').choices(['proof', 'real', 'review', 'security']).makeOptionMandatory())
  .requiredOption('--summary <summary>', 'short description of what the command proves')
  .requiredOption('--command <command>', 'command to execute')
  .option('--url <url>', 'artifact or report URL associated with the command')
  .option('--base <ref>', 'base ref to bind when the evidence assesses a diff'))
  .action(async (options: { kind: EvidenceKind; summary: string; command: string; url?: string; base?: string } & EvidenceMetadata) => evidenceRunCommand(await root(), options));
evidence.command('list')
  .description('List evidence for the current head')
  .option('--all', 'include evidence from previous heads')
  .option('--json', 'emit machine-readable output')
  .action(async (options: { all?: boolean; json?: boolean }) => evidenceListCommand(await root(), options));

const pr = program.command('pr').description('Inspect and gate GitHub pull requests with local policy');
pr.command('inspect')
  .description('Combine PR metadata, checks, risk, and exact-head evidence')
  .argument('[selector]', 'PR number, URL, or branch; defaults to the current branch PR')
  .option('--json', 'emit machine-readable output')
  .action(async (selector: string | undefined, options: { json?: boolean }) => prInspectCommand(await root(), selector, options));
pr.command('checks')
  .description('Summarize current-head GitHub checks and optionally show failed logs')
  .argument('[selector]', 'PR number, URL, or branch; defaults to the current branch PR')
  .option('--logs', 'stream failed GitHub Actions logs')
  .option('--json', 'emit machine-readable output')
  .action(async (selector: string | undefined, options: { logs?: boolean; json?: boolean }) => prChecksCommand(await root(), selector, options));
pr.command('brief')
  .description('Render a Markdown readiness block for the PR description')
  .argument('[selector]', 'PR number, URL, or branch; defaults to the current branch PR')
  .action(async (selector?: string) => prBriefCommand(await root(), selector));
pr.command('merge')
  .description('Explicitly perform a policy-bounded GitHub merge')
  .argument('[selector]', 'PR number, URL, or branch; defaults to the current branch PR')
  .requiredOption('--confirm <number>', 'exact PR number acknowledging a remote merge mutation')
  .addOption(new Option('--allow-risk <level>', 'explicit risk ceiling override').choices(['low', 'medium', 'high']))
  .action(async (
    selector: string | undefined,
    options: { confirm: string; allowRisk?: PolicyRiskLevel },
  ) => prMergeCommand(await root(), selector, options));

const release = program.command('release').description('Create and verify exact-SHA release evidence');
release.command('manifest')
  .description('Bind a package artifact to its tag, package identity, and Git head')
  .requiredOption('--tag <tag>', 'release tag, which must match v<package version>')
  .requiredOption('--artifact <path>', 'already-built package artifact')
  .option('--package-json <path>', 'package manifest', 'package.json')
  .option('--output <path>', 'write the JSON manifest instead of stdout')
  .action(async (options: { tag: string; artifact: string; packageJson?: string; output?: string }) => releaseManifestCommand(await root(), options));
release.command('verify')
  .description('Fail if a release manifest, tag, head, package, or artifact no longer matches')
  .requiredOption('--manifest <path>', 'release manifest JSON')
  .option('--artifact <path>', 'artifact path; defaults to the file beside the manifest')
  .option('--package-json <path>', 'package manifest', 'package.json')
  .option('--json', 'emit the verified manifest')
  .action(async (options: { manifest: string; artifact?: string; packageJson?: string; json?: boolean }) => releaseVerifyCommand(await root(), options));

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

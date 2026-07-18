import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DetectedStack, ProofStep } from './types.js';

async function exists(root: string, file: string): Promise<boolean> {
  try {
    await access(join(root, file));
    return true;
  } catch {
    return false;
  }
}

async function detectNode(root: string): Promise<DetectedStack | undefined> {
  if (!(await exists(root, 'package.json'))) return undefined;
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const manager = (await exists(root, 'pnpm-lock.yaml'))
    ? 'pnpm'
    : (await exists(root, 'yarn.lock'))
      ? 'yarn'
      : 'npm';
  const invoke = manager === 'npm' ? 'npm run' : manager;
  const steps: ProofStep[] = [];
  for (const [name, candidates] of [
    ['check', ['check']],
    ['format', ['format:check']],
    ['lint', ['lint']],
    ['typecheck', ['typecheck', 'type-check', 'check:types']],
    ['test', ['test']],
    ['build', ['build']],
  ] as const) {
    const script = candidates.find((candidate) => pkg.scripts?.[candidate]);
    if (script) steps.push({
      name,
      command: `${invoke} ${script}`,
      required: true,
      quick: ['check', 'format', 'lint', 'typecheck'].includes(name),
    });
  }
  return { name: 'Node.js', evidence: 'package.json', tools: [manager, 'node'], proofSteps: steps };
}

export async function detectStacks(root: string): Promise<DetectedStack[]> {
  const stacks: DetectedStack[] = [];
  const node = await detectNode(root);
  if (node) stacks.push(node);
  if (await exists(root, 'pyproject.toml')) {
    stacks.push({
      name: 'Python', evidence: 'pyproject.toml', tools: ['python'],
      proofSteps: [
        { name: 'lint', command: 'ruff check .', required: true, quick: true },
        { name: 'test', command: 'pytest', required: true, quick: false },
      ],
    });
  }
  if (await exists(root, 'go.mod')) {
    stacks.push({
      name: 'Go', evidence: 'go.mod', tools: ['go'],
      proofSteps: [{ name: 'test', command: 'go test ./...', required: true, quick: false }],
    });
  }
  if (await exists(root, 'Cargo.toml')) {
    stacks.push({
      name: 'Rust', evidence: 'Cargo.toml', tools: ['cargo'],
      proofSteps: [
        { name: 'format', command: 'cargo fmt --check', required: true, quick: true },
        { name: 'lint', command: 'cargo clippy --all-targets -- -D warnings', required: true, quick: true },
        { name: 'test', command: 'cargo test', required: true, quick: false },
      ],
    });
  }
  if (await exists(root, 'Package.swift')) {
    stacks.push({
      name: 'Swift', evidence: 'Package.swift', tools: ['swift'],
      proofSteps: [{ name: 'test', command: 'swift test', required: true, quick: false }],
    });
  }
  return stacks;
}

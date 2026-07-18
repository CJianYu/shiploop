import { access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { slugify } from '../lib/slug.js';
import { ui } from '../ui.js';

export async function taskCommand(cwd: string, title: string, options: { owner?: string }): Promise<void> {
  const dir = join(cwd, '.shiploop/tasks');
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${slugify(title)}.md`);
  try {
    await access(path);
    throw new Error(`Task already exists: ${path}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const content = `# ${title}

Status: ready
Owner: ${options.owner ?? 'unassigned'}

## Outcome

Describe the observable result. Keep it small enough for one agent context.

## Ownership boundary

- Files/directories this lane may change:
- Files/directories this lane must not change:

## Acceptance proof

- [ ] Focused behavior is verified
- [ ] Regression coverage is added where appropriate
- [ ] \`shiploop proof\` passes
- [ ] High-risk diffs are deeply reviewed

## Context

Relevant constraints, commands, errors, and decisions.
`;
  await writeFile(path, content);
  ui.ok(`Created ${path.slice(cwd.length + 1)}`);
}

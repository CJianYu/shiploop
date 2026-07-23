import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

async function workflow(name: string): Promise<string> {
  return await readFile(join(root, '.github/workflows', name), 'utf8');
}

describe('repository infrastructure', () => {
  it('pins every third-party Action to a full commit SHA', async () => {
    for (const name of ['ci.yml', 'release.yml']) {
      const contents = await workflow(name);
      const uses = [...contents.matchAll(/^\s*-\s+uses:\s+(\S+)/gm)]
        .flatMap((match) => match[1] ? [match[1]] : []);
      expect(uses.length).toBeGreaterThan(0);
      expect(uses.every((value) => /@[a-f0-9]{40}$/.test(value))).toBe(true);
      expect(contents).toContain('persist-credentials: false');
    }
  });

  it('routes CI through preflight and one stable aggregate gate', async () => {
    const contents = await workflow('ci.yml');
    expect(contents).toContain('ci plan --base');
    expect(contents).toContain('ci-gate:');
    expect(contents).toContain("if: needs.preflight.outputs.run_test == 'true'");
  });

  it('separates validated release evidence from privileged publication', async () => {
    const contents = await workflow('release.yml');
    expect(contents).toContain('permissions: {}');
    expect(contents).toContain('environment: npm-release');
    expect(contents).toContain('release manifest');
    expect(contents).toContain('release verify');
    expect(contents.indexOf('validate:')).toBeLessThan(contents.indexOf('publish:'));
  });
});

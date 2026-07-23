import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createReleaseManifest, verifyReleaseManifest } from '../release-manifest.js';
import { ui } from '../ui.js';

export async function releaseManifestCommand(
  cwd: string,
  options: { tag: string; artifact: string; packageJson?: string; output?: string },
): Promise<void> {
  const manifest = await createReleaseManifest(cwd, options);
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  if (options.output) {
    await writeFile(resolve(cwd, options.output), serialized);
    ui.ok(`Wrote release manifest for ${manifest.package.name}@${manifest.package.version}.`);
  } else {
    console.log(serialized.trimEnd());
  }
}

export async function releaseVerifyCommand(
  cwd: string,
  options: { manifest: string; artifact?: string; packageJson?: string; json?: boolean },
): Promise<void> {
  const manifest = await verifyReleaseManifest(cwd, options);
  if (options.json) console.log(JSON.stringify(manifest, null, 2));
  else ui.ok(`Verified ${manifest.package.name}@${manifest.package.version} from ${manifest.git.headSha.slice(0, 12)}.`);
}

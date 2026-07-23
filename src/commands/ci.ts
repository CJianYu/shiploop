import { createCiPlan } from '../ci-plan.js';
import { ui } from '../ui.js';

export async function ciPlanCommand(
  cwd: string,
  options: { base: string; head?: string; json?: boolean },
): Promise<void> {
  const plan = await createCiPlan(cwd, options.base, options.head);
  if (options.json) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  ui.heading('CI plan');
  console.log(`Base: ${plan.baseSha}`);
  console.log(`Head: ${plan.headSha}`);
  console.log(`Merge base: ${plan.mergeBaseSha}`);
  console.log(`Files: ${plan.files.length} · Risk: ${plan.risk} · Docs only: ${plan.docsOnly ? 'yes' : 'no'}`);
  console.log(`Lanes: ${plan.lanes.length ? plan.lanes.join(', ') : 'none'}`);
}

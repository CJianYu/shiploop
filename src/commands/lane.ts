import { createLane, finishLane, listLanes } from '../lanes.js';
import { ui } from '../ui.js';

export async function laneStartCommand(
  cwd: string,
  title: string,
  options: { owner: string; owns: string; allowOverlap?: boolean },
): Promise<void> {
  const owns = options.owns.split(',').map((item) => item.trim()).filter(Boolean);
  if (!owns.length) throw new Error('At least one ownership pattern is required.');
  const lane = await createLane(cwd, {
    title,
    owner: options.owner,
    owns,
    allowOverlap: Boolean(options.allowOverlap),
  });
  ui.ok(`Started lane ${lane.id} for ${lane.owner}.`);
  for (const pattern of lane.owns) console.log(`  ${pattern}`);
}

export async function laneStatusCommand(cwd: string, options: { json?: boolean }): Promise<void> {
  const lanes = await listLanes(cwd);
  const active = lanes.filter((lane) => lane.status === 'active');
  if (options.json) {
    console.log(JSON.stringify({ lanes, activeCount: active.length }, null, 2));
    return;
  }
  ui.heading('Agent lanes');
  if (!active.length) {
    ui.info('No active lanes.');
    return;
  }
  for (const lane of active) {
    ui.ok(`${lane.id} · ${lane.owner}`);
    console.log(`  ${lane.owns.join(', ')}`);
  }
}

export async function laneFinishCommand(cwd: string, name: string): Promise<void> {
  const lane = await finishLane(cwd, name);
  ui.ok(`Finished lane ${lane.id}.`);
}

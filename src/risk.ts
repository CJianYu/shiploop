import type { ShiploopConfig } from './types.js';
import { matchesAny } from './lib/pattern.js';

export type RiskLevel = 'high' | 'medium' | 'low';

export interface ClassifiedFile {
  file: string;
  risk: RiskLevel;
}

export function classifyFiles(files: string[], config: ShiploopConfig): ClassifiedFile[] {
  return files.map((file): ClassifiedFile => {
    const risk: RiskLevel = matchesAny(file, config.risk.high)
      ? 'high'
      : matchesAny(file, config.risk.medium)
        ? 'medium'
        : 'low';
    return { file, risk };
  }).sort((a, b) => riskOrder(a.risk) - riskOrder(b.risk) || a.file.localeCompare(b.file));
}

function riskOrder(risk: RiskLevel): number {
  return risk === 'high' ? 0 : risk === 'medium' ? 1 : 2;
}

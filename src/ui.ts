import pc from 'picocolors';

export const ui = {
  ok(message: string): void { console.log(`${pc.green('✓')} ${message}`); },
  warn(message: string): void { console.log(`${pc.yellow('!')} ${message}`); },
  fail(message: string): void { console.error(`${pc.red('✗')} ${message}`); },
  info(message: string): void { console.log(`${pc.cyan('→')} ${message}`); },
  heading(message: string): void { console.log(`\n${pc.bold(message)}`); },
};

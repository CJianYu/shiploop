import { spawn } from 'node:child_process';
import type { CommandResult } from '../types.js';

export async function run(
  command: string,
  cwd: string,
  options: { inherit?: boolean } = {},
): Promise<CommandResult> {
  const started = Date.now();

  return await new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: process.env,
      stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        command,
        code: code ?? 1,
        stdout,
        stderr,
        durationMs: Date.now() - started,
      });
    });
  });
}

export async function runArgs(
  executable: string,
  args: string[],
  cwd: string,
  options: { inherit?: boolean } = {},
): Promise<CommandResult> {
  const started = Date.now();
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      shell: false,
      env: process.env,
      stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({
      command: [executable, ...args].join(' '),
      code: code ?? 1,
      stdout,
      stderr,
      durationMs: Date.now() - started,
    }));
  });
}

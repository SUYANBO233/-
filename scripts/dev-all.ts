import { spawn, type ChildProcess } from 'node:child_process';
import { config } from 'dotenv';
import path from 'node:path';

config({ path: [path.resolve(process.cwd(), '.env.local'), path.resolve(process.cwd(), '.env')], quiet: true });
const children: ChildProcess[] = [];
let stopping = false;
const stop = (code: number): void => {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.pid && child.exitCode === null) {
      try {
        if (process.platform === 'win32') child.kill('SIGTERM');
        else process.kill(-child.pid, 'SIGTERM');
      } catch { /* Child already stopped. */ }
    }
  }
  process.exitCode = code;
};
for (const args of [['scripts/backend.sh', 'dev'], ['scripts/dev.sh']]) {
  const child = spawn('bash', args, { stdio: 'inherit', detached: process.platform !== 'win32' });
  children.push(child);
  child.on('error', (error: Error) => { console.error(error.message); stop(1); });
  child.on('exit', (code) => stop(code ?? 1));
}
process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));

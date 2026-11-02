import { spawn, type ChildProcess } from 'node:child_process';
import { config } from 'dotenv';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';

config({ path:[path.resolve('.env.local'),path.resolve('.env')],quiet:true });
process.env.DECISION_CATALOG_API_KEY ||= randomBytes(32).toString('hex');
process.env.DECISION_CATALOG_URL ||= `http://127.0.0.1:${process.env.DEPLOY_RUN_PORT || 5000}/api/internal/decision-catalog`;
process.env.DECISION_BACKEND_URL ||= `http://127.0.0.1:${process.env.BACKEND_PORT || 8000}`;
const children:ChildProcess[]=[];
const serviceGroups=new Set<number>();
const shutdown=new AbortController();
let stopping=false;
function stop(code:number):void {
  if (stopping) return;
  stopping=true;
  shutdown.abort();
  const groups=new Set(serviceGroups);
  for (const child of children) {
    if (!child.pid) continue;
    if (child.exitCode === null) groups.add(child.pid);
  }
  for (const pid of groups) {
    try {
      if (process.platform === 'win32') process.kill(pid,'SIGTERM');
      else process.kill(-pid,'SIGTERM');
    } catch { /* Already stopped. */ }
  }
  process.exitCode=code;
  // A watcher can exit before its descendants. Keep ownership of its group
  // and give every service time to release sockets before the supervisor exits.
  const deadline=Date.now()+5000;
  const timer=setInterval(() => {
    for (const pid of groups) {
      try { process.kill(process.platform === 'win32' ? pid : -pid,0); }
      catch { groups.delete(pid); }
    }
    if (groups.size && Date.now()<deadline) return;
    for (const pid of groups) {
      try { process.kill(process.platform === 'win32' ? pid : -pid,'SIGKILL'); }
      catch { /* Already stopped. */ }
    }
    clearInterval(timer);
    process.exit(code);
  },100);
}
async function checkBackendPort():Promise<void> {
  const port=Number(process.env.BACKEND_PORT || '8000');
  if (!Number.isInteger(port) || port<1 || port>65535) throw new Error('BACKEND_PORT 必须为 1—65535 的整数');
  await new Promise<void>((resolve,reject) => {
    const probe=createServer();
    probe.once('error',(error:NodeJS.ErrnoException) => reject(new Error(error.code === 'EADDRINUSE'
      ? `Python 端口 ${port} 已被占用。请停止旧服务后重试，或运行 BACKEND_PORT=8001 pnpm dev:d1（网页仍使用 5000 端口）。`
      : `无法检查 Python 端口 ${port}：${error.message}`)));
    probe.listen(port,process.env.BACKEND_HOST || '127.0.0.1',() => probe.close(() => resolve()));
  });
}
function run(command:string,args:string[]):ChildProcess {
  const child=spawn(command,args,{ stdio:'inherit',detached:process.platform !== 'win32',env:process.env });
  children.push(child);
  child.on('error',(error:Error) => { console.error(error.message);stop(1); });
  return child;
}
async function task(command:string,args:string[]):Promise<void> {
  await new Promise<void>((resolve,reject) => {
    const child=run(command,args);
    child.once('exit',(code) => code === 0 ? resolve():reject(new Error(`准备任务退出：${code}`)));
    child.once('error',reject);
  });
}
async function warmCatalog():Promise<void> {
  console.info('正在预热决策资料接口（首次编译和本地数据库初始化可能需要一些时间）…');
  const deadline=Date.now()+180_000;
  while (!stopping && Date.now()<deadline) {
    try {
      const response=await fetch(process.env.DECISION_CATALOG_URL!,{
        headers:{ 'X-Catalog-Key':process.env.DECISION_CATALOG_API_KEY! },
        signal:AbortSignal.any([shutdown.signal,AbortSignal.timeout(60_000)]),
      });
      if (!response.ok) throw new Error(`资料接口返回 ${response.status}；请检查数据库配置和迁移`);
      await response.json();
      console.info('决策资料已就绪，正在启动 Python 算法服务。');
      return;
    } catch (error:unknown) {
      if (!(error instanceof TypeError) && !(error instanceof Error && ['TimeoutError','AbortError'].includes(error.name))) throw error;
      if (error instanceof Error && error.name === 'TimeoutError') console.info('资料接口仍在准备，继续等待…');
      await new Promise<void>((resolve) => setTimeout(resolve,1000));
    }
  }
  if (!stopping) throw new Error('决策资料接口预热超时，请检查前端启动日志');
}
process.on('SIGINT',() => stop(0));
process.on('SIGTERM',() => stop(0));
async function main():Promise<void> {
  await checkBackendPort();
  if (process.argv.includes('--local-test')) {
    process.env.DECISION_DATA_SOURCE='local-test';
    process.env.DECISION_ALGORITHM_FACTORY='app.algorithms.configurable:create_algorithm';
    await task('pnpm',['d1:fixtures']);
    console.info('D1 临时测试模式：隔离本地数据库，无 Supabase 写入。');
  }
  const browser=process.argv.includes('--browser-test');
  if (browser) await task('pnpm',['exec','next','build']);
  const definitions:[string,string[]][]=browser
    ? [['bash',['scripts/backend.sh','start']],['pnpm',['exec','next','start','--hostname','127.0.0.1','--port',process.env.DEPLOY_RUN_PORT || '5012']]]
    : [['bash',['scripts/backend.sh','dev']],['bash',['scripts/dev.sh']]];
  function startService([command,args]:[string,string[]]):void {
    const child=run(command,args);
    if (child.pid) serviceGroups.add(child.pid);
    child.once('exit',(code,signal) => { if (!stopping) { console.error(`服务退出：${command} ${code ?? signal}`);stop(code ?? 1); } });
  }
  startService(definitions[1]);
  await warmCatalog();
  if (!stopping) startService(definitions[0]);
}
void main().catch((error:unknown) => { console.error(error);stop(1); });

import { NextResponse } from 'next/server';
import { DecisionBackendError, requestDecisionBackend } from '@/server/decision-backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const POST_OPERATIONS = new Set(['infer-methods', 'design-support', 'recheck-safety', 'generate-scheme']);
type Context = { params: Promise<{ path: string[] }> };

async function forward(request: Request, context: Context): Promise<Response> {
  const { path } = await context.params;
  const operation = path.length === 1 ? path[0] : '';
  if ((request.method === 'GET' && operation !== 'meta') || (request.method === 'POST' && !POST_OPERATIONS.has(operation))) {
    return NextResponse.json({ message: '决策接口不存在' }, { status: 404 });
  }
  let body: unknown;
  if (request.method === 'POST') {
    try { body = await request.json(); }
    catch { return NextResponse.json({ message: '请求体必须是有效 JSON' }, { status: 400 }); }
  }
  try {
    const upstream = await requestDecisionBackend(operation, { method: request.method === 'GET' ? 'GET' : 'POST', body, signal: request.signal });
    const data: unknown = await upstream.json().catch(() => null);
    if (data === null) return NextResponse.json({ message: '算法服务返回了无效响应' }, { status: 502 });
    return NextResponse.json(data, { status: upstream.status });
  } catch (error: unknown) {
    if (error instanceof DecisionBackendError) return NextResponse.json({ message: error.message }, { status: error.status });
    console.error('转发决策请求失败', error);
    return NextResponse.json({ message: '算法服务请求失败' }, { status: 502 });
  }
}

export const GET = forward;
export const POST = forward;

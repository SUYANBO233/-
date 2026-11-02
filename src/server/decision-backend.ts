/** Server-only transport boundary. Changing the upstream URL never changes browser URLs. */
export class DecisionBackendError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

export async function requestDecisionBackend(
  operation: string,
  options: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal } = {},
): Promise<Response> {
  const base = process.env.DECISION_BACKEND_URL || 'http://127.0.0.1:8000';
  const url = new URL(`${base.replace(/\/$/, '')}/api/decision/${operation}`);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new DecisionBackendError('算法服务地址配置错误', 503);
  const configured = Number(process.env.DECISION_BACKEND_TIMEOUT_MS || 30000);
  const timeout = Number.isFinite(configured) && configured >= 100 && configured <= 300000 ? configured : 30000;
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
  try {
    return await fetch(url, {
      method: options.method ?? 'GET',
      headers: { 'Content-Type': 'application/json',
        ...(process.env.DECISION_BACKEND_API_KEY ? { 'X-Decision-Key': process.env.DECISION_BACKEND_API_KEY } : {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: 'no-store', signal,
    });
  } catch (error: unknown) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new DecisionBackendError('算法服务响应超时，请重试', 504);
    }
    throw new DecisionBackendError('无法连接 Python 算法服务，请确认后端已启动', 503);
  }
}

export async function decisionBackendJson(operation: string, body: unknown): Promise<unknown> {
  const response = await requestDecisionBackend(operation, { method: 'POST', body });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
      ? data.message : `算法服务请求失败：${response.status}`;
    throw new DecisionBackendError(message, response.status);
  }
  return data;
}

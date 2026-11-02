import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import path from 'node:path';
import { test } from 'node:test';
import { GET, POST } from '../src/app/api/decision/[...path]/route';
import { DecisionBackendError, requestDecisionBackend } from '../src/server/decision-backend';
import { buildDecisionPayload } from '../src/server/decision-payload';
import { DEFAULT_GEO_PARAMS_IV } from '../src/data/decision';
import { decisionPayloadSchema } from '../src/lib/validation/decision-response';

// Only bind a loopback port; no external services or credentials are involved.
test('同源代理、算法快照及错误处理', async (t) => {
  let mode = 'normal';
  let requests = 0;
  const fixture: unknown = JSON.parse(readFileSync(path.resolve(process.cwd(), 'tests/fixtures/decision-payload.json'), 'utf8'));
  const snapshot = decisionPayloadSchema.parse(fixture);
  const server = createServer((request, response) => {
    requests += 1;
    assert.equal(request.headers['x-decision-key'], 'test-key');
    if (mode === 'timeout') return;
    if (mode === 'invalid') { response.end('not-json'); return; }
    response.setHeader('Content-Type','application/json');
    if (mode === 'bad-input') { response.statusCode = 422; response.end(JSON.stringify({ message: '校验失败' })); return; }
    if (request.url === '/api/decision/build-snapshot') {
      response.end(JSON.stringify(mode === 'wrong-snapshot' ? { ...snapshot, workface: 'other_face' } : snapshot));
      return;
    }
    response.end(JSON.stringify({ operation: request.url }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const original = { url: process.env.DECISION_BACKEND_URL, timeout: process.env.DECISION_BACKEND_TIMEOUT_MS, key: process.env.DECISION_BACKEND_API_KEY };
  process.env.DECISION_BACKEND_URL = `http://127.0.0.1:${address.port}`;
  process.env.DECISION_BACKEND_API_KEY = 'test-key';
  const context = (operation: string) => ({ params: Promise.resolve({ path: [operation] }) });
  try {
    await t.test('GET/POST 转发约定接口，保留后端校验状态', async () => {
      const response = await GET(new Request('http://localhost/api/decision/meta'), context('meta'));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { operation: '/api/decision/meta' });
      mode = 'bad-input';
      const rejected = await POST(new Request('http://localhost/api/decision/infer-methods', { method: 'POST', body: '{}' }), context('infer-methods'));
      assert.equal(rejected.status, 422);
      assert.deepEqual(await rejected.json(), { message: '校验失败' });
      mode = 'normal';
    });
    await t.test('非法 JSON、未知路径和内部快照接口不会转发', async () => {
      const before = requests;
      assert.equal((await POST(new Request('http://localhost', { method: 'POST', body: '{' }), context('infer-methods'))).status, 400);
      assert.equal((await POST(new Request('http://localhost', { method: 'POST', body: '{}' }), context('build-snapshot'))).status, 404);
      assert.equal((await GET(new Request('http://localhost'), { params: Promise.resolve({ path: ['..','meta'] }) })).status, 404);
      assert.equal(requests, before);
    });
    await t.test('保存使用 Python 快照，拒绝与用户输入不一致的结果', async () => {
      const input = { requestKey: snapshot.requestKey, workface: 'shayi_main', mode: 'manual' as const,
        mileage: 'K3601+200', params: DEFAULT_GEO_PARAMS_IV,
        revisions: [{ methodKey: 'bench' as const, reason: '初始方案', values: { steel:80, shot:22, anchor:3, advance:40 } }] };
      assert.deepEqual(await buildDecisionPayload(input), snapshot);
      mode = 'wrong-snapshot';
      await assert.rejects(buildDecisionPayload(input), (error: unknown) => error instanceof DecisionBackendError && error.status === 502);
      mode = 'normal';
    });
    await t.test('无效后端响应与超时清晰返回错误，不切换算法', async () => {
      mode = 'invalid';
      assert.equal((await GET(new Request('http://localhost'), context('meta'))).status, 502);
      mode = 'timeout'; process.env.DECISION_BACKEND_TIMEOUT_MS = '100';
      await assert.rejects(requestDecisionBackend('meta'), (error: unknown) => error instanceof DecisionBackendError && error.status === 504);
    });
  } finally {
    for (const [key, value] of Object.entries({ DECISION_BACKEND_URL: original.url, DECISION_BACKEND_TIMEOUT_MS: original.timeout, DECISION_BACKEND_API_KEY: original.key })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error?: Error) => error ? reject(error) : resolve()));
  }
});

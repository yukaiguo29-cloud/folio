import { afterAll, beforeAll, it, expect, vi } from 'vitest';
import http from 'node:http';
import { askAI } from '../src/core/ai';
import { defaults } from '../src/core/types';
let service: http.Server,
  endpoint: string,
  lastRequest: unknown,
  requests = 0;
beforeAll(async () => {
  vi.stubGlobal('sessionStorage', { getItem: () => null });
  service = http.createServer((req, res) => {
    let text = '';
    req.on('data', (chunk) => (text += chunk));
    req.on('end', () => {
      requests++;
      lastRequest = JSON.parse(text);
      if (req.url?.startsWith('/error')) {
        res.writeHead(401).end();
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: '测试服务回答 [页2]' } }] }));
    });
  });
  await new Promise<void>((resolve) => service.listen(0, '127.0.0.1', resolve));
  const address = service.address();
  if (!address || typeof address === 'string') throw new Error('Test service failed');
  endpoint = `http://127.0.0.1:${address.port}/v1`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => service.close((e) => (e ? reject(e) : resolve())));
  vi.unstubAllGlobals();
});
it('sends only explicitly supplied original text to an OpenAI-compatible service', async () => {
  const before = requests;
  expect(requests).toBe(before);
  const result = await askAI(
    { ...defaults, aiEnabled: true, endpoint, model: 'test-model' },
    '解释选文',
    [{ page: 2, text: 'Only this selected paragraph.' }],
    new AbortController().signal,
  );
  expect(result).toBe('测试服务回答 [页2]');
  expect(lastRequest).toMatchObject({ model: 'test-model', stream: false });
  const body = lastRequest as { messages: { role: string; content: string }[] };
  expect(body.messages[1].content).toContain('Only this selected paragraph.');
  expect(body.messages[1].content).toContain('[页2]');
  expect(requests).toBe(before + 1);
});
it('rejects disabled AI and empty context without making any request', async () => {
  const before = requests;
  await expect(
    askAI(
      { ...defaults, endpoint },
      'question',
      [{ page: 1, text: 'text' }],
      new AbortController().signal,
    ),
  ).rejects.toThrow('启用');
  await expect(
    askAI(
      { ...defaults, aiEnabled: true, endpoint, model: 'test' },
      'question',
      [],
      new AbortController().signal,
    ),
  ).rejects.toThrow('原文');
  expect(requests).toBe(before);
});
it('reports service authentication errors instead of inventing a response', async () => {
  await expect(
    askAI(
      {
        ...defaults,
        aiEnabled: true,
        endpoint: endpoint.replace('/v1', '/error/v1'),
        model: 'test',
      },
      'question',
      [{ page: 1, text: 'text' }],
      new AbortController().signal,
    ),
  ).rejects.toThrow('401');
});

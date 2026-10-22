import { describe, expect, it, vi } from 'vitest';
import { WORKERS_AI_MODEL, providerFromEnv, workersAiProvider } from './provider';

const request = { system: 'sys', user: 'brief', jsonSchema: { type: 'object' } };

describe('workersAiProvider', () => {
  it('calls the Workers AI REST API with JSON mode and returns the answer', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ success: true, result: { response: { ok: 1 } } }),
    );
    const p = workersAiProvider({ accountId: 'acc', apiToken: 'tok', fetchImpl });
    expect(await p.complete(request)).toEqual({ ok: 1 });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/acc/ai/run/${WORKERS_AI_MODEL}`,
    );
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
    const body = JSON.parse(String(init.body));
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'brief' },
    ]);
    expect(body.response_format).toEqual({ type: 'json_schema', json_schema: { type: 'object' } });
  });

  it('reports the API error message', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { success: false, errors: [{ message: 'Daily quota reached' }] },
        { status: 429 },
      ),
    );
    const p = workersAiProvider({ accountId: 'acc', apiToken: 'tok', fetchImpl });
    await expect(p.complete(request)).rejects.toThrow('Daily quota reached');
  });
});

describe('providerFromEnv', () => {
  it('is off unless configured, and needs both secrets for Workers AI', () => {
    expect(providerFromEnv({})).toBeNull();
    expect(providerFromEnv({ AI_SUMMARY_PROVIDER: 'off' })).toBeNull();
    expect(
      providerFromEnv({ AI_SUMMARY_PROVIDER: 'workers-ai', CLOUDFLARE_ACCOUNT_ID: 'a' }),
    ).toBeNull();
    expect(
      providerFromEnv({
        AI_SUMMARY_PROVIDER: 'workers-ai',
        CLOUDFLARE_ACCOUNT_ID: 'a',
        CLOUDFLARE_AI_TOKEN: 't',
      })?.name,
    ).toBe(WORKERS_AI_MODEL);
    expect(providerFromEnv({ AI_SUMMARY_PROVIDER: 'sample' })?.name).toBe('development sample');
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  GROQ_MODEL,
  WORKERS_AI_MODEL,
  groqProvider,
  providerFromEnv,
  sampleProvider,
  withFallback,
  workersAiProvider,
  type SummaryProvider,
} from './provider';

const request = { system: 'sys', user: 'brief', jsonSchema: { type: 'object' } };

describe('workersAiProvider', () => {
  it('calls the Workers AI REST API with JSON mode and returns the answer', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ success: true, result: { response: { ok: 1 } } }),
    );
    const p = workersAiProvider({ accountId: 'acc', apiToken: 'tok', fetchImpl });
    expect(await p.complete(request)).toEqual({ answer: { ok: 1 }, model: WORKERS_AI_MODEL });

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

describe('groqProvider', () => {
  it('calls Groq in JSON mode with the schema in the prompt and returns the text', async () => {
    const fetchImpl = vi.fn(async (_url: unknown, _init?: RequestInit) =>
      Response.json({ choices: [{ message: { content: '{"ok":1}' } }] }),
    );
    const p = groqProvider({ apiKey: 'gsk', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await p.complete(request)).toEqual({ answer: '{"ok":1}', model: GROQ_MODEL });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    const body = JSON.parse(String(init!.body));
    expect(body).toMatchObject({ model: GROQ_MODEL, response_format: { type: 'json_object' } });
    expect(body.messages[1].content).toContain('{"type":"object"}');
  });

  it('reports the API error message', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ error: { message: 'Invalid API Key' } }, { status: 401 }),
    );
    const p = groqProvider({ apiKey: 'bad', fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(p.complete(request)).rejects.toThrow('Invalid API Key');
  });
});

describe('withFallback', () => {
  const failing: SummaryProvider = {
    name: 'primary',
    complete: vi.fn(async () => {
      throw new Error('Daily quota reached');
    }),
  };

  it('uses the fallback when the primary fails, and stores which model answered', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = withFallback(failing, sampleProvider());
    expect((await p.complete(request)).model).toBe('development sample');
  });

  it('leaves the fallback alone while the primary works', async () => {
    const fallback = { name: 'fallback', complete: vi.fn() };
    const p = withFallback(sampleProvider(), fallback);
    expect((await p.complete(request)).model).toBe('development sample');
    expect(fallback.complete).not.toHaveBeenCalled();
  });
});

describe('providerFromEnv with Groq', () => {
  const workersAi = {
    AI_SUMMARY_PROVIDER: 'workers-ai',
    CLOUDFLARE_ACCOUNT_ID: 'a',
    CLOUDFLARE_AI_TOKEN: 't',
  };

  it('falls back to Groq after Workers AI when a Groq key is set', () => {
    expect(providerFromEnv({ ...workersAi, GROQ_API_KEY: 'g' })?.name).toBe(
      `${WORKERS_AI_MODEL}, then ${GROQ_MODEL}`,
    );
  });

  it('can use Groq alone', () => {
    expect(providerFromEnv({ AI_SUMMARY_PROVIDER: 'groq', GROQ_API_KEY: 'g' })?.name).toBe(
      GROQ_MODEL,
    );
    expect(providerFromEnv({ AI_SUMMARY_PROVIDER: 'groq' })).toBeNull();
  });
});

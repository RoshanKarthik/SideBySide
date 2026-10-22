/**
 * Who writes the post-interview reports. One implementation calls Cloudflare Workers AI (free
 * tier, no card) over its REST API, which works the same under `wrangler dev` and in
 * production; tests and local development can use stand-ins.
 */
export interface SummaryProvider {
  /** Short name stored with each report, e.g. the model id. */
  readonly name: string;
  /**
   * Asks for one JSON object matching `jsonSchema` and returns the model's raw answer (an
   * object, or text that should contain one). The caller validates it.
   */
  complete(request: { system: string; user: string; jsonSchema: object }): Promise<unknown>;
}

export const WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const REQUEST_TIMEOUT_MS = 60_000;

interface WorkersAiResponse {
  success: boolean;
  result?: { response?: unknown };
  errors?: { message?: string }[];
}

export function workersAiProvider(options: {
  accountId: string;
  apiToken: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): SummaryProvider {
  const model = options.model || WORKERS_AI_MODEL;
  const doFetch = options.fetchImpl ?? fetch;
  return {
    name: model,
    async complete({ system, user, jsonSchema }) {
      const res = await doFetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(options.accountId)}/ai/run/${model}`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.apiToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            response_format: { type: 'json_schema', json_schema: jsonSchema },
            max_tokens: 1800,
            temperature: 0.2,
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
      const body = (await res.json().catch(() => null)) as WorkersAiResponse | null;
      if (!res.ok || !body?.success) {
        const message = body?.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`;
        throw new Error(`Workers AI request failed: ${message}`);
      }
      return body.result?.response;
    },
  };
}

/**
 * Local development only: returns a fixed, clearly labelled sample report so the pages can be
 * tried without a Cloudflare account. Never enable it in production.
 */
export function sampleProvider(): SummaryProvider {
  return {
    name: 'development sample',
    async complete({ jsonSchema }) {
      const props = (jsonSchema as { properties?: Record<string, unknown> }).properties ?? {};
      if ('summary' in props) {
        return {
          summary:
            'Sample report for local development: no AI provider is configured, so this text is fixed.',
          approach: 'Sample: the candidate described a hash-map approach before coding.',
          correctness: 'Sample: the latest test run is listed on the session page.',
          complexity: 'Sample: linear time and space were discussed.',
          codeQuality: 'Sample: clear names and small functions.',
          hintsUsage: 'Sample: hints are counted on the session page.',
          keyMoments: [{ time: '00:00', text: 'Sample: the session started.' }],
          integrity: 'Sample: see the activity signals on the session page.',
          suggestedScores: [
            { criterion: 'Approach', score: 3, reasoning: 'Sample score for development.' },
          ],
          openQuestions: ['Sample: how would the solution change for streaming input?'],
        };
      }
      return {
        wentWell: ['Sample: you explained your idea before writing code.'],
        toImprove: ['Sample: test edge cases such as empty input.'],
        conceptsToStudy: ['Sample: hash maps'],
        referenceApproach:
          'Sample for local development: no AI provider is configured, so this text is fixed.',
        complexityNotes: 'Sample: O(n) time, O(n) space.',
      };
    },
  };
}

interface SummaryEnv {
  AI_SUMMARY_PROVIDER?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_AI_TOKEN?: string;
  AI_MODEL?: string;
}

/**
 * The configured provider, or null when AI reports are off. `AI_SUMMARY_PROVIDER` is
 * `workers-ai` (needs `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_AI_TOKEN`), `sample` (local
 * development) or unset/`off`.
 */
export function providerFromEnv(env: SummaryEnv): SummaryProvider | null {
  switch (env.AI_SUMMARY_PROVIDER) {
    case 'workers-ai':
      if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_AI_TOKEN) return null;
      return workersAiProvider({
        accountId: env.CLOUDFLARE_ACCOUNT_ID,
        apiToken: env.CLOUDFLARE_AI_TOKEN,
        model: env.AI_MODEL,
      });
    case 'sample':
      return sampleProvider();
    default:
      return null;
  }
}

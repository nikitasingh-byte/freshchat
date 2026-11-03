// Thin read-only client for the Freshchat REST API v2.

export class FreshchatError extends Error {}

function baseUrl(): string {
  let url = (process.env.FRESHCHAT_API_URL || '').trim().replace(/\/+$/, '');
  if (!url) throw new FreshchatError('FRESHCHAT_API_URL is not configured. Add it under Secrets.');
  if (url.includes('myfreshworks.com')) {
    throw new FreshchatError(
      "FRESHCHAT_API_URL points at the Freshworks web app. Use the 'Your chat URL' value " +
      'from Freshchat Admin > Configure > API Tokens (a *.freshchat.com address).',
    );
  }
  if (!url.endsWith('/v2')) url += '/v2';
  return url;
}

export async function fcGet(path: string, params: Record<string, unknown> = {}): Promise<any> {
  const token = process.env.FRESHCHAT_API_TOKEN;
  if (!token) throw new FreshchatError('FRESHCHAT_API_TOKEN is not configured. Add it under Secrets.');

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const url = `${baseUrl()}${path}${qs.size ? `?${qs}` : ''}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new FreshchatError(`Network error calling Freshchat (${(e as Error).name}).`);
  }

  if (res.status === 401) throw new FreshchatError('Freshchat rejected the API token (401). Check FRESHCHAT_API_TOKEN.');
  if (res.status === 403) throw new FreshchatError('The API token lacks permission for this resource (403).');
  if (res.status === 404) throw new FreshchatError(`Not found in Freshchat: ${path}`);
  if (res.status === 429) {
    const reset = res.headers.get('X-RateLimitReset') || res.headers.get('X-RateLimit-Reset');
    throw new FreshchatError(`Freshchat rate limit hit (429). Resets: ${reset || 'unknown'}.`);
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new FreshchatError(`Freshchat error ${res.status}: ${body}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

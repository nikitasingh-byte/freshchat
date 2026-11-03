// PII masking applied to every Freshchat response before it reaches Claude.
// 1. Key-based: fields that identify a person are replaced outright.
// 2. Pattern-based: remaining strings are scanned for emails and phone numbers.

export const REDACTED = '[redacted]';

const USER_PII_KEYS = new Set([
  'email', 'phone', 'mobile', 'first_name', 'last_name', 'name', 'full_name',
  'avatar', 'avatar_url', 'social_profiles', 'address', 'ip', 'ip_address',
  'login_id', 'fc_user_email', 'fc_user_phone',
]);
const AGENT_CONTACT_KEYS = new Set(['email', 'phone', 'mobile', 'avatar', 'avatar_url', 'social_profiles']);
const AGENT_NAME_KEYS = new Set(['first_name', 'last_name', 'name', 'full_name']);

const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?<![\w])\+?\d[\d\s\-().]{8,}\d(?![\w])/g;

export function maskText(text: string): string {
  return text
    .replace(EMAIL_RE, '[email]')
    .replace(PHONE_RE, (m) => {
      const digits = (m.match(/\d/g) || []).length;
      return digits >= 10 && digits <= 15 ? '[phone]' : m; // keep long IDs / timestamps
    });
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '' ||
    (Array.isArray(v) && v.length === 0) ||
    (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 0);
}

export type MaskKind = 'user' | 'agent';

export function mask(data: unknown, kind: MaskKind = 'user', showAgentNames = false): unknown {
  if (Array.isArray(data)) return data.map((v) => mask(v, kind, showAgentNames));
  if (typeof data === 'string') return maskText(data);
  if (data && typeof data === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      const key = k.toLowerCase();
      const redact = kind === 'agent'
        ? AGENT_CONTACT_KEYS.has(key) || (AGENT_NAME_KEYS.has(key) && !showAgentNames)
        : USER_PII_KEYS.has(key);
      out[k] = redact ? (isEmpty(v) ? v : REDACTED) : mask(v, kind, showAgentNames);
    }
    return out;
  }
  return data;
}

// Freshchat user `properties` are [{name, value}] pairs. The generic key rule
// would wipe every `name`, so handle them explicitly.
export function maskProperties(props: unknown): unknown {
  if (!Array.isArray(props)) return mask(props);
  return props.map((p) => {
    if (p && typeof p === 'object' && 'name' in p) {
      const name = String((p as any).name ?? '');
      let value = (p as any).value;
      if (USER_PII_KEYS.has(name.toLowerCase())) value = REDACTED;
      else if (typeof value === 'string') value = maskText(value);
      return { ...(p as object), name, value };
    }
    return mask(p);
  });
}

export function maskUser(data: unknown): unknown {
  if (data && typeof data === 'object' && !Array.isArray(data) && 'properties' in data) {
    const { properties, ...rest } = data as Record<string, unknown>;
    return { ...(mask(rest) as object), properties: maskProperties(properties) };
  }
  return mask(data);
}

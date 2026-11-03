// Same base-path logic as createApiClient() in api/platform-sdk.ts, kept here so the
// frontend bundle doesn't pull in the AWS SDK that platform-sdk.ts imports.
function basePath(): string {
  const { hostname, pathname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return '';
  const parts = pathname.split('/').filter(Boolean);
  return `/_api/app/${parts.length >= 2 ? parts[1] : ''}`;
}

async function request<T>(method: string, path: string): Promise<T> {
  const res = await fetch(`${basePath()}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  get: <T,>(path: string) => request<T>('GET', path),
  post: <T,>(path: string) => request<T>('POST', path),
};

export function connectorUrl(): string {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const app = parts.length >= 2 ? parts[1] : 'freshchat';
  return `${window.location.origin}/_api/app/${app}/api/webhook/mcp/<MCP_CONNECTOR_KEY>`;
}

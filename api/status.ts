// SSO-protected endpoints for the status page. They never return secret values.
import { Hono } from 'hono';
import { fcGet, FreshchatError } from './freshchat';
import { tools } from './tools';

const status = new Hono();

const has = (k: string) => Boolean(process.env[k]);

status.get('/api/status', (c) =>
  c.json({
    user: c.get('userEmail') || null,
    secrets: {
      FRESHCHAT_API_URL: has('FRESHCHAT_API_URL'),
      FRESHCHAT_API_TOKEN: has('FRESHCHAT_API_TOKEN'),
      MCP_CONNECTOR_KEY: has('MCP_CONNECTOR_KEY'),
      MCP_AUTH_TOKEN: has('MCP_AUTH_TOKEN'),
    },
    maskPii: (process.env.MASK_PII ?? 'true').toLowerCase() !== 'false',
    tools: tools.map((t) => t.name),
  }),
);

// Makes one tiny Freshchat call to confirm the URL and token work. Returns no data.
status.post('/api/status/test', async (c) => {
  try {
    await fcGet('/agents', { page: 1, items_per_page: 1 });
    return c.json({ ok: true, message: 'Connected to Freshchat.' });
  } catch (e) {
    const message = e instanceof FreshchatError ? e.message : 'Unexpected error.';
    return c.json({ ok: false, message });
  }
});

export default status;

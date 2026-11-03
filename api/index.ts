import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { platformMiddleware } from './platform-sdk';
import mcp from './mcp';
import status from './status';

const app = new Hono();

// CORS is handled by the platform, but add for local dev
app.use('*', cors());
app.use('*', platformMiddleware);

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok' }));

// MCP endpoint for Claude (under /api/webhook/, verifies its own callers)
app.route('/', mcp);

// SSO-protected status endpoints used by the web page
app.route('/', status);

export default app;

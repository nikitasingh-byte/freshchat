// Minimal MCP server over Streamable HTTP (stateless, JSON responses).
// Implements: initialize, notifications/*, ping, tools/list, tools/call.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { createHash, timingSafeEqual } from 'crypto';
import { tools, toolByName } from './tools';
import { FreshchatError } from './freshchat';

const SERVER_INFO = { name: 'freshchat', version: '1.0.0' };
const SUPPORTED_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const INSTRUCTIONS =
  "Read-only access to GoKwik's Freshchat inbox. Customer names, emails and phone numbers are redacted by the " +
  'server; do not try to recover them. Conversation IDs are the long number at the end of a Freshchat inbox URL ' +
  '(.../conversation/<id>). Use get_conversation, then get_conversation_messages to read a chat; resolve ' +
  'assigned_agent_id / assigned_group_id / channel_id with get_agent, list_groups and list_channels.';

type RpcId = string | number | null;
interface RpcRequest { jsonrpc: '2.0'; id?: RpcId; method: string; params?: any }

const ok = (id: RpcId, result: unknown) => ({ jsonrpc: '2.0', id, result });
const fail = (id: RpcId, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });

// ── Request verification ─────────────────────────────────────────────────────
// /api/webhook/* bypasses platform SSO, so this route must verify callers itself:
//  - claude.ai custom connectors: secret key in the URL path  (MCP_CONNECTOR_KEY)
//  - Claude Code / scripts:       Authorization: Bearer <MCP_AUTH_TOKEN>
function same(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

function verify(c: Context): Response | null {
  const key = process.env.MCP_CONNECTOR_KEY || '';
  const token = process.env.MCP_AUTH_TOKEN || '';
  if (!key && !token) {
    return c.json({ error: 'Connector not configured: add MCP_CONNECTOR_KEY or MCP_AUTH_TOKEN under Secrets.' }, 503);
  }
  const pathKey = c.req.param('key') || '';
  if (key && pathKey && same(pathKey, key)) return null;
  const auth = c.req.header('authorization') || '';
  if (token && auth.startsWith('Bearer ') && same(auth.slice(7), token)) return null;
  return c.json({ error: 'unauthorized' }, 401);
}

// ── JSON-RPC dispatch ────────────────────────────────────────────────────────
async function handle(msg: RpcRequest): Promise<object | null> {
  const id = msg.id ?? null;
  const isNotification = msg.id === undefined;

  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return fail(id, -32600, 'Invalid Request');
  }
  if (isNotification) return null; // notifications/initialized, cancelled, etc.

  switch (msg.method) {
    case 'initialize': {
      const requested = msg.params?.protocolVersion;
      return ok(id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[1],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return ok(id, {});
    case 'tools/list':
      return ok(id, {
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { readOnlyHint: true, openWorldHint: true },
        })),
      });
    case 'tools/call': {
      const tool = toolByName.get(msg.params?.name);
      if (!tool) return fail(id, -32602, `Unknown tool: ${msg.params?.name}`);
      const parsed = tool.schema.safeParse(msg.params?.arguments ?? {});
      if (!parsed.success) {
        const why = parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
        return ok(id, { content: [{ type: 'text', text: `Invalid arguments: ${why}` }], isError: true });
      }
      try {
        const result = await tool.run(parsed.data);
        return ok(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
      } catch (e) {
        const message = e instanceof FreshchatError ? e.message : 'Unexpected server error.';
        if (!(e instanceof FreshchatError)) console.error('tool failed', tool.name, (e as Error).message);
        return ok(id, { content: [{ type: 'text', text: message }], isError: true });
      }
    }
    default:
      return fail(id, -32601, `Method not found: ${msg.method}`);
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────
const mcp = new Hono();

const post = async (c: Context) => {
  const denied = verify(c);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(fail(null, -32700, 'Parse error'), 400);
  }

  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(m as RpcRequest)))).filter(Boolean);
    return out.length ? c.json(out) : c.body(null, 202);
  }
  const res = await handle(body as RpcRequest);
  return res ? c.json(res) : c.body(null, 202);
};

// Stateless server: no SSE stream and no sessions to delete.
const notAllowed = (c: Context) => {
  c.header('Allow', 'POST');
  return c.json({ error: 'Method not allowed. Use POST.' }, 405);
};

for (const path of ['/api/webhook/mcp', '/api/webhook/mcp/:key']) {
  mcp.post(path, post);
  mcp.get(path, notAllowed);
  mcp.delete(path, notAllowed);
}

export default mcp;

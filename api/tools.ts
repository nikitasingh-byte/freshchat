// MCP tool definitions and implementations (read-only).
import { z } from 'zod';
import { fcGet } from './freshchat';
import { mask, maskText, maskUser } from './pii';

const MAX_PAGE = 50;

const flag = (name: string, dflt: boolean) => {
  const v = process.env[name];
  return v === undefined || v === '' ? dflt : ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
};
const maskOn = () => flag('MASK_PII', true);
const showAgentNames = () => flag('SHOW_AGENT_NAMES', false);

const user = (d: unknown) => (maskOn() ? maskUser(d) : d);
const agent = (d: unknown) => (maskOn() ? mask(d, 'agent', showAgentNames()) : d);
const team = (d: unknown) => (maskOn() ? mask(d, 'agent', true) : d);
const text = (s: string) => (maskOn() ? maskText(s) : s);

const id = z.string().min(1).max(100).regex(/^[A-Za-z0-9_\-]+$/, 'Invalid ID');
const page = z.number().int().min(1).default(1);
const perPage = z.number().int().min(1).max(MAX_PAGE).default(MAX_PAGE);

const S = {
  str: (description: string) => ({ type: 'string', description }),
  int: (description: string, dflt?: number) => ({ type: 'integer', description, ...(dflt ? { default: dflt } : {}) }),
  bool: (description: string, dflt: boolean) => ({ type: 'boolean', description, default: dflt }),
};
const pagingProps = {
  page: S.int('Page number, starting at 1', 1),
  items_per_page: S.int(`Items per page (max ${MAX_PAGE})`, MAX_PAGE),
};

interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  schema: z.ZodTypeAny;
  run: (args: any) => Promise<unknown>;
}

function flattenMessages(data: any, includeSystem: boolean) {
  const msgs = (data?.messages || [])
    .filter((m: any) => includeSystem || m.actor_type !== 'system')
    .map((m: any) => {
      const parts = (m.message_parts || []).map((p: any) => {
        if (p.text) return p.text.content ?? '';
        if (p.image) return '[image]';
        if (p.file) return `[file: ${p.file.name ?? 'attachment'}]`;
        if (p.url_button) return `[button: ${p.url_button.label ?? ''}]`;
        if (p.quick_reply_button) return `[quick reply: ${p.quick_reply_button.label ?? ''}]`;
        return `[${Object.keys(p)[0] ?? 'part'}]`;
      });
      return {
        id: m.id,
        actor_type: m.actor_type,
        actor_id: m.actor_id,
        created_time: m.created_time,
        message_type: m.message_type,
        text: text(parts.join('\n')),
      };
    })
    .sort((a: any, b: any) => String(a.created_time ?? '').localeCompare(String(b.created_time ?? '')));
  return { messages: msgs, pagination: data?.pagination, link: data?.link };
}

export const tools: Tool[] = [
  {
    name: 'get_conversation',
    description:
      "Get a Freshchat conversation's details: status (new/assigned/resolved/reopened), channel (topic), " +
      'assigned agent and group IDs, user IDs and timestamps. The ID is the number at the end of an inbox URL.',
    inputSchema: { type: 'object', properties: { conversation_id: S.str('Freshchat conversation ID') }, required: ['conversation_id'] },
    schema: z.object({ conversation_id: id }),
    run: async ({ conversation_id }) => user(await fcGet(`/conversations/${conversation_id}`)),
  },
  {
    name: 'get_conversation_messages',
    description:
      'Read the messages in a conversation, oldest first, as {actor_type, actor_id, created_time, message_type, text}. ' +
      'Set include_system=true to include system events (assignments, status changes). Private notes have message_type="private".',
    inputSchema: {
      type: 'object',
      properties: {
        conversation_id: S.str('Freshchat conversation ID'),
        ...pagingProps,
        include_system: S.bool('Include system events', false),
      },
      required: ['conversation_id'],
    },
    schema: z.object({ conversation_id: id, page, items_per_page: perPage, include_system: z.boolean().default(false) }),
    run: async (a) =>
      flattenMessages(
        await fcGet(`/conversations/${a.conversation_id}/messages`, { page: a.page, items_per_page: a.items_per_page }),
        a.include_system,
      ),
  },
  {
    name: 'get_user',
    description:
      'Get a Freshchat user (customer) by ID. Contact details are redacted; business properties such as plan, ' +
      'store URL and merchant id are returned.',
    inputSchema: { type: 'object', properties: { user_id: S.str('Freshchat user ID') }, required: ['user_id'] },
    schema: z.object({ user_id: id }),
    run: async ({ user_id }) => user(await fcGet(`/users/${user_id}`)),
  },
  {
    name: 'find_users',
    description: 'Find Freshchat users by exact email, phone or reference_id (at least one required). Returns user IDs and masked records.',
    inputSchema: {
      type: 'object',
      properties: { email: S.str('Exact email'), phone: S.str('Exact phone'), reference_id: S.str('External reference ID') },
    },
    schema: z
      .object({ email: z.string().max(200).optional(), phone: z.string().max(30).optional(), reference_id: z.string().max(200).optional() })
      .refine((v) => v.email || v.phone || v.reference_id, 'Provide email, phone or reference_id.'),
    run: async (a) => {
      const data = await fcGet('/users', a);
      const list = Array.isArray(data) ? data : data?.users || [];
      return { users: list.map(user), pagination: data?.pagination };
    },
  },
  {
    name: 'list_user_conversations',
    description: 'List the conversation IDs belonging to a Freshchat user.',
    inputSchema: { type: 'object', properties: { user_id: S.str('Freshchat user ID') }, required: ['user_id'] },
    schema: z.object({ user_id: id }),
    run: async ({ user_id }) => fcGet(`/users/${user_id}/conversations`),
  },
  {
    name: 'list_agents',
    description: 'List Freshchat agents (IDs, role, availability, groups). Contact details are redacted.',
    inputSchema: { type: 'object', properties: pagingProps },
    schema: z.object({ page, items_per_page: perPage }),
    run: async (a) => agent(await fcGet('/agents', a)),
  },
  {
    name: 'get_agent',
    description: 'Get one Freshchat agent by ID (use to resolve assigned_agent_id).',
    inputSchema: { type: 'object', properties: { agent_id: S.str('Freshchat agent ID') }, required: ['agent_id'] },
    schema: z.object({ agent_id: id }),
    run: async ({ agent_id }) => agent(await fcGet(`/agents/${agent_id}`)),
  },
  {
    name: 'list_groups',
    description: 'List agent groups (teams), e.g. to resolve assigned_group_id to a team name.',
    inputSchema: { type: 'object', properties: pagingProps },
    schema: z.object({ page, items_per_page: perPage }),
    run: async (a) => team(await fcGet('/groups', a)),
  },
  {
    name: 'list_channels',
    description: "List channels / topics (e.g. 'Returns Prime', 'Gokwik Dashboard') with their IDs.",
    inputSchema: { type: 'object', properties: pagingProps },
    schema: z.object({ page, items_per_page: perPage }),
    run: async (a) => team(await fcGet('/channels', a)),
  },
];

export const toolByName = new Map(tools.map((t) => [t.name, t]));

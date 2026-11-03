# Freshchat connector for Claude (GoKwik Deployer)

A read-only Freshchat MCP server built for the GoKwik internal app platform (React + Vite + Hono, `type: fullstack`).
It gives Claude 9 read-only tools for the Freshchat inbox. Customer PII is redacted before anything leaves the app.

| Part | What it does |
|---|---|
| `api/webhook/mcp` | The MCP endpoint Claude connects to. It's under `/api/webhook/` because only those routes skip Google SSO, so the route checks a secret key itself. |
| `/api/status`, `/api/status/test` | Behind SSO. Used by the web page to show which secrets are set and to test the Freshchat connection. |
| `src/` | A small status page at `https://deployer.dev.gokwik.in/gokwik/freshchat/` |

## Tools

`get_conversation`, `get_conversation_messages`, `get_user`, `find_users`, `list_user_conversations`,
`list_agents`, `get_agent`, `list_groups`, `list_channels`. All are read-only: Claude can't send replies or change anything.

## 1. Deploy

1. Push this folder to a GitHub repo, or drag the folder onto **Deploy App**.
2. `platform.json` uses the name `freshchat`, so it replaces your existing `freshchat` page.

## 2. Add secrets (Dashboard → freshchat → Secrets)

| Key | Value |
|---|---|
| `FRESHCHAT_API_TOKEN` | Freshchat → Admin → Configure → API Tokens |
| `FRESHCHAT_API_URL` | `https://<your-account>.freshchat.com/v2` (the "Your chat URL" value) |
| `MCP_CONNECTOR_KEY` | A long random string, e.g. `openssl rand -hex 32`. Needed for the Claude app. |
| `MCP_AUTH_TOKEN` | Optional. A bearer token for Claude Code or scripts. |
| `MASK_PII` | `true` |
| `SHOW_AGENT_NAMES` | Optional, `false` by default |

Secrets can take up to 5 minutes to apply (they're cached at runtime). The endpoint refuses all requests until
`MCP_CONNECTOR_KEY` or `MCP_AUTH_TOKEN` is set.

## 3. Check it

Open `https://deployer.dev.gokwik.in/gokwik/freshchat/`. Every row should be green. Then click **Run test**.

## 4. Connect Claude

**Claude app (web/desktop):** Settings → Connectors → Add custom connector (on Team/Enterprise, an org Owner adds it under Admin settings → Connectors).

- Name: `Freshchat`
- URL: `https://deployer.dev.gokwik.in/_api/app/freshchat/api/webhook/mcp/<MCP_CONNECTOR_KEY>`

The full URL works like a password. Share it only with people who should read the inbox, and rotate the key if it leaks
(replace the secret, then update the connector).

**Claude Code:**

```bash
claude mcp add --transport http freshchat \
  https://deployer.dev.gokwik.in/_api/app/freshchat/api/webhook/mcp \
  --header "Authorization: Bearer $MCP_AUTH_TOKEN"
```

Test prompt: *"Summarise Freshchat conversation 1186537203984926 and tell me which team handled it."*

## PII masking

- Customer fields (`email`, `phone`, `first_name`, `last_name`, `name`, `avatar`, `ip`…) become `[redacted]`.
- Message text and custom properties: emails become `[email]`, and 10–15 digit phone numbers become `[phone]`.
- Business properties (plan, StoreURL, merchant id) and IDs are kept.
- Agent emails and phones are always redacted. Agent names are redacted unless `SHOW_AGENT_NAMES=true`.

Masking uses patterns, so check it against a few real conversations before a wider rollout.

## Limits to know

- Platform: 100 requests/min per app and 60 s per request. Each tool call is one Freshchat request.
- Freshchat: hourly limits depend on your plan. A 429 error is passed back to Claude with the reset time.
- Freshchat has no list-all-conversations endpoint, so start from a conversation ID or a user.

## Local development

```bash
npm install
FRESHCHAT_API_URL=... FRESHCHAT_API_TOKEN=... MCP_AUTH_TOKEN=dev npm run dev:api   # http://localhost:3001
npm run dev                                                                       # http://localhost:5173
```

## Package note

`@hono/node-server` and `tsx` are dev-only (local `dev:api`) and aren't in the production bundle. The MCP protocol
is implemented directly in `api/mcp.ts`, so no extra runtime packages are needed beyond `hono` and `zod`.

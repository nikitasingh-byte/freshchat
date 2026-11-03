import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, PlugZap, ShieldCheck, Copy } from 'lucide-react';
import { api, connectorUrl } from '@/lib/api';

interface Status {
  user: string | null;
  secrets: Record<string, boolean>;
  maskPii: boolean;
  tools: string[];
}

const REQUIRED = ['FRESHCHAT_API_URL', 'FRESHCHAT_API_TOKEN'];
const AUTH = ['MCP_CONNECTOR_KEY', 'MCP_AUTH_TOKEN'];

function Row({ label, ok, hint }: { label: string; ok: boolean; hint?: string }) {
  return (
    <li className="flex items-start gap-3 py-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-label="set" />
      ) : (
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" aria-label="missing" />
      )}
      <div className="min-w-0">
        <code className="break-all text-sm text-slate-100">{label}</code>
        {hint && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
    </li>
  );
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-white">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState('');
  const [test, setTest] = useState<{ state: 'idle' | 'running' | 'done'; ok?: boolean; message?: string }>({ state: 'idle' });
  const [copied, setCopied] = useState(false);
  const url = connectorUrl();

  useEffect(() => {
    api.get<Status>('/api/status').then(setStatus).catch((e) => setLoadError(e.message));
  }, []);

  const runTest = async () => {
    setTest({ state: 'running' });
    try {
      const r = await api.post<{ ok: boolean; message: string }>('/api/status/test');
      setTest({ state: 'done', ...r });
    } catch (e) {
      setTest({ state: 'done', ok: false, message: (e as Error).message });
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const authOk = status ? AUTH.some((k) => status.secrets[k]) : false;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <header className="mb-8">
        <p className="text-sm font-semibold text-gokwik-orange">GoKwik · Claude connector</p>
        <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Freshchat for Claude</h1>
        <p className="mt-2 text-sm text-slate-400">
          Read-only access to the Freshchat inbox for Claude. Customer names, emails and phone numbers are redacted
          before any data leaves this app.
        </p>
      </header>

      {loadError && (
        <p className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          Couldn't load status: {loadError}
        </p>
      )}

      <div className="grid gap-5">
        <Card title="Secrets" icon={<ShieldCheck className="h-5 w-5 text-gokwik-orange" />}>
          {!status && !loadError && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
          {status && (
            <>
              <ul className="divide-y divide-white/5">
                {REQUIRED.map((k) => (
                  <Row key={k} label={k} ok={status.secrets[k]} hint="Required" />
                ))}
                <Row
                  label="MCP_CONNECTOR_KEY or MCP_AUTH_TOKEN"
                  ok={authOk}
                  hint="At least one is required. Use MCP_CONNECTOR_KEY for the Claude app."
                />
                <Row label="PII masking" ok={status.maskPii} hint={status.maskPii ? 'On' : 'Off: set MASK_PII=true'} />
              </ul>
              <p className="mt-3 text-xs text-slate-500">
                Add or replace values from Dashboard → freshchat → Secrets. Values are never shown here.
              </p>
            </>
          )}
        </Card>

        <Card title="Test Freshchat connection" icon={<PlugZap className="h-5 w-5 text-gokwik-orange" />}>
          <p className="mb-4 text-sm text-slate-400">Makes one small API call to check the URL and token. No data is shown.</p>
          <button
            onClick={runTest}
            disabled={test.state === 'running'}
            className="inline-flex items-center gap-2 rounded-xl bg-gokwik-orange px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {test.state === 'running' && <Loader2 className="h-4 w-4 animate-spin" />}
            Run test
          </button>
          {test.state === 'done' && (
            <p className={`mt-3 text-sm ${test.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{test.message}</p>
          )}
        </Card>

        <Card title="Add to Claude" icon={<CheckCircle2 className="h-5 w-5 text-gokwik-orange" />}>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-300">
            <li>
              In Claude, go to <b>Settings → Connectors → Add custom connector</b> (an org Owner does this under Admin
              settings on Team/Enterprise).
            </li>
            <li>
              Name it <b>Freshchat</b> and paste this URL, replacing the placeholder with your MCP_CONNECTOR_KEY value:
            </li>
          </ol>
          <div className="mt-3 flex items-stretch gap-2">
            <code className="min-w-0 flex-1 break-all rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-slate-200">
              {url}
            </code>
            <button
              onClick={copy}
              className="shrink-0 rounded-xl border border-white/10 px-3 text-slate-300 hover:bg-white/5"
              aria-label="Copy URL"
            >
              {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Treat the full URL like a password: anyone with it can read the inbox through this connector.
          </p>
          {status && (
            <p className="mt-4 text-xs text-slate-400">
              Tools: {status.tools.join(', ')}
            </p>
          )}
        </Card>
      </div>
    </main>
  );
}

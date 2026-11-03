import { Hono, Context } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
  ScanCommand,
  BatchGetCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';

declare module 'hono' {
  interface ContextVariableMap {
    userEmail: string;
    appName: string;
  }
}

// Extracts X-User-Email and X-App-Name headers (injected by the platform runtime)
export const platformMiddleware: MiddlewareHandler = async (c, next) => {
  const email = c.req.header('x-user-email') || '';
  const appName = c.req.header('x-app-name') || process.env.APP_NAME || '';
  c.set('userEmail', email);
  c.set('appName', appName);
  await next();
};

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-south-1',
});

export const db = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

// Returns full DynamoDB table name: gk-{appName}-{tableName}
export function tableName(name: string, c?: Context): string {
  const appName = c?.get('appName')
    || c?.req?.header('x-app-name')
    || process.env.APP_NAME
    || 'my-app';
  return `gk-${appName}-${name}`;
}

export {
  GetCommand, PutCommand, QueryCommand, DeleteCommand,
  UpdateCommand, ScanCommand, BatchGetCommand, BatchWriteCommand,
};

// ─── Platform Services ──────────────────────────────────────────────────────
// Provides access to storage, cache, email, and background jobs.
// These are injected by the platform runtime — only available in API routes.
// Each service is automatically scoped to your app (no need to pass appName).

function getPlatformServices(): any {
  if (!(globalThis as any).__platform) {
    throw new Error(
      'Platform services are only available inside API route handlers at runtime. ' +
      'Do not call platform.* at module scope or in frontend code.'
    );
  }
  return (globalThis as any).__platform;
}

/**
 * Platform infrastructure services. Import and use in your API routes:
 *
 * import { platform } from './platform-sdk';
 *
 * // File storage (S3)
 * const { uploadUrl } = await platform.storage.getUploadUrl('report.pdf', 'application/pdf');
 * const files = await platform.storage.listFiles();
 *
 * // Key-value cache (DynamoDB with TTL)
 * await platform.cache.set('key', { data: 123 }, 3600);
 * const value = await platform.cache.get('key');
 *
 * // Email (SES, @gokwik.co only)
 * await platform.email.send({ to: ['user@gokwik.co'], subject: 'Hi', html: '<p>Hello</p>' });
 *
 * // Background jobs (async Lambda invocation)
 * const { jobId } = await platform.jobs.enqueue('/api/process', { data: 123 });
 * const job = await platform.jobs.get(jobId);
 */
export const platform = {
  /** S3 file storage — upload, download, list, delete files for your app */
  get storage() { return getPlatformServices().storage; },
  /** DynamoDB key-value cache with automatic TTL expiration */
  get cache() { return getPlatformServices().cache; },
  /** SES email — send transactional emails to @gokwik.co addresses */
  get email() { return getPlatformServices().email; },
  /** Async background job queue — enqueue work for your API routes */
  get jobs() { return getPlatformServices().jobs; },
} as {
  storage: {
    getUploadUrl(filename: string, contentType?: string): Promise<{ uploadUrl: string; key: string }>;
    getDownloadUrl(filename: string): Promise<{ downloadUrl: string }>;
    listFiles(): Promise<Array<{ name: string; size: number; lastModified: string }>>;
    deleteFile(filename: string): Promise<{ deleted: boolean }>;
  };
  cache: {
    get(key: string): Promise<any>;
    set(key: string, value: any, ttlSeconds?: number): Promise<void>;
    delete(key: string): Promise<void>;
    list(): Promise<Array<{ key: string; ttl: number; updatedAt: string }>>;
    clear(): Promise<{ deleted: number }>;
  };
  email: {
    send(params: { to: string[]; subject: string; body?: string; html?: string }): Promise<{ messageId: string; remaining: number }>;
  };
  jobs: {
    enqueue(handlerPath: string, payload?: any): Promise<{ jobId: string; status: string }>;
    get(jobId: string): Promise<any>;
    list(limit?: number): Promise<any[]>;
  };
};

// Frontend API client — auto-detects production vs local dev base path
export function createApiClient() {
  const isLocal = typeof window !== 'undefined'
    && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  let basePath: string;
  if (isLocal) {
    basePath = '';
  } else {
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const appName = pathParts.length >= 2 ? pathParts[1] : '';
    basePath = `/_api/app/${appName}`;
  }

  async function request(method: string, path: string, body?: unknown) {
    const url = `${basePath}${path}`;
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    };
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }
    const res = await fetch(url, options);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `Request failed: ${res.status}`);
    }
    return res.json();
  }

  return {
    get: (path: string) => request('GET', path),
    post: (path: string, body?: unknown) => request('POST', path, body),
    put: (path: string, body?: unknown) => request('PUT', path, body),
    delete: (path: string) => request('DELETE', path),
  };
}

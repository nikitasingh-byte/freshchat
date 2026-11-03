// Local development only: serves the Hono app on http://localhost:3001.
// Not used in production (the platform bundles api/index.ts into handler.mjs).
import { serve } from '@hono/node-server';
import app from './index';

const port = Number(process.env.PORT || 3001);
serve({ fetch: app.fetch, port });
console.log(`API listening on http://localhost:${port}`);

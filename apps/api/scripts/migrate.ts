import path from 'node:path';
import dotenv from 'dotenv';
import { Client } from 'pg';

// Load apps/api/.env (CommonJS-friendly; avoid import.meta)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const POSTGRES_URL = process.env.POSTGRES_URL;
if (!POSTGRES_URL) {
  console.error('POSTGRES_URL is not set. Please configure apps/api/.env');
  process.exit(1);
}

async function withRetry<T>(fn: () => Promise<T>, retries = 30, delayMs = 1000): Promise<T> {
  // Simple retry helper to wait for the DB to accept connections after docker-compose up
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

async function run() {
  await withRetry(async () => {
    const client = new Client({ connectionString: POSTGRES_URL });
    await client.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS threads (
          "threadId" VARCHAR(64) PRIMARY KEY,
          "agent" VARCHAR(128) NOT NULL,
          "model" VARCHAR(128) NOT NULL,
          "accountId" VARCHAR(64) NOT NULL,
          "userId" VARCHAR(64) NOT NULL,
          "systemPromptTemplate" TEXT NOT NULL,
          "systemPrompt" TEXT NOT NULL,
          "parameters" JSONB NOT NULL DEFAULT '{}'::jsonb,
          "inputTokenCount" INTEGER NOT NULL DEFAULT 0,
          "outputTokenCount" INTEGER NOT NULL DEFAULT 0,
          "messages" JSONB NOT NULL DEFAULT '[]'::jsonb,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_threads_account_created ON threads("accountId", "createdAt" DESC);
      `);
      console.log('Postgres migration complete.');
    } finally {
      await client.end();
    }
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});



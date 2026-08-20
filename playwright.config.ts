/**
 * Two servers, not one: Playwright brings up Hono and Vite, because these journeys prove things
 * neither one proves alone. Half of what they check is that the first-party session cookie survives
 * Vite's proxy — which is why `signInAs` fills the form instead of posting to the API.
 *
 * `reuseExistingServer` is what lets somebody keep `bun run dev` open while running the suite. In CI
 * it is off, so a stale process cannot make a run pass.
 *
 * `retries: 0` on purpose. A test that only passes on the second attempt is not a test — it is a
 * measurement of how patient the machine was feeling.
 */
import { readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/*
 * The API's port comes from the same `.env` the dev proxy reads. Hard-coding 3000 breaks the moment
 * somebody changes `PORT` — which the README tells them to do when the port is taken — and the
 * failure then looks like the application being broken rather than like the health check pointing at
 * nothing.
 *
 * Parsed by hand rather than with Vite's `loadEnv`: under Bun's isolated install `vite` lives in
 * `apps/web/node_modules`, and this file sits at the repository root where it cannot reach it. Two
 * lines of parsing beat a dependency that resolves in one directory and not in the one next to it.
 */
const DEFAULT_API_PORT = '3000';

const portFromEnvFile = (): string => {
  try {
    const line = readFileSync(new URL('.env', import.meta.url), 'utf8')
      .split('\n')
      .find((candidate) => candidate.startsWith('PORT='));
    return line?.slice('PORT='.length).trim() ?? '';
  } catch {
    /* No `.env` at all is a valid state — the API falls back to its own default too. */
    return '';
  }
};

const configured = portFromEnvFile();
const apiPort = configured === '' ? DEFAULT_API_PORT : configured;

const WEB = 'http://localhost:5173';
const MINUTE = 60_000;

export default defineConfig({
  testDir: './e2e',
  retries: 0,
  /* One at a time: these journeys write to a shared database, and two of them at once interleave. */
  workers: 1,
  use: { baseURL: WEB, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'bun run dev:api',
      url: `http://localhost:${apiPort}/health/live`,
      reuseExistingServer: process.env.CI === undefined,
      timeout: 2 * MINUTE,
    },
    {
      command: 'bun run dev:web',
      url: WEB,
      reuseExistingServer: process.env.CI === undefined,
      timeout: 2 * MINUTE,
    },
  ],
});

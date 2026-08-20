import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';

/*
 * The repository root, where the single `.env` lives. The front has no `.env` of its own on purpose:
 * one file decides which port the API listens on, and the dev proxy has to agree with it or every
 * request the front makes reaches nothing. Hard-coding 3000 here breaks the moment somebody changes
 * `PORT` — which the README tells them to do when a port is already taken, and which is exactly the
 * kind of failure that looks like the front being broken rather than the proxy pointing elsewhere.
 *
 * Only the proxy target is read from that file. Vite exposes to the bundle exclusively what is
 * prefixed `VITE_`, so nothing else in it can reach the browser.
 *
 * `loadEnv` comes from `vite` and `defineConfig` from `vitest/config` — the second is what types the
 * `test` key, and it does not re-export the first.
 */
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

const DEFAULT_API_PORT = '3000';

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, repositoryRoot, '');
  const apiPort =
    environment.PORT === undefined || environment.PORT === '' ? DEFAULT_API_PORT : environment.PORT;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { '/api': { target: `http://localhost:${apiPort}`, changeOrigin: false } },
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: true,
      target: 'es2022',

      /*
       * The manifest maps every chunk to its file on disk, and Vite writes it only when asked. It is
       * what `budget.test.ts` reads to work out which files a guardian actually downloads — the entry
       * plus that role's chunk — rather than adding up whatever happens to be in `dist/`.
       */
      manifest: true,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./tests/testSetup.ts'],
      globals: true,

      /*
       * CSS modules are processed and injected during the run; everything else is stubbed as usual.
       *
       * Without this, a `.module.css` import resolves to a proxy of class names and the stylesheet is
       * never in the document — so a rule can be deleted and no test notices. That is exactly what
       * happened to the skip link: the class was on the element, the rule had not migrated from
       * `app.css`, and it sat visible on every signed-in screen with the whole suite green.
       *
       * Scoped to `.module.css` so the cost stays where the value is: Mantine's own stylesheets are
       * large, they are not what this application decides anything with, and jsdom would spend the
       * time parsing them for nothing.
       */
      css: { include: [/\.module\.css$/] },

      /*
       * The ordinary suite is `tests/` and nothing else.
       *
       * `budget.test.ts` sits at the workspace root deliberately, and this is what keeps it out: it
       * reads `dist/`, which does not exist until `build:web` has run, so including it would make a
       * green run depend on whether somebody built first — and a test that passes because the file it
       * weighs is missing is worse than no test at all.
       *
       * Restricting `include` rather than adding to `exclude` is not a matter of taste: Vitest
       * **appends** a command-line `--exclude` to the configured one, so an excluded file cannot be
       * run back in from the command line. `bun run budget` builds and then points `--include` here.
       */
      include: [...configDefaults.include.map((pattern) => `tests/${pattern}`)],

      /*
       * `budget.test.ts` lives with the rest of the suite — a test does not deserve its own corner
       * of the tree for a configuration reason — but it weighs `dist/`, so it runs only after
       * `build:web`. `bun run budget` reaches it through `vitest.budget.config.ts`, which has an
       * `include` of its own; that is why excluding it here costs nothing.
       */
      exclude: [...configDefaults.exclude, 'tests/budget.test.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        // `src/` holds production code and nothing else, so the only thing left to exclude is the
        // entry point, which exists to mount React and decides nothing.
        exclude: ['src/main.tsx'],
        thresholds: { lines: 80, functions: 80, branches: 80 },
      },
    },
  };
});

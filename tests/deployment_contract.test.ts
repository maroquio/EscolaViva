/*
 * The three configuration lines that decide whether the built application works, and which nothing
 * else in the suite reads.
 *
 * Each of them was a defect once, on 2026-08-17, and each shares a shape: the rule was known, written
 * down in prose beside the code, and enforced by nothing. A comment is not a guard. `bun run verify`
 * never builds an image and never opens `docker-compose.yml`, so the only thing that caught these was
 * running the build by hand — which happens at most once per task and never in a hurry.
 *
 * These cases do not build the image: `docker build` takes minutes and needs a daemon the suite has
 * no business requiring. They read what the build will do and compare it against what the repository
 * actually contains. That trade is honest as long as what is compared is **derived** rather than
 * listed — the front's imports decide what has to be copied, and `.env.example` decides what has to
 * be overridden. A hard-coded list would pass forever after the code moved.
 */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');

const read = async (relativePath: string): Promise<string> =>
  await Bun.file(join(ROOT, relativePath)).text();

const DOCKERFILE = 'infra/Dockerfile';
const COMPOSE = 'infra/docker-compose.yml';
const ENV_EXAMPLE = '.env.example';
const E2E_TSCONFIG = 'e2e/tsconfig.json';

/* ------------------------------------------------------------------------- */

describe('the image carries everything the front needs in order to be built', () => {
  /*
   * Which workspace packages of this repository a given tree imports, as directories relative to the
   * root. The name is derived from the import specifier rather than listed: `@escolaviva/contracts`
   * lives at `packages/contracts`, and a second shared package would be noticed the day it appears.
   */
  const workspacePackagesImportedBy = async (tree: string): Promise<string[]> => {
    const found = new Set<string>();
    const importPath = /from\s+'@escolaviva\/([a-z-]+)/g;

    for await (const relativePath of new Bun.Glob('**/*.{ts,tsx}').scan({
      cwd: join(ROOT, tree),
    })) {
      const content = await Bun.file(join(ROOT, tree, relativePath)).text();
      for (const [, name] of content.matchAll(importPath)) {
        if (name !== undefined) found.add(`packages/${name}`);
      }
    }
    return [...found].sort();
  };

  const copiedInStage = (dockerfile: string, stage: string): string => {
    const start = dockerfile.indexOf(`AS ${stage}`);
    expect(start).toBeGreaterThan(-1);
    const next = dockerfile.indexOf('\nFROM ', start);
    return dockerfile.slice(start, next === -1 ? undefined : next);
  };

  test('the front really does import a shared package, so the question is not vacuous', async () => {
    const packages = await workspacePackagesImportedBy('apps/web/src');

    expect(packages).toEqual(['packages/contracts']);
  });

  /*
   * The defect, on 2026-08-17: the `front` stage copied `apps/web` and nothing else, and Vite
   * stopped at `Could not resolve "@escolaviva/contracts/enumerations"` — a message naming the
   * front's file rather than the copy that was missing. The build failed loudly, which is the good
   * case; what makes it worth a guard is that it fails **only** in `docker build`, and a broken
   * image is discovered at deploy time.
   */
  test('every shared package the front imports is copied into the build stage', async () => {
    const dockerfile = await read(DOCKERFILE);
    const front = copiedInStage(dockerfile, 'front');
    const packages = await workspacePackagesImportedBy('apps/web/src');

    const missing = packages.filter((each) => !front.includes(`COPY ${each} `));

    expect(missing).toEqual([]);
  });

  /*
   * The same question on the other side, and the one that fails quietly. `apps/api/node_modules`
   * carries a symlink to `packages/contracts`; copying the symlink without its target leaves it
   * hanging. Today every import the API makes of that package is type-only, so Bun erases them
   * before anything is resolved and the image runs perfectly — the defect would arrive with the
   * first handler that imports `ROLES`, in a deploy where nothing else changed.
   */
  test('every shared package the server imports is copied into the runtime stage', async () => {
    const dockerfile = await read(DOCKERFILE);
    const runtime = copiedInStage(dockerfile, 'runtime');
    const packages = await workspacePackagesImportedBy('apps/api/src');

    const missing = packages.filter((each) => !runtime.includes(`COPY ${each} `));

    expect(missing).toEqual([]);
  });

  /*
   * `--frozen-lockfile` refuses the install when a workspace member declared in the lockfile has no
   * manifest on disk, so a package added to `workspaces` and forgotten here breaks every stage.
   */
  test('the manifests stage carries a package.json for every workspace member', async () => {
    const dockerfile = await read(DOCKERFILE);
    const manifests = copiedInStage(dockerfile, 'manifests');
    const members = [
      ...(await workspacePackagesImportedBy('apps/web/src')),
      ...(await workspacePackagesImportedBy('apps/api/src')),
    ];

    const missing = [...new Set(members)].filter(
      (each) => !manifests.includes(`COPY ${each}/package.json`),
    );

    expect(missing).toEqual([]);
  });

  /*
   * Bun's isolated install leaves the store at the top and symlinks under `apps/api/node_modules`.
   * Copying only the top produces an image that builds, starts, and dies on the first import with
   * `Cannot find package 'hono'` — so this one does not even fail at build time. It fails at boot,
   * in production, on an image that passed every check.
   */
  test('the runtime stage takes both halves of the isolated install', async () => {
    const dockerfile = await read(DOCKERFILE);

    expect(dockerfile).toContain('COPY --from=dependencies /app/node_modules');
    expect(dockerfile).toContain('COPY --from=dependencies /app/apps/api/node_modules');
  });
});

/* ------------------------------------------------------------------------- */

describe('the front path survives the compose file', () => {
  const composeAppService = async (): Promise<string> => {
    const compose = await read(COMPOSE);
    const start = compose.indexOf('\n  app:');
    expect(start).toBeGreaterThan(-1);
    const next = compose.indexOf('\nvolumes:', start);
    return compose.slice(start, next === -1 ? undefined : next);
  };

  /*
   * The premise of the case below, asserted rather than assumed. `.env.example` ships `FRONT_PATH=`
   * empty on purpose — empty means "the default, `apps/web/dist`", which is right for a developer and
   * wrong inside the image, where only the build is copied and the front's source is not there at all.
   */
  test('.env.example ships FRONT_PATH empty, which is what makes the override necessary', async () => {
    const example = await read(ENV_EXAMPLE);

    expect(example).toMatch(/^FRONT_PATH=\s*$/m);
  });

  /*
   * The defect, and the worst-behaved of the three. `env_file` loads that empty value **over** the
   * image's own `ENV FRONT_PATH=/app/front`, because in Docker an empty value is a value. Measured on
   * 2026-08-17: `/health/live` answered 200 while every screen answered 404 — the application looking
   * alive to whoever reads status lines and blank to whoever opens it. `environment:` wins over
   * `env_file:`, and that is the whole fix.
   */
  test('the app service pins FRONT_PATH under environment, where it beats env_file', async () => {
    const service = await composeAppService();
    const dockerfile = await read(DOCKERFILE);

    const declared = /ENV FRONT_PATH=(\S+)/.exec(dockerfile);
    expect(declared?.[1]).toBeDefined();

    const environment = service.slice(service.indexOf('environment:'));
    expect(environment).toContain(`FRONT_PATH: ${declared?.[1] ?? ''}`);
  });

  /* If the service stopped reading the root `.env`, the case above would be guarding nothing. */
  test('the app service does load the root .env, which is where the empty value comes from', async () => {
    const service = await composeAppService();

    expect(service).toContain('env_file:');
    expect(service).toContain('../.env');
  });
});

/* ------------------------------------------------------------------------- */

/*
 * Playwright runs on Node. `e2e/tsconfig.json` said `"types": ["bun"]`, so a spec calling `Bun.file`
 * passed `tsc --noEmit` and then died with `ReferenceError: Bun is not defined` — with the browser
 * already open, in a report that reads like a flaky test.
 *
 * This case reads the declaration rather than compiling a probe: a probe would need `tsc` on a file
 * written into `e2e/` and removed afterwards, which is slow and leaves debris when it fails. The
 * effect itself was measured once, by hand, and the error code is written here so the reader can
 * repeat it: put `Bun.file` in a spec and `tsc -p e2e/tsconfig.json` answers TS2868.
 */
describe('the compiler knows which runtime the journeys have', () => {
  const e2eTypes = async (): Promise<string[]> => {
    const raw = await read(E2E_TSCONFIG);
    const parsed = JSON.parse(raw) as { compilerOptions?: { types?: string[] } };
    return parsed.compilerOptions?.types ?? [];
  };

  test('the journeys are typed for Node, not for Bun', async () => {
    const types = await e2eTypes();

    expect(types).toContain('node');
    expect(types).not.toContain('bun');
  });

  /*
   * The other half of the same rule, and the reason `"types": []` is not a fix: `support.ts` reaches
   * `scripts/e2e-clean.ts` through `node:child_process` precisely because it may not import a module
   * that uses `Bun.sql`. Take Node's types away and that import stops compiling.
   */
  test('the support file reaches the cleanup script as a Node subprocess', async () => {
    const support = await read('e2e/support.ts');

    expect(support).toContain("from 'node:child_process'");
    expect(support).toContain('scripts/e2e-clean.ts');
  });
});

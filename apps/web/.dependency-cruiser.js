/**
 * The front sees the API through @escolaviva/contracts, and through nothing else. A React file that reaches
 * for `academics`, `identity` or `shared/db` compiles perfectly and is an architecture error: it
 * couples the browser bundle to a module that exists to be replaced at a later stage, and it drags
 * server-only code (Bun.sql, pino) into a graph that has to run in a browser. The rule is here rather
 * than in the API's config because a cruise reports on what it is pointed at, and these are two trees.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
const configuration = {
  forbidden: [
    {
      name: 'web-sees-only-contracts',
      comment:
        'apps/web — source and suite alike — may import packages/contracts/ and nothing else from this repository. ' +
        'A contract file has zero imports of its own (Task 8), so this arrow can never pull the ' +
        'server graph across the boundary. The rule is written as a permission rather than as a ' +
        'ban on `apps/api/src/`, because the server is not the only thing on the other side of the ' +
        'boundary: `apps/api/tests/support/factories.ts` is the sort of file an MSW fixture reaches ' +
        'for, and `scripts/`, `migrations/` and `infra/` are no more importable from a browser ' +
        'bundle than `shared/db` is. Naming what is allowed leaves nothing unnamed to slip through.',
      severity: 'error',
      from: { path: '^apps/web/(?:src|tests)' },
      to: {
        // The subject is what this repository holds. A package and a Node builtin are a different
        // question — the browser bundle answers it, and `budget.test.ts` is where it is asked.
        // `unknown` is what a triple-slash type reference resolves to (`vite/client`), which names
        // an ambient type and imports no code.
        dependencyTypesNot: [
          'core',
          'npm',
          'npm-dev',
          'npm-optional',
          'npm-peer',
          'npm-bundled',
          'npm-no-pkg',
          'npm-unknown',
          'unknown',
        ],
        pathNot: ['^apps/web/', '^packages/contracts/'],
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json'],
    },
  },
};

export default configuration;

/**
 * I1 — the boundary between modules checked by a tool, not by a verbal agreement.
 * Runs under `bun run check`.
 *
 * The graph allowed at Stage 01:
 *
 *   communication ──┐
 *   assessment ─────┼──▶ academics ──▶ identity
 *                   └──▶ identity
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
/*
 * While the repository is converted to English, each module folder exists under two names at
 * different moments. The rules match paths by regex: if the alternation knew only one of the
 * names, renaming the folder would switch the rule off in silence — depcruise would go on printing
 * "no dependency violations found" simply because it no longer saw anything. That is why both
 * spellings live side by side here until the contraction phase, and the checklist plants a
 * violation in all four modules to prove each alternative still has teeth.
 */
const MODULOS = '(?:identidade|identity|academico|academics|avaliacao|assessment|comunicacao|communication)';

const DOMINIO = '(?:dominio|domain)';

const configuracao = {
  forbidden: [
    {
      name: 'no-cross-module-shortcut',
      comment:
        'A module sees another one only through its `index.ts`. An internal path (domain/, ' +
        'application/, infra/) is private. This protects the answer to "what else touches this?": ' +
        'when `billing/` is extracted at Stage 14, the list of dependents is exactly whoever ' +
        'imports the index — without this rule the extraction turns into a rewrite. `from.pathNot` ' +
        'takes `src/shared/` out of this rule\'s reach because `shared-knows-no-domain` already ' +
        'forbids any arrow leaving there, and reporting the same violation twice only confuses ' +
        'whoever has to fix it.',
      severity: 'error',
      from: {
        // The group captures the module of origin and reappears as `$1` in `to.pathNot`:
        // that is how a module stays free to import its own internal files.
        path: '^src/([^/]+)/',
        pathNot: '^src/shared/',
      },
      to: {
        path: `^src/${MODULOS}/`,
        pathNot: ['^src/$1/', `^src/${MODULOS}/index\\.ts$`],
      },
    },
    {
      name: 'pure-domain',
      comment:
        'The domain does not know that a database, HTTP, a log, a scheduler or a third-party ' +
        'library exists. It may reach only `src/shared/ports/`, `src/shared/result.ts` and ' +
        '`src/shared/document/` — the last one because it is a pure value, with no I/O and no ' +
        'business rule of any module: the CPF arithmetic is the same for identity and for ' +
        'academics, and duplicating it would be worse than sharing it. That is what makes the ' +
        'pedagogical-rule test a pure test, and what unlocks I3: when the `Mailer` arrives at ' +
        'Stage 04, `ports/` will be the only place it fits.',
      severity: 'error',
      from: { path: `^src/[^/]+/${DOMINIO}/` },
      to: { path: ['^src/shared/(?:db|http|log|jobs)/', 'node_modules'] },
    },
    {
      name: 'shared-knows-no-domain',
      comment:
        'The dependency always runs from the outside in: `src/shared/` is infrastructure with no ' +
        'business rule and may import neither identity, nor academics, nor assessment, nor ' +
        'communication. That is why `shared/http/session.ts` declares the structural shape of the ' +
        'user instead of importing it. Without this rule, extracting a module at Stage 14 would ' +
        'drag the whole of `shared/` along with it.',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: `^src/${MODULOS}/` },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    // Without this, an `import type` vanishes from the graph and the three rules lose their teeth.
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.js', '.mjs', '.json'],
    },
  },
};

export default configuracao;

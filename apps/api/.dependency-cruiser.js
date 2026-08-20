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
const MODULOS = '(?:identity|academics|assessment|communication)';

const DOMINIO = 'domain';

const APLICACAO = 'application';

/*
 * Zod is the one third-party name a use case may say, and it is there because I22 puts it there:
 * validation happens on the server, inside the application layer, before the domain is touched.
 * Anything else asking to be added here is an effect, and an effect belongs behind a port.
 */
const VALIDACAO = 'node_modules/zod';

/*
 * What the domain is allowed to reach. Written as a permission because a denylist only forbids what
 * somebody remembered to name: `shared/pagination` and `shared/config` were never on it, and a
 * domain file importing either would have passed the check in silence. `shared/ports/` is here for
 * `Clock` and `IdGenerator` even though no domain file imports one yet — the day one does, the rule
 * must not be what stops it.
 */
const O_DOMINIO_ALCANCA = [
  `^apps/api/src/[^/]+/${DOMINIO}/`,
  '^apps/api/src/[^/]+/constants\\.ts$',
  '^apps/api/src/shared/(?:ports|document)/',
  '^apps/api/src/shared/(?:result|constants)\\.ts$',
];

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
        path: '^apps/api/src/([^/]+)/',
        pathNot: '^apps/api/src/shared/',
      },
      to: {
        path: `^apps/api/src/${MODULOS}/`,
        pathNot: ['^apps/api/src/$1/', `^apps/api/src/${MODULOS}/index\\.ts$`],
      },
    },
    {
      name: 'pure-domain',
      comment:
        'The domain does not know that a database, HTTP, a log, a scheduler or a third-party ' +
        'library exists. It reaches its own module and four places in `shared/`: `ports/`, ' +
        '`document/` — a pure value, with no I/O and no business rule of any module, because the ' +
        'CPF arithmetic is the same for identity and for academics and duplicating it would be ' +
        'worse than sharing it — plus `result.ts` and `constants.ts`. Everything else is refused, ' +
        'including a Node builtin: reading a clock or a random number is an effect, and an effect ' +
        'belongs behind a port. That is what makes the pedagogical-rule test a pure test.',
      severity: 'error',
      from: { path: `^apps/api/src/[^/]+/${DOMINIO}/` },
      to: { pathNot: O_DOMINIO_ALCANCA },
    },
    {
      name: 'no-sdk-in-application',
      comment:
        'What `pure-domain` does for the domain, this does one layer out. I3 says the `Mailer` of ' +
        'Stage 04 is born in `ports/` "because that is the only place it fits" — and that sentence ' +
        'is only true if the use case cannot import the provider itself. Without this rule the ' +
        'domain stays clean, the check stays green, and `resend` sits in the middle of ' +
        '`inviteUser`, where Stage 05 would have to find it one send site at a time. The allowance ' +
        'is deliberately a single name: zod, which I22 requires here.',
      severity: 'error',
      from: { path: `^apps/api/src/${MODULOS}/${APLICACAO}/` },
      to: { path: 'node_modules', pathNot: VALIDACAO },
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
      from: { path: '^apps/api/src/shared/' },
      to: { path: `^apps/api/src/${MODULOS}/` },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    // Without this, an `import type` vanishes from the graph and the rules lose their teeth.
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.js', '.mjs', '.json'],
    },
  },
};

export default configuracao;

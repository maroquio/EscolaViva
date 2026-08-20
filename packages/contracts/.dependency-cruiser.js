/**
 * A contract is shape, and shape has no dependencies.
 *
 * This package is the only one both halves of the repository import, and the front loads it with a
 * browser bundler. An import here — of zod, of hono, of a server module — would drag server code
 * into the bundle, or simply fail to resolve. A file inside `src/` importing another file inside
 * `src/` is fine: that is what the barrel is.
 *
 * The rule used to live in the API's config, when `contracts/` was a folder inside it. It moved with
 * the folder: a cruise reports on what it is pointed at, and this is now its own tree.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
const configuration = {
  forbidden: [
    {
      name: 'contracts-without-dependencies',
      comment: 'Nothing outside packages/contracts/src may be imported from inside it.',
      severity: 'error',
      from: { path: '^packages/contracts/src/' },
      to: { pathNot: '^packages/contracts/src/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { extensions: ['.ts', '.js', '.mjs', '.json'] },
  },
};

export default configuration;

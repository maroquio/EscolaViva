const REWRITE_FLAG = '--regravar';
const TEST_FILE = 'tests/web/golden.test.ts';

const args = Bun.argv.slice(2);
const rewrite = args.includes(REWRITE_FLAG);

const unknown = args.filter((argument) => argument !== REWRITE_FLAG);
if (unknown.length > 0) {
  console.error(`argumento não reconhecido: ${unknown.join(', ')}`);
  console.error(`uso: bun run golden [${REWRITE_FLAG}]`);
  process.exit(2);
}

console.log(
  rewrite
    ? 'golden: regravando a linha de base das telas…'
    : 'golden: verificando as telas contra a linha de base…',
);

const child = Bun.spawn([process.execPath, 'test', TEST_FILE], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...Bun.env, ...(rewrite ? { GOLDEN_REWRITE: '1' } : {}) },
  stdout: 'inherit',
  stderr: 'inherit',
});

const exitCode = await child.exited;

if (exitCode === 0 && rewrite) {
  console.log('\ngolden: leia `git diff tests/web/golden/` — cada linha alterada é uma tela que mudou.');
}

process.exit(exitCode);

const FLAG_REGRAVAR = '--regravar';
const ARQUIVO_DE_TESTE = 'testes/web/golden.test.ts';

const argumentos = Bun.argv.slice(2);
const regravar = argumentos.includes(FLAG_REGRAVAR);

const desconhecidos = argumentos.filter((argumento) => argumento !== FLAG_REGRAVAR);
if (desconhecidos.length > 0) {
  console.error(`argumento não reconhecido: ${desconhecidos.join(', ')}`);
  console.error(`uso: bun run golden [${FLAG_REGRAVAR}]`);
  process.exit(2);
}

console.log(
  regravar
    ? 'golden: regravando a linha de base das telas…'
    : 'golden: verificando as telas contra a linha de base…',
);

const processo = Bun.spawn([process.execPath, 'test', ARQUIVO_DE_TESTE], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...Bun.env, ...(regravar ? { GOLDEN_REGRAVAR: '1' } : {}) },
  stdout: 'inherit',
  stderr: 'inherit',
});

const codigo = await processo.exited;

if (codigo === 0 && regravar) {
  console.log('\ngolden: leia `git diff testes/web/golden/` — cada linha alterada é uma tela que mudou.');
}

process.exit(codigo);

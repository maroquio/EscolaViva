/**
 * O comando do golden: verificar ou regravar a linha de base das telas.
 *
 *     bun run golden              # verifica: nenhuma tela pode ter mudado de HTML
 *     bun run golden --regravar   # regrava os arquivos de testes/web/golden/
 *
 * Não existe um segundo caminho que renderize as telas: as duas operações rodam o MESMO arquivo de
 * teste, e a única diferença é a variável `GOLDEN_REGRAVAR`. Um script que montasse o cenário por
 * conta própria acabaria gravando um arquivo que o teste nunca produziria — e o golden passaria a
 * comparar a saída da aplicação com a saída do script, que é outra coisa.
 *
 * Rodar por `bun test` também é o que carrega o `preload` do `bunfig.toml`, que aponta a aplicação
 * para o banco descartável. Sem ele, regravar o golden escreveria no banco de desenvolvimento.
 *
 * REGRAVAR É UMA DECISÃO, NÃO UM PASSO. O arquivo golden é o contrato do refactor: se ele muda,
 * alguma tela mudou. Leia `git diff testes/web/golden/` antes de aceitar.
 */

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

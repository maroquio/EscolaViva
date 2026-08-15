import { beforeAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const RAIZ = join(import.meta.dir, '..', '..');

const CAMINHO_DO_BACKUP = join(RAIZ, 'scripts', 'backup.sh');
const CAMINHO_DA_RESTAURACAO = join(RAIZ, 'scripts', 'restore-test.sh');

const URL_COM_SEGREDO = 'postgres://escolaviva:senha_secreta@localhost:5432/escolaviva';

const BLOCO_QUE_LE_O_ENV = /if \[\[ -z "\$\{DATABASE_URL:-\}" && -f[\s\S]*?\nfi\n/;

const SERVICO_DO_BANCO = /^SERVICO_DO_BANCO=(\S+)$/m;

const MODELO_DO_ARQUIVO = /ARQUIVO="\$DESTINO\/([^"]+)"/;

const SUFIXO_DO_PARCIAL = /PARCIAL="\$ARQUIVO([^"]*)"/;

const PADRAO_DA_RETENCAO = /"\$DESTINO"\/(\S+\.dump)/;

const CARIMBO_DE_EXEMPLO = '20260815-101112';

const VARIAVEL_DO_CARIMBO = '$CARIMBO';

let backup = '';
let restauracao = '';

function definicaoDaFuncao(script: string, nome: string): string {
  const linhas = script.split('\n');
  const inicio = linhas.findIndex((linha) => linha.startsWith(`${nome}() {`));
  if (inicio === -1) throw new Error(`o script não define ${nome}()`);
  const primeira = linhas[inicio] ?? '';
  if (primeira.trimEnd().endsWith('}')) return primeira;
  const fim = linhas.findIndex((linha, indice) => indice > inicio && linha === '}');
  return linhas.slice(inicio, fim + 1).join('\n');
}

function capturar(script: string, expressao: RegExp, nome: string): string {
  const capturado = expressao.exec(script)?.[1];
  if (capturado === undefined) throw new Error(`o script não declara ${nome}`);
  return capturado;
}

async function chamar(preambulo: string, nome: string, argumento: string): Promise<string> {
  const processo = Bun.spawn(['bash', '-c', `${preambulo}\n${nome} "$1"`, 'bash', argumento], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const saida = await new Response(processo.stdout).text();
  await processo.exited;
  return saida.trim();
}

describe('scripts de backup e restauração', () => {
  beforeAll(async () => {
    backup = await Bun.file(CAMINHO_DO_BACKUP).text();
    restauracao = await Bun.file(CAMINHO_DA_RESTAURACAO).text();
  });

  test('a URL impressa no console não leva usuário nem senha', async () => {
    const definicao = definicaoDaFuncao(backup, 'sem_credenciais');

    const impresso = await chamar(definicao, 'sem_credenciais', URL_COM_SEGREDO);

    expect(impresso).toBe('postgres://***@localhost:5432/escolaviva');
    expect(impresso).not.toContain('senha_secreta');
  });

  test('a URL de dentro do compose troca o host publicado pelo nome do serviço', async () => {
    const servico = capturar(backup, SERVICO_DO_BANCO, 'SERVICO_DO_BANCO');
    const preambulo = `SERVICO_DO_BANCO=${servico}\n${definicaoDaFuncao(backup, 'url_de_dentro')}`;

    const comPorta = await chamar(preambulo, 'url_de_dentro', URL_COM_SEGREDO);
    const semPorta = await chamar(
      preambulo,
      'url_de_dentro',
      'postgres://escolaviva:senha_secreta@localhost/escolaviva',
    );

    expect(comPorta).toBe(`postgres://escolaviva:senha_secreta@${servico}:5432/escolaviva`);
    expect(semPorta).toBe(`postgres://escolaviva:senha_secreta@${servico}:5432/escolaviva`);
  });

  test('a versão maior sai tanto da saída do cliente quanto da do servidor', async () => {
    const definicao = definicaoDaFuncao(backup, 'versao_maior');

    const doCliente = await chamar(definicao, 'versao_maior', 'pg_dump (PostgreSQL) 14.9');
    const doServidor = await chamar(definicao, 'versao_maior', '16.4 (Debian 16.4-1.pgdg120+1)');

    expect(doCliente).toBe('14');
    expect(doServidor).toBe('16');
    expect(Number(doCliente) < Number(doServidor)).toBe(true);
  });

  test('o dump interrompido no meio não entra na contagem de retenção', () => {
    const modelo = capturar(backup, MODELO_DO_ARQUIVO, 'o nome do arquivo de dump');
    const sufixo = capturar(backup, SUFIXO_DO_PARCIAL, 'o sufixo do arquivo parcial');
    const padrao = new Bun.Glob(capturar(backup, PADRAO_DA_RETENCAO, 'o padrão da retenção'));

    const pronto = modelo.replace(VARIAVEL_DO_CARIMBO, CARIMBO_DE_EXEMPLO);

    expect(padrao.match(pronto)).toBe(true);
    expect(padrao.match(`${pronto}${sufixo}`)).toBe(false);
  });

  test('a retenção guarda um número declarado de dumps, e não um literal solto', () => {
    const retencao = capturar(backup, /^RETENCAO=(\d+)$/m, 'RETENCAO');

    expect(backup).toContain(`tail -n "+$((RETENCAO + 1))"`);
    expect(Number(retencao)).toBeGreaterThan(0);
  });

  test('os dois scripts leem DATABASE_URL do .env pelo mesmo bloco', () => {
    const doBackup = BLOCO_QUE_LE_O_ENV.exec(backup)?.[0];

    const daRestauracao = BLOCO_QUE_LE_O_ENV.exec(restauracao)?.[0];

    expect(doBackup).toBeDefined();
    expect(daRestauracao).toBe(doBackup);
  });

  test('os dois scripts escolhem o cliente compatível pelas mesmas funções', () => {
    const compartilhadas = ['versao_maior', 'versao_do_servidor', 'url_de_dentro'];

    const doBackup = compartilhadas.map((nome) => definicaoDaFuncao(backup, nome));
    const daRestauracao = compartilhadas.map((nome) => definicaoDaFuncao(restauracao, nome));

    expect(daRestauracao).toEqual(doBackup);
    expect(capturar(restauracao, SERVICO_DO_BANCO, 'SERVICO_DO_BANCO')).toBe(
      capturar(backup, SERVICO_DO_BANCO, 'SERVICO_DO_BANCO'),
    );
  });

  test('a restauração sai com código próprio para cada falha que um agendador precisa ver', () => {
    const codigos = [...restauracao.matchAll(/^\s*exit (\d+)$/gm)].map((achado) => achado[1]);

    expect(new Set(codigos)).toEqual(new Set(['1', '2', '3']));
  });

  test('os dois scripts param no primeiro erro e não expandem variável não definida', () => {
    const modo = [backup, restauracao].map((script) => script.includes('\nset -euo pipefail\n'));

    expect(modo).toEqual([true, true]);
  });
});

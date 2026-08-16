import { SQL } from 'bun';
import { join, resolve } from 'node:path';
import { config } from '../src/shared/config/index';
import { CHAVES_DE_LOCK, MIGRACOES } from '../src/shared/constants';
import { ARGUMENTOS, MENSAGENS_DA_MIGRACAO as MENSAGENS } from './constantes';

const DIRETORIO_DE_MIGRACOES = resolve(import.meta.dir, '..', MIGRACOES.diretorio);

type Argumentos = { readonly somenteStatus: boolean; readonly url: string };

function lerArgumentos(argv: readonly string[]): Argumentos {
  const restantes = [...argv];
  let somenteStatus = false;
  let url = config.databaseUrl;

  while (restantes.length > 0) {
    const argumento = restantes.shift();
    if (argumento === ARGUMENTOS.status) {
      somenteStatus = true;
      continue;
    }
    if (argumento === ARGUMENTOS.url) {
      const valor = restantes.shift();
      if (valor === undefined || valor.startsWith(ARGUMENTOS.prefixo)) {
        throw new Error(MENSAGENS.urlSemValor);
      }
      url = valor;
      continue;
    }
    throw new Error(MENSAGENS.argumentoDesconhecido(String(argumento)));
  }

  return { somenteStatus, url };
}

function destinoLegivel(url: string): string {
  const endereco = new URL(url);
  return `${endereco.host}${endereco.pathname}`;
}

async function arquivosDeMigracao(): Promise<string[]> {
  const nomes: string[] = [];
  for await (const nome of new Bun.Glob(MIGRACOES.glob).scan({ cwd: DIRETORIO_DE_MIGRACOES })) {
    nomes.push(nome);
  }
  return nomes.sort();
}

async function garantirTabelaDeControle(sql: SQL): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      versao      text PRIMARY KEY,
      aplicada_em timestamptz NOT NULL DEFAULT now()
    )
  `;
}

async function versoesAplicadas(sql: SQL): Promise<Map<string, Date>> {
  const controle: { presente: boolean }[] =
    await sql`SELECT to_regclass('schema_migrations') IS NOT NULL AS presente`;
  if (controle[0]?.presente !== true) {
    return new Map();
  }
  const linhas: { versao: string; aplicada_em: Date }[] =
    await sql`SELECT versao, aplicada_em FROM schema_migrations ORDER BY versao`;
  return new Map(linhas.map((linha) => [linha.versao, linha.aplicada_em]));
}

async function aplicar(sql: SQL, versao: string): Promise<void> {
  const conteudo = await Bun.file(join(DIRETORIO_DE_MIGRACOES, versao)).text();
  await sql.begin(async (tx) => {
    await tx.unsafe(conteudo);
    await tx`INSERT INTO schema_migrations (versao) VALUES (${versao})`;
  });
}

function imprimirStatus(arquivos: readonly string[], aplicadas: ReadonlyMap<string, Date>): void {
  let pendentes = 0;
  for (const versao of arquivos) {
    const aplicadaEm = aplicadas.get(versao);
    if (aplicadaEm === undefined) {
      pendentes += 1;
      console.log(MENSAGENS.status.pendente(versao));
      continue;
    }
    console.log(MENSAGENS.status.aplicada(versao, aplicadaEm.toISOString()));
  }
  for (const versao of aplicadas.keys()) {
    if (!arquivos.includes(versao)) {
      console.log(MENSAGENS.status.semArquivo(versao));
    }
  }
  console.log(MENSAGENS.status.resumo(arquivos.length - pendentes, pendentes));
}

async function aplicarPendentes(sql: SQL, arquivos: readonly string[]): Promise<void> {
  const aplicadas = await versoesAplicadas(sql);
  const pendentes = arquivos.filter((versao) => !aplicadas.has(versao));

  if (pendentes.length === 0) {
    console.log(MENSAGENS.aplicacao.nadaAAplicar);
    return;
  }

  for (const versao of pendentes) {
    const inicio = Date.now();
    await aplicar(sql, versao);
    console.log(MENSAGENS.aplicacao.aplicada(versao, Date.now() - inicio));
  }
  console.log(
    pendentes.length === 1 ? MENSAGENS.aplicacao.uma : MENSAGENS.aplicacao.varias(pendentes.length),
  );
}

async function executar(): Promise<void> {
  const argumentos = lerArgumentos(Bun.argv.slice(ARGUMENTOS.primeiroDoUsuario));
  const sql = new SQL({ url: argumentos.url, max: 1 });

  try {
    console.log(MENSAGENS.destino(destinoLegivel(argumentos.url)));
    const arquivos = await arquivosDeMigracao();

    if (argumentos.somenteStatus) {
      imprimirStatus(arquivos, await versoesAplicadas(sql));
      return;
    }

    await sql`SELECT pg_advisory_lock(${CHAVES_DE_LOCK.migracao})`;
    try {
      await garantirTabelaDeControle(sql);
      await aplicarPendentes(sql, arquivos);
    } finally {
      await sql`SELECT pg_advisory_unlock(${CHAVES_DE_LOCK.migracao})`;
    }
  } finally {
    await sql.close();
  }
}

try {
  await executar();
} catch (erro) {
  console.error(MENSAGENS.falha(erro instanceof Error ? erro.message : String(erro)));
  process.exitCode = 1;
}

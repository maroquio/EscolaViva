import { SQL } from 'bun';
import { join, resolve } from 'node:path';
import { config } from '../src/shared/config/index';
import { CHAVES_DE_LOCK, MIGRACOES } from '../src/shared/constantes';

/**
 * O diretório e o glob vêm de `shared/constantes` porque a migração não é a única coisa que
 * precisa saber onde os `.sql` moram; o resto deste arquivo — bandeiras de linha de comando e
 * texto de console — tem exatamente um consumidor, este script, e por isso fica aqui.
 */
const DIRETORIO_DE_MIGRACOES = resolve(import.meta.dir, '..', MIGRACOES.diretorio);

const ARGUMENTOS = {
  status: '--status',
  url: '--url',
  /** Prefixo que distingue uma bandeira de um valor: `--url --status` é URL faltando, não URL. */
  prefixo: '--',
  /** `Bun.argv` abre com o runtime e o caminho do script; o que o usuário digitou vem depois. */
  primeiroDoUsuario: 2,
} as const;

/**
 * O `  aplicada  ` do status e o `  aplicada  ` do progresso têm o mesmo prefixo por coincidência
 * e são duas mensagens: uma lista o que já estava no banco, com o instante em que entrou; a outra
 * narra o que este processo acabou de aplicar, com quanto tempo levou. Quem for reformatar o
 * relatório de `--status` não deve reformatar junto o log de aplicação.
 */
const MENSAGENS = {
  urlSemValor: `${ARGUMENTOS.url} exige a URL de conexão logo em seguida.`,
  argumentoDesconhecido: (argumento: string): string =>
    `Argumento desconhecido: ${argumento}. Use ${ARGUMENTOS.status} e ${ARGUMENTOS.url} <postgres://...>.`,
  destino: (banco: string): string => `Banco: ${banco}`,
  falha: (motivo: string): string => `Falha ao migrar: ${motivo}`,
  status: {
    pendente: (versao: string): string => `  pendente  ${versao}`,
    aplicada: (versao: string, instante: string): string => `  aplicada  ${versao}  (${instante})`,
    semArquivo: (versao: string): string => `  registrada sem arquivo  ${versao}`,
    resumo: (aplicadas: number, pendentes: number): string =>
      `${aplicadas} aplicada(s), ${pendentes} pendente(s).`,
  },
  aplicacao: {
    nadaAAplicar: 'Nada a aplicar: o banco já está na última migração.',
    aplicada: (versao: string, duracaoMs: number): string =>
      `  aplicada  ${versao}  (${duracaoMs} ms)`,
    uma: '1 migração aplicada.',
    varias: (total: number): string => `${total} migrações aplicadas.`,
  },
} as const;

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

/** O console mostra para onde a migração vai, nunca usuário e senha. */
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
  // Banco recém-criado ainda não tem a tabela de controle, e `--status` não escreve nada.
  const controle: { presente: boolean }[] =
    await sql`SELECT to_regclass('schema_migrations') IS NOT NULL AS presente`;
  if (controle[0]?.presente !== true) {
    return new Map();
  }
  const linhas: { versao: string; aplicada_em: Date }[] =
    await sql`SELECT versao, aplicada_em FROM schema_migrations ORDER BY versao`;
  return new Map(linhas.map((linha) => [linha.versao, linha.aplicada_em]));
}

/** Uma transação por arquivo: o DDL e o registro da versão sobem juntos ou não sobem. */
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
  // Lido depois do lock: outro processo pode ter migrado enquanto este esperava.
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
  // Uma conexão só no pool: o advisory lock pertence à sessão, e a sessão é a conexão.
  const sql = new SQL({ url: argumentos.url, max: 1 });

  try {
    console.log(MENSAGENS.destino(destinoLegivel(argumentos.url)));
    const arquivos = await arquivosDeMigracao();

    if (argumentos.somenteStatus) {
      imprimirStatus(arquivos, await versoesAplicadas(sql));
      return;
    }

    // O lock vem antes de qualquer DDL: `CREATE TABLE IF NOT EXISTS` não é seguro contra
    // corrida, e dois processos subindo ao mesmo tempo derrubariam um ao outro.
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

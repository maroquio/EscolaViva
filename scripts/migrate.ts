import { SQL } from 'bun';
import { join, resolve } from 'node:path';
import { config } from '../src/shared/config/index';

/** Chave fixa: todo processo que migrar este banco disputa exatamente esta. */
const CHAVE_DE_LOCK = 4242;
const DIRETORIO_DE_MIGRACOES = resolve(import.meta.dir, '..', 'migrations');

type Argumentos = { readonly somenteStatus: boolean; readonly url: string };

function lerArgumentos(argv: readonly string[]): Argumentos {
  const restantes = [...argv];
  let somenteStatus = false;
  let url = config.databaseUrl;

  while (restantes.length > 0) {
    const argumento = restantes.shift();
    if (argumento === '--status') {
      somenteStatus = true;
      continue;
    }
    if (argumento === '--url') {
      const valor = restantes.shift();
      if (valor === undefined || valor.startsWith('--')) {
        throw new Error('--url exige a URL de conexão logo em seguida.');
      }
      url = valor;
      continue;
    }
    throw new Error(`Argumento desconhecido: ${String(argumento)}. Use --status e --url <postgres://...>.`);
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
  for await (const nome of new Bun.Glob('*.sql').scan({ cwd: DIRETORIO_DE_MIGRACOES })) {
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
      console.log(`  pendente  ${versao}`);
      continue;
    }
    console.log(`  aplicada  ${versao}  (${aplicadaEm.toISOString()})`);
  }
  for (const versao of aplicadas.keys()) {
    if (!arquivos.includes(versao)) {
      console.log(`  registrada sem arquivo  ${versao}`);
    }
  }
  console.log(`${arquivos.length - pendentes} aplicada(s), ${pendentes} pendente(s).`);
}

async function aplicarPendentes(sql: SQL, arquivos: readonly string[]): Promise<void> {
  // Lido depois do lock: outro processo pode ter migrado enquanto este esperava.
  const aplicadas = await versoesAplicadas(sql);
  const pendentes = arquivos.filter((versao) => !aplicadas.has(versao));

  if (pendentes.length === 0) {
    console.log('Nada a aplicar: o banco já está na última migração.');
    return;
  }

  for (const versao of pendentes) {
    const inicio = Date.now();
    await aplicar(sql, versao);
    console.log(`  aplicada  ${versao}  (${Date.now() - inicio} ms)`);
  }
  console.log(pendentes.length === 1 ? '1 migração aplicada.' : `${pendentes.length} migrações aplicadas.`);
}

async function executar(): Promise<void> {
  const argumentos = lerArgumentos(Bun.argv.slice(2));
  // Uma conexão só no pool: o advisory lock pertence à sessão, e a sessão é a conexão.
  const sql = new SQL({ url: argumentos.url, max: 1 });

  try {
    console.log(`Banco: ${destinoLegivel(argumentos.url)}`);
    const arquivos = await arquivosDeMigracao();

    if (argumentos.somenteStatus) {
      imprimirStatus(arquivos, await versoesAplicadas(sql));
      return;
    }

    // O lock vem antes de qualquer DDL: `CREATE TABLE IF NOT EXISTS` não é seguro contra
    // corrida, e dois processos subindo ao mesmo tempo derrubariam um ao outro.
    await sql`SELECT pg_advisory_lock(${CHAVE_DE_LOCK})`;
    try {
      await garantirTabelaDeControle(sql);
      await aplicarPendentes(sql, arquivos);
    } finally {
      await sql`SELECT pg_advisory_unlock(${CHAVE_DE_LOCK})`;
    }
  } finally {
    await sql.close();
  }
}

try {
  await executar();
} catch (erro) {
  console.error(`Falha ao migrar: ${erro instanceof Error ? erro.message : String(erro)}`);
  process.exitCode = 1;
}

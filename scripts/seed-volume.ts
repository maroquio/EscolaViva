import { MATRICULA_ATIVA, TURNOS } from '../src/academico';
import { REDE_ATIVA } from '../src/identidade';
import { config } from '../src/shared/config';
import { AMBIENTE_PRODUCAO, DIAS_DA_SEMANA, LOCALE, TEMPO } from '../src/shared/constantes';
import { encerrar, escrita, type Conexao } from '../src/shared/db';

const SLUG = 'volume';
const REDE = 'Rede de Volume (carga sintética)';
const ALUNOS_PADRAO = 18_000;
const UNIDADES = 55;
const ALUNOS_POR_TURMA = 30;
const DIAS_LETIVOS = 200;
const TAXA_DE_FALTA = 0.06;
const MATRICULAS_POR_LOTE = 1_000;

const ARRANJO_DE_TURNOS = `{${TURNOS.join(',')}}`;

const CALENDARIO = {
  inicio: (ano: number): string => `${ano}-02-01`,
  fim: (ano: number): string => `${ano}-12-15`,
  matricula: (ano: number): string => `${ano}-02-05`,
} as const;

const OPCOES = {
  ano: '--ano',
  alunos: '--alunos',
  sim: '--sim',
  apagar: '--apagar',
} as const;

const INICIO_DOS_ARGUMENTOS = 2;

const COLUNAS = { progresso: 7, tabela: 12, contagem: 12 } as const;

type Argumentos = { ano: number; alunos: number; confirmado: boolean; apagar: boolean };

const agora = (): number => Date.now();
const emSegundos = (desde: number): string => ((agora() - desde) / TEMPO.msPorSegundo).toFixed(1);
const comSeparador = (valor: number): string => valor.toLocaleString(LOCALE);

const MENSAGENS = {
  inteiroPositivo: (rotulo: string): string =>
    `${rotulo} exige um inteiro positivo logo em seguida.`,
  argumentoDesconhecido: (argumento: string): string =>
    `Argumento desconhecido: ${argumento}. Use ${Object.values(OPCOES).join(', ')}.`,
  producaoRecusada: 'APP_ENV=production: carga sintética não entra em banco de produção.',
  semRedeDeCarga: `Não existe rede '${SLUG}'. Nada a apagar.`,
  tabelaApagada: (tabela: string, linhas: number): string => {
    const contagem = comSeparador(linhas).padStart(COLUNAS.contagem);
    return `  ${tabela.padEnd(COLUNAS.tabela)} ${contagem} linhas`;
  },
  redeRemovida: `Rede '${SLUG}' removida.`,
  confirmeApagar:
    `${OPCOES.apagar} remove a rede '${SLUG}' inteira. Confirme com ${OPCOES.sim}. ` +
    'Nada foi apagado.',
  previsao: (linhas: number, ano: number): string =>
    `Vai gravar ~${comSeparador(linhas)} linhas em 'frequencia', ano ${ano}:`,
  dimensoes: (alunos: number): string =>
    `${comSeparador(alunos)} alunos, ${UNIDADES} unidades, ${DIAS_LETIVOS} dias.`,
  confirmeGravar: `Confirme com ${OPCOES.sim}. Nada foi gravado.`,
  anoJaCarregado: (ano: number): string =>
    `O ano ${ano} já foi carregado. Use outro ${OPCOES.ano}, ou recomece com ` +
    `${OPCOES.apagar} ${OPCOES.sim}.`,
  cabecalho: (ano: number, alunos: number): string =>
    `Rede '${SLUG}' · ano ${ano} · ${comSeparador(alunos)} alunos`,
  estruturaPronta: (unidades: number, alunos: number, segundos: string): string =>
    `  ${unidades} unidades e ${comSeparador(alunos)} alunos (${segundos} s)`,
  cenarioPronto: (turmas: number, matriculas: number): string =>
    `  ${turmas} turmas e ${comSeparador(matriculas)} matrículas ativas`,
  progresso: (feitas: number, total: number, linhas: number, segundos: string): string =>
    `  ${String(feitas).padStart(COLUNAS.progresso)}/${total} matrículas` +
    ` · ${comSeparador(linhas)} linhas · ${segundos} s`,
  cargaConcluida: (linhas: number, segundos: string): string =>
    `\n${comSeparador(linhas)} linhas gravadas em ${segundos} s.`,
  totalDaTabela: (linhas: number): string =>
    `'frequencia' tem agora ${comSeparador(linhas)} linhas no total.`,
  analisar: 'Rode ANALYZE frequencia; antes de medir — o planejador precisa da estatística nova.',
  sinalDeMedicao: '\nSinal de medição — as três consultas para anotar à mão uma vez por semana:',
  falha: (detalhe: string): string => `Falha na carga: ${detalhe}`,
} as const;

function lerArgumentos(argv: readonly string[]): Argumentos {
  const restantes = [...argv];
  let ano = new Date().getUTCFullYear();
  let alunos = ALUNOS_PADRAO;
  let confirmado = false;
  let apagar = false;

  const numero = (rotulo: string): number => {
    const bruto = restantes.shift();
    const valor = Number(bruto);
    if (bruto === undefined || !Number.isInteger(valor) || valor <= 0) {
      throw new Error(MENSAGENS.inteiroPositivo(rotulo));
    }
    return valor;
  };

  while (restantes.length > 0) {
    const argumento = restantes.shift();
    if (argumento === OPCOES.ano) ano = numero(OPCOES.ano);
    else if (argumento === OPCOES.alunos) alunos = numero(OPCOES.alunos);
    else if (argumento === OPCOES.sim) confirmado = true;
    else if (argumento === OPCOES.apagar) apagar = true;
    else {
      throw new Error(MENSAGENS.argumentoDesconhecido(String(argumento)));
    }
  }
  return { ano, alunos, confirmado, apagar };
}

async function garantirRede(sql: Conexao): Promise<string> {
  const existente: { id: string }[] = await sql`SELECT id FROM rede WHERE slug = ${SLUG}`;
  const encontrada = existente[0];
  if (encontrada !== undefined) return encontrada.id;
  const id = crypto.randomUUID();
  await sql`
    INSERT INTO rede (id, nome, slug, status)
    VALUES (${id}, ${REDE}, ${SLUG}, ${REDE_ATIVA})`;
  return id;
}

async function garantirUnidades(sql: Conexao, redeId: string): Promise<number> {
  const contagem: { total: number }[] =
    await sql`SELECT count(*)::int AS total FROM unidade WHERE rede_id = ${redeId}`;
  const existentes = contagem[0]?.total ?? 0;
  if (existentes >= UNIDADES) return existentes;
  await sql`
    INSERT INTO unidade (id, rede_id, nome)
    SELECT gen_random_uuid(), ${redeId}, 'Unidade ' || lpad(i::text, 3, '0')
      FROM generate_series(${existentes + 1}, ${UNIDADES}) AS i`;
  return UNIDADES;
}

async function garantirAlunos(sql: Conexao, redeId: string, alunos: number): Promise<void> {
  const contagem: { total: number }[] =
    await sql`SELECT count(*)::int AS total FROM aluno WHERE rede_id = ${redeId}`;
  const existentes = contagem[0]?.total ?? 0;
  if (existentes >= alunos) return;
  await sql`
    INSERT INTO aluno (id, rede_id, nome, data_nascimento)
    SELECT gen_random_uuid(), ${redeId}, 'Aluno de carga ' || lpad(i::text, 6, '0'),
           (current_date - ((3650 + (i % 2555)) || ' days')::interval)::date
      FROM generate_series(${existentes + 1}, ${alunos}) AS i`;
}

type Cenario = { anoLetivoId: string; turmas: number; matriculas: number };

async function montarAnoLetivo(
  sql: Conexao, redeId: string, ano: number, alunos: number,
): Promise<Cenario> {
  const anoLetivoId = crypto.randomUUID();
  const turmas = Math.ceil(alunos / ALUNOS_POR_TURMA);
  await sql`
    INSERT INTO ano_letivo (id, rede_id, ano, data_inicio, data_fim)
    VALUES (${anoLetivoId}, ${redeId}, ${ano},
            ${CALENDARIO.inicio(ano)}, ${CALENDARIO.fim(ano)})`;
  await sql`
    INSERT INTO turma (id, rede_id, unidade_id, ano_letivo_id, nome, serie, turno)
    SELECT gen_random_uuid(), ${redeId}, u.id, ${anoLetivoId},
           'Turma ' || lpad(i::text, 4, '0'), ((i % 9) + 1) || 'º ano',
           (${ARRANJO_DE_TURNOS}::text[])[(i % ${TURNOS.length}) + 1]
      FROM generate_series(1, ${turmas}) AS i
      JOIN LATERAL (
        SELECT id FROM unidade WHERE rede_id = ${redeId} ORDER BY nome
         OFFSET (i - 1) % ${UNIDADES} LIMIT 1
      ) AS u ON true`;
  await sql`
    INSERT INTO matricula (id, rede_id, aluno_id, turma_id, ano_letivo_id, data_matricula, situacao)
    SELECT gen_random_uuid(), ${redeId}, a.aluno_id, t.id, ${anoLetivoId},
           ${CALENDARIO.matricula(ano)}::date, ${MATRICULA_ATIVA}
      FROM (SELECT aluno_id, posicao FROM (
              SELECT id AS aluno_id, row_number() OVER (ORDER BY nome) AS posicao
                FROM aluno WHERE rede_id = ${redeId}) AS numerados
             WHERE posicao <= ${alunos}) AS a
      JOIN (SELECT id, row_number() OVER (ORDER BY nome) AS posicao
              FROM turma WHERE rede_id = ${redeId} AND ano_letivo_id = ${anoLetivoId}) AS t
        ON t.posicao = ((a.posicao - 1) / ${ALUNOS_POR_TURMA}) + 1`;
  const total: { total: number }[] = await sql`
    SELECT count(*)::int AS total FROM matricula
     WHERE rede_id = ${redeId} AND ano_letivo_id = ${anoLetivoId}`;
  return { anoLetivoId, turmas, matriculas: total[0]?.total ?? 0 };
}

async function preencherFrequencia(
  sql: Conexao, redeId: string, cenario: Cenario, ano: number,
): Promise<number> {
  const inicio = agora();
  let gravadas = 0;
  for (let deslocamento = 0; deslocamento < cenario.matriculas; deslocamento += MATRICULAS_POR_LOTE) {
    const lote: { count: number } = await sql`
      WITH dias AS (
        SELECT d::date AS data
          FROM generate_series(${CALENDARIO.inicio(ano)}::date,
                               ${CALENDARIO.fim(ano)}::date, '1 day') AS d
         WHERE extract(isodow FROM d) < ${DIAS_DA_SEMANA.primeiroDiaDoFimDeSemanaIso}
         ORDER BY d
         LIMIT ${DIAS_LETIVOS}
      ), lote AS (
        SELECT id FROM matricula
         WHERE rede_id = ${redeId} AND ano_letivo_id = ${cenario.anoLetivoId}
         ORDER BY id OFFSET ${deslocamento} LIMIT ${MATRICULAS_POR_LOTE}
      )
      INSERT INTO frequencia (id, rede_id, matricula_id, data, presente)
      SELECT gen_random_uuid(), ${redeId}, lote.id, dias.data, random() >= ${TAXA_DE_FALTA}
        FROM lote CROSS JOIN dias`;
    gravadas += lote.count;
    const progresso = Math.min(deslocamento + MATRICULAS_POR_LOTE, cenario.matriculas);
    console.log(MENSAGENS.progresso(progresso, cenario.matriculas, gravadas, emSegundos(inicio)));
  }
  return gravadas;
}

const MEDICAO = `
-- 1. Maior tabela: a contagem que o documento manda anotar (~3,6 milhões por ano letivo).
SELECT count(*) AS linhas_de_frequencia FROM frequencia;

-- 2. p95 aproximado por consulta. pg_stat_statements NÃO guarda percentil: 'media + 2 desvios'
--    é a aproximação usada, e 'max' é o teto real observado. Rode uma vez, na primeira semana:
--      CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
--    e zere a janela com SELECT pg_stat_statements_reset(); antes de cada medição semanal.
SELECT substring(query, 1, 70)                              AS consulta,
       calls                                                AS chamadas,
       round(mean_exec_time::numeric, 1)                    AS media_ms,
       round((mean_exec_time + 2 * stddev_exec_time)::numeric, 1) AS p95_aprox_ms,
       round(max_exec_time::numeric, 1)                     AS pior_ms
  FROM pg_stat_statements
 WHERE query ILIKE '%nota%' OR query ILIKE '%frequencia%'
 ORDER BY mean_exec_time DESC
 LIMIT 10;

-- 3. O que o banco está fazendo agora: conexões por estado e a consulta mais antiga em curso.
--    CPU do container: docker stats --no-stream $(docker compose ps -q banco)
SELECT state,
       count(*)                             AS conexoes,
       max(now() - query_start)             AS mais_antiga
  FROM pg_stat_activity
 WHERE datname = current_database()
 GROUP BY state
 ORDER BY conexoes DESC;
`;

function instruirMedicao(): void {
  console.log(MENSAGENS.sinalDeMedicao);
  console.log(MEDICAO);
}

const APAGAR_EM_ORDEM = ['frequencia', 'nota', 'matricula', 'turma', 'ano_letivo', 'aluno', 'unidade'];

async function apagarRedeDeCarga(sql: Conexao): Promise<void> {
  const existente: { id: string }[] = await sql`SELECT id FROM rede WHERE slug = ${SLUG}`;
  const rede = existente[0];
  if (rede === undefined) {
    console.log(MENSAGENS.semRedeDeCarga);
    return;
  }
  for (const tabela of APAGAR_EM_ORDEM) {
    const apagadas: { count: number } =
      await sql`DELETE FROM ${sql(tabela)} WHERE rede_id = ${rede.id}`;
    console.log(MENSAGENS.tabelaApagada(tabela, apagadas.count));
  }
  await sql`DELETE FROM rede WHERE id = ${rede.id}`;
  console.log(MENSAGENS.redeRemovida);
}

async function carregar(): Promise<void> {
  if (config.ambiente === AMBIENTE_PRODUCAO) {
    throw new Error(MENSAGENS.producaoRecusada);
  }
  const { ano, alunos, confirmado, apagar } = lerArgumentos(Bun.argv.slice(INICIO_DOS_ARGUMENTOS));
  if (apagar) {
    if (!confirmado) {
      console.log(MENSAGENS.confirmeApagar);
      return;
    }
    await apagarRedeDeCarga(escrita());
    return;
  }

  const linhasPrevistas = alunos * DIAS_LETIVOS;
  if (!confirmado) {
    console.log(MENSAGENS.previsao(linhasPrevistas, ano));
    console.log(MENSAGENS.dimensoes(alunos));
    console.log(MENSAGENS.confirmeGravar);
    return;
  }

  const sql = escrita();
  const inicio = agora();
  const redeId = await garantirRede(sql);
  const jaCarregado: { total: number }[] = await sql`
    SELECT count(*)::int AS total FROM ano_letivo WHERE rede_id = ${redeId} AND ano = ${ano}`;
  if ((jaCarregado[0]?.total ?? 0) > 0) {
    throw new Error(MENSAGENS.anoJaCarregado(ano));
  }

  console.log(MENSAGENS.cabecalho(ano, alunos));
  const unidades = await garantirUnidades(sql, redeId);
  await garantirAlunos(sql, redeId, alunos);
  console.log(MENSAGENS.estruturaPronta(unidades, alunos, emSegundos(inicio)));
  const cenario = await montarAnoLetivo(sql, redeId, ano, alunos);
  console.log(MENSAGENS.cenarioPronto(cenario.turmas, cenario.matriculas));
  const linhas = await preencherFrequencia(sql, redeId, cenario, ano);

  const total: { total: number }[] = await sql`SELECT count(*)::int AS total FROM frequencia`;
  console.log(MENSAGENS.cargaConcluida(linhas, emSegundos(inicio)));
  console.log(MENSAGENS.totalDaTabela(total[0]?.total ?? 0));
  console.log(MENSAGENS.analisar);
  instruirMedicao();
}

try {
  await carregar();
} catch (erro) {
  console.error(MENSAGENS.falha(erro instanceof Error ? erro.message : String(erro)));
  process.exitCode = 1;
} finally {
  await encerrar();
}

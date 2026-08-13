/*
 * Dados de demonstração da aula: uma rede pequena, completa e previsível. É idempotente por
 * apagar e recriar — a rede de slug `demo` sai inteira e volta igual, então rodar duas vezes
 * deixa o banco no mesmo estado da primeira. O sorteio tem semente fixa: os nomes, as notas e
 * as faltas são os mesmos em toda máquina, e a captura de tela do professor continua batendo
 * com o que o aluno vê. O bimestre 3 nasce incompleto de propósito — fechá-lo falha, e é assim
 * que a aula demonstra a validação de `fecharBimestre` sem estragar dado na hora.
 */

import { config } from '../src/shared/config';
import { encerrar, escrita, unidadeDeTrabalho, type Conexao } from '../src/shared/db';
import { idGeneratorUuid } from '../src/shared/ports';

const SLUG = 'demo';
const REDE = 'Rede Municipal de Demonstração';
const SENHA = 'escolaviva';
// `.test` é reservado pela RFC 2606: nenhum endereço daqui existe fora desta base.
const DOMINIO = 'escolaviva.test';
const ALUNOS_POR_TURMA = 20;
const DIAS_LETIVOS = 60;
const TAXA_DE_FALTA = 0.06;
const TAXA_DE_JUSTIFICATIVA = 0.4;
const TAXA_DE_LEITURA = 0.12;
const LOTE = 2000;
const DIA_EM_MS = 86_400_000;

type Linha = Record<string, string | number | boolean | null>;
type Registro = { id: string; nome: string };
type Turma = { id: string; unidadeIndice: number; nome: string; turno: string; idade: number };

const novoId = (): string => idGeneratorUuid.novo();

/** Sorteio determinístico (mulberry32): mesma semente, mesma turma, mesmas notas, toda vez. */
function sorteador(semente: number): () => number {
  let estado = semente >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const aleatorio = sorteador(20260201);
const entre = (min: number, max: number): number => min + Math.floor(aleatorio() * (max - min + 1));

function umDe<T>(itens: readonly T[]): T {
  const escolhido = itens[entre(0, itens.length - 1)];
  if (escolhido === undefined) throw new Error('sorteio sobre lista vazia');
  return escolhido;
}

const PRIMEIROS = [
  'Ana Luíza', 'Beatriz', 'Camila', 'Davi', 'Eduarda', 'Enzo', 'Fernanda', 'Gabriel', 'Heloísa',
  'Igor', 'Isabela', 'João Pedro', 'Júlia', 'Kauã', 'Larissa', 'Lucas', 'Manuela', 'Matheus',
  'Nicolas', 'Olívia', 'Pedro Henrique', 'Rafaela', 'Samuel', 'Sofia', 'Valentina', 'Yasmin',
];
const SOBRENOMES = [
  'Almeida', 'Barbosa', 'Cardoso', 'Carvalho', 'Costa', 'Dias', 'Ferreira', 'Gomes', 'Lima',
  'Machado', 'Martins', 'Mendes', 'Nascimento', 'Oliveira', 'Pereira', 'Pinheiro', 'Ribeiro',
  'Rocha', 'Rodrigues', 'Santos', 'Silva', 'Souza', 'Teixeira', 'Vieira',
];
const PARENTESCOS = ['mãe', 'pai', 'avó', 'avô', 'tia', 'padrasto'];
const JUSTIFICATIVAS = [
  'Atestado médico entregue na secretaria.', 'Consulta odontológica no contraturno.',
  'Viagem em família comunicada com antecedência.', 'Atestado de exame laboratorial.',
];

const nomeDePessoa = (): string => `${umDe(PRIMEIROS)} ${umDe(SOBRENOMES)} ${umDe(SOBRENOMES)}`;

/** Primeiro nome, último sobrenome e o índice: `usuario (rede_id, email)` é único e o nome repete. */
function emailDe(nome: string, indice: number): string {
  const partes = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]+/g, '')
    .split(' ');
  return `${partes[0] ?? 'pessoa'}.${partes[partes.length - 1] ?? 'demo'}${indice}@${DOMINIO}`;
}

const DISCIPLINAS = ['Português', 'Matemática', 'História', 'Geografia', 'Ciências', 'Arte'];
const TURMAS: readonly Omit<Turma, 'id'>[] = [
  { unidadeIndice: 0, nome: '6º A', turno: 'matutino', idade: 11 },
  { unidadeIndice: 0, nome: '7º A', turno: 'matutino', idade: 12 },
  { unidadeIndice: 0, nome: '8º A', turno: 'vespertino', idade: 13 },
  { unidadeIndice: 1, nome: '6º B', turno: 'vespertino', idade: 11 },
  { unidadeIndice: 1, nome: '9º A', turno: 'matutino', idade: 14 },
  { unidadeIndice: 1, nome: '9º B', turno: 'integral', idade: 14 },
];

/** Um `INSERT` por lote: 7 mil linhas de frequência não podem virar 7 mil idas ao banco. */
async function inserir(sql: Conexao, tabela: string, linhas: readonly Linha[]): Promise<void> {
  for (let inicio = 0; inicio < linhas.length; inicio += LOTE) {
    await sql`INSERT INTO ${sql(tabela)} ${sql(linhas.slice(inicio, inicio + LOTE))}`;
  }
}

// Ordem de remoção: filha antes de mãe, sempre. `requisicao_idempotente` sai primeiro porque é
// tabela de plataforma — não tem `rede_id` e aponta para `usuario`.
const APAGAR_EM_ORDEM = [
  'comunicado_destinatario', 'comunicado', 'frequencia', 'nota', 'fechamento_bimestre',
  'matricula', 'aluno_responsavel', 'turma_disciplina', 'turma', 'disciplina', 'ano_letivo',
  'sessao', 'papel_usuario', 'usuario', 'responsavel', 'aluno', 'unidade',
];

async function apagarRedeDeDemonstracao(sql: Conexao, redeId: string): Promise<void> {
  await sql`
    DELETE FROM requisicao_idempotente
     WHERE usuario_id IN (SELECT id FROM usuario WHERE rede_id = ${redeId})`;
  for (const tabela of APAGAR_EM_ORDEM) {
    await sql`DELETE FROM ${sql(tabela)} WHERE rede_id = ${redeId}`;
  }
  await sql`DELETE FROM rede WHERE id = ${redeId}`;
}

type Estrutura = {
  redeId: string; unidades: Registro[]; anoLetivoId: string;
  ano: number; disciplinas: Registro[]; turmas: Turma[];
};

async function criarEstrutura(sql: Conexao, ano: number): Promise<Estrutura> {
  const redeId = novoId();
  const anoLetivoId = novoId();
  const unidades = ['Escola Central', 'Escola Bairro Novo'].map((nome) => ({ id: novoId(), nome }));
  const disciplinas = DISCIPLINAS.map((nome) => ({ id: novoId(), nome }));
  const turmas = TURMAS.map((turma) => ({ ...turma, id: novoId() }));

  await sql`INSERT INTO rede (id, nome, slug, status)
            VALUES (${redeId}, ${REDE}, ${SLUG}, 'ativa')`;
  await inserir(sql, 'unidade', unidades.map((u) => ({ id: u.id, rede_id: redeId, nome: u.nome })));
  await sql`INSERT INTO ano_letivo (id, rede_id, ano, data_inicio, data_fim)
            VALUES (${anoLetivoId}, ${redeId}, ${ano}, ${`${ano}-02-01`}, ${`${ano}-12-15`})`;
  await inserir(sql, 'disciplina', disciplinas.map((d) => ({ id: d.id, rede_id: redeId, nome: d.nome })));
  await inserir(sql, 'turma', turmas.map((turma) => ({
    id: turma.id, rede_id: redeId, unidade_id: unidades[turma.unidadeIndice]?.id ?? '',
    ano_letivo_id: anoLetivoId, nome: turma.nome, turno: turma.turno,
    serie: `${turma.nome.slice(0, 2)} ano`,
  })));
  return { redeId, unidades, anoLetivoId, ano, disciplinas, turmas };
}

type Equipe = {
  credenciais: { email: string; papel: string; onde: string }[];
  secretarias: string[]; professores: string[];
};

/** Admin, secretaria e professores. Todos com a mesma senha — é base de aula, e o README a publica. */
async function criarEquipe(sql: Conexao, e: Estrutura, hash: string): Promise<Equipe> {
  const usuarios: Linha[] = [];
  const papeis: Linha[] = [];
  const credenciais: Equipe['credenciais'] = [];
  const secretarias: string[] = [];
  const professores: string[] = [];
  const registrar = (nome: string, email: string, papel: string, unidades: Registro[]): string => {
    const id = novoId();
    usuarios.push({ id, rede_id: e.redeId, email, senha_hash: hash, nome, responsavel_id: null });
    for (const unidade of unidades) {
      papeis.push({ rede_id: e.redeId, usuario_id: id, unidade_id: unidade.id, papel });
    }
    credenciais.push({ email, papel, onde: unidades.map((u) => u.nome).join(' + ') });
    return id;
  };
  // O admin da rede responde pelas duas unidades: `papel_usuario` só existe por unidade.
  registrar('Marina Alves Correia', `admin@${DOMINIO}`, 'admin_rede', e.unidades);
  e.unidades.forEach((unidade, i) => {
    const alvo = [unidade];
    secretarias.push(registrar(nomeDePessoa(), `secretaria${i + 1}@${DOMINIO}`, 'secretaria', alvo));
  });
  // Três professores por unidade, cada um com duas disciplinas nas três turmas de lá.
  for (let p = 0; p < 6; p += 1) {
    const unidade = e.unidades[Math.floor(p / 3)];
    if (unidade === undefined) throw new Error('unidade do professor não encontrada');
    professores.push(registrar(nomeDePessoa(), `professor${p + 1}@${DOMINIO}`, 'professor', [unidade]));
  }
  await inserir(sql, 'usuario', usuarios);
  await inserir(sql, 'papel_usuario', papeis);
  return { credenciais, secretarias, professores };
}

type Povoamento = {
  matriculas: { id: string; turmaIndice: number }[];
  responsaveisPorUnidade: string[][]; emails: string[];
};

/** Aluno, responsáveis, o usuário de cada responsável e a matrícula, tudo na mesma transação. */
async function criarPessoas(sql: Conexao, e: Estrutura, hash: string): Promise<Povoamento> {
  const alunos: Linha[] = [];
  const responsaveis: Linha[] = [];
  const vinculos: Linha[] = [];
  const usuarios: Linha[] = [];
  const papeis: Linha[] = [];
  const linhasDeMatricula: Linha[] = [];
  const matriculas: { id: string; turmaIndice: number }[] = [];
  const responsaveisPorUnidade: string[][] = e.unidades.map(() => []);
  const emails: string[] = [];
  let indice = 0;
  e.turmas.forEach((turma, turmaIndice) => {
    const unidade = e.unidades[turma.unidadeIndice];
    if (unidade === undefined) throw new Error('unidade da turma não encontrada');
    for (let n = 0; n < ALUNOS_POR_TURMA; n += 1) {
      indice += 1;
      const alunoId = novoId();
      const mes = String(entre(1, 12)).padStart(2, '0');
      const dia = String(entre(1, 28)).padStart(2, '0');
      const nascimento = `${e.ano - turma.idade}-${mes}-${dia}`;
      alunos.push({
        id: alunoId, rede_id: e.redeId, nome: nomeDePessoa(), data_nascimento: nascimento,
      });
      const quantosResponsaveis = aleatorio() < 0.65 ? 2 : 1;
      for (let r = 0; r < quantosResponsaveis; r += 1) {
        const respId = novoId();
        const usuarioId = novoId();
        const nome = nomeDePessoa();
        const email = emailDe(nome, indice * 10 + r);
        const telefone = `(27) 9${entre(1000, 9999)}-${entre(1000, 9999)}`;
        responsaveis.push({ id: respId, rede_id: e.redeId, nome, email, telefone });
        // Exatamente um responsável por aluno responde pelo financeiro: é quem receberá a
        // cobrança quando o Estágio 02 existir.
        vinculos.push({
          rede_id: e.redeId, aluno_id: alunoId, responsavel_id: respId,
          parentesco: umDe(PARENTESCOS), financeiro: r === 0,
        });
        usuarios.push({
          id: usuarioId, rede_id: e.redeId, email, senha_hash: hash, nome, responsavel_id: respId,
        });
        papeis.push({
          rede_id: e.redeId, usuario_id: usuarioId, unidade_id: unidade.id, papel: 'responsavel',
        });
        responsaveisPorUnidade[turma.unidadeIndice]?.push(respId);
        emails.push(email);
      }
      const matriculaId = novoId();
      matriculas.push({ id: matriculaId, turmaIndice });
      linhasDeMatricula.push({
        id: matriculaId, rede_id: e.redeId, aluno_id: alunoId, turma_id: turma.id,
        ano_letivo_id: e.anoLetivoId, data_matricula: `${e.ano}-02-05`, situacao: 'ativa',
      });
    }
  });
  await inserir(sql, 'aluno', alunos);
  await inserir(sql, 'responsavel', responsaveis);
  await inserir(sql, 'aluno_responsavel', vinculos);
  await inserir(sql, 'usuario', usuarios);
  await inserir(sql, 'papel_usuario', papeis);
  await inserir(sql, 'matricula', linhasDeMatricula);
  return { matriculas, responsaveisPorUnidade, emails };
}

/** As 36 alocações: seis disciplinas em cada uma das seis turmas. */
async function alocar(sql: Conexao, e: Estrutura, professores: string[]): Promise<string[][]> {
  const linhas: Linha[] = [];
  const porTurma: string[][] = e.turmas.map(() => []);
  e.turmas.forEach((turma, t) => {
    e.disciplinas.forEach((disciplina, d) => {
      const professor = professores[turma.unidadeIndice * 3 + Math.floor(d / 2)];
      if (professor === undefined) throw new Error('professor da disciplina não encontrado');
      const id = novoId();
      porTurma[t]?.push(id);
      linhas.push({
        id, rede_id: e.redeId, turma_id: turma.id,
        disciplina_id: disciplina.id, professor_usuario_id: professor,
      });
    });
  });
  await inserir(sql, 'turma_disciplina', linhas);
  return porTurma;
}

/**
 * Bimestres 1 e 2 completos; o 3 sai faltando de propósito — duas disciplinas sem lançamento
 * nenhum e uma com um quarto dos alunos em branco. Fechar o bimestre 3 recusa e lista as
 * pendências: é a demonstração da regra, e não um dado esquecido.
 */
async function lancarNotas(
  sql: Conexao, e: Estrutura, povoado: Povoamento, alocacoes: string[][], professores: string[],
): Promise<void> {
  const linhas: Linha[] = [];
  const bimestresDe = (d: number): number[] => {
    if (d < 3) return [1, 2, 3];
    if (d === 3) return aleatorio() < 0.75 ? [1, 2, 3] : [1, 2];
    return [1, 2];
  };
  povoado.matriculas.forEach((matricula) => {
    const turma = e.turmas[matricula.turmaIndice];
    const lancador = professores[(turma?.unidadeIndice ?? 0) * 3] ?? '';
    (alocacoes[matricula.turmaIndice] ?? []).forEach((turmaDisciplinaId, d) => {
      const bimestres = bimestresDe(d);
      for (const bimestre of bimestres) {
        linhas.push({
          id: novoId(), rede_id: e.redeId, matricula_id: matricula.id, lancada_por: lancador,
          turma_disciplina_id: turmaDisciplinaId, bimestre, valor: entre(8, 20) / 2,
        });
      }
    });
  });
  await inserir(sql, 'nota', linhas);
}

/** Os dias letivos para trás a partir de hoje, pulando fim de semana. */
function diasLetivos(quantidade: number): string[] {
  const dias: string[] = [];
  const cursor = new Date();
  while (dias.length < quantidade) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    const semana = cursor.getUTCDay();
    if (semana !== 0 && semana !== 6) dias.push(cursor.toISOString().slice(0, 10));
  }
  return dias.reverse();
}

async function registrarFrequencia(sql: Conexao, e: Estrutura, povoado: Povoamento): Promise<void> {
  const dias = diasLetivos(DIAS_LETIVOS);
  const linhas: Linha[] = [];
  for (const matricula of povoado.matriculas) {
    for (const data of dias) {
      const presente = aleatorio() >= TAXA_DE_FALTA;
      const justificar = !presente && aleatorio() < TAXA_DE_JUSTIFICATIVA;
      linhas.push({
        id: novoId(), rede_id: e.redeId, matricula_id: matricula.id, data, presente,
        justificativa: justificar ? umDe(JUSTIFICATIVAS) : null,
      });
    }
  }
  await inserir(sql, 'frequencia', linhas);
}

const COMUNICADOS = [
  { titulo: 'Reunião de pais e mestres do 2º bimestre', dias: 34 },
  { titulo: 'Calendário da semana de provas', dias: 21 },
  { titulo: 'Campanha de agasalho — entrega na secretaria', dias: 12 },
  { titulo: 'Alteração no horário de entrada às sextas-feiras', dias: 4 },
];

/*
 * Só 12 % dos destinatários abrem o mural. O número é a instrumentação da dor do Estágio 04:
 * enquanto ele não existe, "ninguém lê o mural" é opinião de corredor.
 */
async function publicarComunicados(
  sql: Conexao, e: Estrutura, povoado: Povoamento, equipe: Equipe,
): Promise<void> {
  const comunicados: Linha[] = [];
  const destinatarios: Linha[] = [];
  COMUNICADOS.forEach((comunicado, i) => {
    const unidadeIndice = i % 2;
    const unidade = e.unidades[unidadeIndice];
    const autor = equipe.secretarias[unidadeIndice];
    if (unidade === undefined || autor === undefined) {
      throw new Error('unidade ou autor do comunicado não encontrado');
    }
    const id = novoId();
    comunicados.push({
      id, rede_id: e.redeId, unidade_id: unidade.id, titulo: comunicado.titulo,
      corpo: `${comunicado.titulo}. A equipe da ${unidade.nome} pede a leitura atenta`
        + ' e a confirmação no portal.',
      autor_usuario_id: autor,
      publicado_em: new Date(Date.now() - comunicado.dias * DIA_EM_MS).toISOString(),
    });
    // Contadas, não sorteadas: a taxa é o número da Seção 5 do documento e não pode variar de
    // execução para execução por azar de moeda. O corte espalha as leituras pela lista inteira.
    const daUnidade = povoado.responsaveisPorUnidade[unidadeIndice] ?? [];
    const quantosLeram = Math.round(daUnidade.length * TAXA_DE_LEITURA);
    const acumulado = (ate: number): number => Math.floor((ate * quantosLeram) / daUnidade.length);
    daUnidade.forEach((responsavelId, posicao) => {
      const lido = acumulado(posicao) < acumulado(posicao + 1);
      const quando = new Date(Date.now() - entre(1, comunicado.dias) * DIA_EM_MS);
      destinatarios.push({
        rede_id: e.redeId, comunicado_id: id, responsavel_id: responsavelId,
        lido_em: lido ? quando.toISOString() : null,
      });
    });
  });
  await inserir(sql, 'comunicado', comunicados);
  await inserir(sql, 'comunicado_destinatario', destinatarios);
}

// `fechamento_bimestre` aparece zerado de propósito: nenhum bimestre chega fechado, e é o
// professor quem fecha o 1 na tela para ver a operação passar antes de o 3 recusar.
const TABELAS_DO_RESUMO = [
  'unidade', 'usuario', 'papel_usuario', 'ano_letivo', 'disciplina', 'turma', 'turma_disciplina',
  'aluno', 'responsavel', 'aluno_responsavel', 'matricula', 'nota', 'frequencia',
  'fechamento_bimestre', 'comunicado', 'comunicado_destinatario',
];

async function imprimirResumo(sql: Conexao, redeId: string): Promise<void> {
  console.log('\nResumo por tabela');
  for (const tabela of TABELAS_DO_RESUMO) {
    const linhas: { total: number }[] = await sql`
      SELECT count(*)::int AS total FROM ${sql(tabela)} WHERE rede_id = ${redeId}`;
    console.log(`  ${tabela.padEnd(24)} ${String(linhas[0]?.total ?? 0).padStart(7)}`);
  }
}

const COLUNA = 38;
const AMOSTRA_DE_RESPONSAVEIS = 3;

function imprimirCredenciais(equipe: Equipe, responsaveis: string[]): void {
  console.log(`\nAcesso — rede "${SLUG}", senha "${SENHA}" para todos\n`);
  console.log(`  ${'E-MAIL'.padEnd(COLUNA)} ${'PAPEL'.padEnd(12)} UNIDADE`);
  for (const linha of equipe.credenciais) {
    console.log(`  ${linha.email.padEnd(COLUNA)} ${linha.papel.padEnd(12)} ${linha.onde}`);
  }
  for (const email of responsaveis.slice(0, AMOSTRA_DE_RESPONSAVEIS)) {
    console.log(`  ${email.padEnd(COLUNA)} ${'responsavel'.padEnd(12)} portal do responsável`);
  }
  const restantes = responsaveis.length - AMOSTRA_DE_RESPONSAVEIS;
  console.log(`  … e mais ${restantes} responsáveis, mesma senha.`);
}

async function semear(): Promise<void> {
  if (config.ambiente === 'production') {
    throw new Error('APP_ENV=production: este script apaga e recria a rede de demonstração.');
  }
  const ano = new Date().getUTCFullYear();
  const hash = await Bun.password.hash(SENHA);
  const inicio = Date.now();
  const { redeId, equipe, responsaveis } = await unidadeDeTrabalho(async ({ sql }) => {
    const existente: { id: string }[] = await sql`SELECT id FROM rede WHERE slug = ${SLUG}`;
    if (existente[0] !== undefined) await apagarRedeDeDemonstracao(sql, existente[0].id);
    const estrutura = await criarEstrutura(sql, ano);
    const equipeCriada = await criarEquipe(sql, estrutura, hash);
    const povoado = await criarPessoas(sql, estrutura, hash);
    const alocacoes = await alocar(sql, estrutura, equipeCriada.professores);
    await lancarNotas(sql, estrutura, povoado, alocacoes, equipeCriada.professores);
    await registrarFrequencia(sql, estrutura, povoado);
    await publicarComunicados(sql, estrutura, povoado, equipeCriada);
    return { redeId: estrutura.redeId, equipe: equipeCriada, responsaveis: povoado.emails };
  });

  imprimirCredenciais(equipe, responsaveis);
  await imprimirResumo(escrita(), redeId);
  console.log(`\nRede "${SLUG}" recriada em ${((Date.now() - inicio) / 1000).toFixed(1)} s.`);
  console.log('O bimestre 3 está incompleto de propósito: fechá-lo recusa e lista as pendências.');
}

try {
  await semear();
} catch (erro) {
  console.error(`Falha no seed: ${erro instanceof Error ? erro.message : String(erro)}`);
  process.exitCode = 1;
} finally {
  await encerrar();
}

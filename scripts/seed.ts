import { MATRICULA_ATIVA, TURNOS } from '../src/academics';
import { ACTIVE_NETWORK_STATUS, ROLE, type Role } from '../src/identity';
import { config } from '../src/shared/config';
import { ISO_DATE_LENGTH, PRODUCTION_ENV, TIME, WEEK_DAYS } from '../src/shared/constants';
import { closeDatabase, unitOfWork, writer, type Connection } from '../src/shared/db';
import { formatCpf, generateCpf } from '../src/shared/document';
import { uuidIdGenerator } from '../src/shared/ports';

const SLUG = 'demo';
const REDE = 'Rede Municipal de Demonstração';
const SENHA = 'escolaviva';
const DOMINIO = 'escolaviva.test';
const ALUNOS_POR_TURMA = 20;
const DIAS_LETIVOS = 60;
const TAXA_DE_FALTA = 0.06;
const TAXA_DE_JUSTIFICATIVA = 0.4;
const TAXA_DE_LEITURA = 0.12;
const LOTE = 2000;

const SEMENTE_DO_SORTEIO = 20260201;

type Linha = Record<string, string | number | boolean | null>;
type Registro = { id: string; nome: string };
type Turma = {
  id: string;
  unidadeIndice: number;
  nome: string;
  turno: (typeof TURNOS)[number];
  idade: number;
};

const novoId = (): string => uuidIdGenerator.next();

function sorteador(semente: number): () => number {
  let estado = semente >>> 0;
  return () => {
    // magic-values: permitido — incremento do mulberry32, definido pelo algoritmo
    estado = (estado + 0x6d2b79f5) >>> 0;
    // magic-values: permitido — deslocamento do mulberry32, definido pelo algoritmo
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    // magic-values: permitido — deslocamento e multiplicador do mulberry32
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    // magic-values: permitido — 2^32, o divisor que normaliza o mulberry32 para [0, 1)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const aleatorio = sorteador(SEMENTE_DO_SORTEIO);
const entre = (min: number, max: number): number => min + Math.floor(aleatorio() * (max - min + 1));

const ERROS = {
  sorteioSobreListaVazia: 'sorteio sobre lista vazia',
  unidadeDoProfessor: 'unidade do professor não encontrada',
  unidadeDaTurma: 'unidade da turma não encontrada',
  professorDaDisciplina: 'professor da disciplina não encontrado',
  comunicadoSemUnidadeOuAutor: 'unidade ou autor do comunicado não encontrado',
  ambienteDeProducao: 'APP_ENV=production: este script apaga e recria a rede de demonstração.',
} as const;

function umDe<T>(itens: readonly T[]): T {
  const escolhido = itens[entre(0, itens.length - 1)];
  if (escolhido === undefined) throw new Error(ERROS.sorteioSobreListaVazia);
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

const EMAIL = {
  normalizacao: 'NFD',
  separadorDoNome: ' ',
  primeiroDeReserva: 'pessoa',
  ultimoDeReserva: 'demo',
} as const;

function emailDe(nome: string, indice: number): string {
  const partes = nome
    .normalize(EMAIL.normalizacao)
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]+/g, '')
    .split(EMAIL.separadorDoNome);
  const primeiro = partes[0] ?? EMAIL.primeiroDeReserva;
  const ultimo = partes[partes.length - 1] ?? EMAIL.ultimoDeReserva;
  return `${primeiro}.${ultimo}${indice}@${DOMINIO}`;
}

const UNIDADES = ['Escola Central', 'Escola Bairro Novo'];
const DISCIPLINAS = ['Português', 'Matemática', 'História', 'Geografia', 'Ciências', 'Arte'];
const TURMAS: readonly Omit<Turma, 'id'>[] = [
  { unidadeIndice: 0, nome: '6º A', turno: 'morning', idade: 11 },
  { unidadeIndice: 0, nome: '7º A', turno: 'morning', idade: 12 },
  { unidadeIndice: 0, nome: '8º A', turno: 'afternoon', idade: 13 },
  { unidadeIndice: 1, nome: '6º B', turno: 'afternoon', idade: 11 },
  { unidadeIndice: 1, nome: '9º A', turno: 'morning', idade: 14 },
  { unidadeIndice: 1, nome: '9º B', turno: 'full_time', idade: 14 },
];

const SERIE = { digitosDoNome: 2, sufixo: ' ano' } as const;

const TABELA = {
  unidade: 'school',
  usuario: 'app_user',
  papelUsuario: 'user_role',
  sessao: 'session',
  anoLetivo: 'academic_year',
  disciplina: 'subject',
  turma: 'class_group',
  turmaDisciplina: 'class_group_subject',
  aluno: 'student',
  responsavel: 'guardian',
  alunoResponsavel: 'student_guardian',
  matricula: 'enrollment',
  nota: 'grade',
  frequencia: 'attendance',
  fechamentoBimestre: 'term_closing',
  comunicado: 'announcement',
  comunicadoDestinatario: 'announcement_recipient',
} as const;

async function inserir(sql: Connection, tabela: string, linhas: readonly Linha[]): Promise<void> {
  for (let inicio = 0; inicio < linhas.length; inicio += LOTE) {
    await sql`INSERT INTO ${sql(tabela)} ${sql(linhas.slice(inicio, inicio + LOTE))}`;
  }
}

const APAGAR_EM_ORDEM = [
  TABELA.comunicadoDestinatario, TABELA.comunicado, TABELA.frequencia, TABELA.nota,
  TABELA.fechamentoBimestre, TABELA.matricula, TABELA.alunoResponsavel, TABELA.turmaDisciplina,
  TABELA.turma, TABELA.disciplina, TABELA.anoLetivo, TABELA.sessao, TABELA.papelUsuario,
  TABELA.usuario, TABELA.responsavel, TABELA.aluno, TABELA.unidade,
];

async function apagarRedeDeDemonstracao(sql: Connection, redeId: string): Promise<void> {
  await sql`
    DELETE FROM idempotent_request
     WHERE user_id IN (SELECT id FROM app_user WHERE network_id = ${redeId})`;
  for (const tabela of APAGAR_EM_ORDEM) {
    await sql`DELETE FROM ${sql(tabela)} WHERE network_id = ${redeId}`;
  }
  await sql`DELETE FROM network WHERE id = ${redeId}`;
}

type Estrutura = {
  redeId: string; unidades: Registro[]; anoLetivoId: string;
  ano: number; disciplinas: Registro[]; turmas: Turma[];
};

const CALENDARIO = {
  inicioDoAnoLetivo: (ano: number): string => `${ano}-02-01`,
  fimDoAnoLetivo: (ano: number): string => `${ano}-12-15`,
  diaDaMatricula: (ano: number): string => `${ano}-02-05`,
} as const;

async function criarEstrutura(sql: Connection, ano: number): Promise<Estrutura> {
  const redeId = novoId();
  const anoLetivoId = novoId();
  const unidades = UNIDADES.map((nome) => ({ id: novoId(), nome }));
  const disciplinas = DISCIPLINAS.map((nome) => ({ id: novoId(), nome }));
  const turmas = TURMAS.map((turma) => ({ ...turma, id: novoId() }));

  await sql`INSERT INTO network (id, name, slug, status)
            VALUES (${redeId}, ${REDE}, ${SLUG}, ${ACTIVE_NETWORK_STATUS})`;
  await inserir(sql, TABELA.unidade, unidades.map((u) => ({
    id: u.id, network_id: redeId, name: u.nome,
  })));
  await sql`INSERT INTO academic_year (id, network_id, year, start_date, end_date)
            VALUES (${anoLetivoId}, ${redeId}, ${ano},
                    ${CALENDARIO.inicioDoAnoLetivo(ano)}, ${CALENDARIO.fimDoAnoLetivo(ano)})`;
  await inserir(sql, TABELA.disciplina, disciplinas.map((d) => ({
    id: d.id, network_id: redeId, name: d.nome,
  })));
  await inserir(sql, TABELA.turma, turmas.map((turma) => ({
    id: turma.id, network_id: redeId, school_id: unidades[turma.unidadeIndice]?.id ?? '',
    academic_year_id: anoLetivoId, name: turma.nome, shift: turma.turno,
    grade_level: `${turma.nome.slice(0, SERIE.digitosDoNome)}${SERIE.sufixo}`,
  })));
  return { redeId, unidades, anoLetivoId, ano, disciplinas, turmas };
}

type Equipe = {
  credenciais: { email: string; cpf: string; papel: Role; onde: string }[];
  secretarias: string[]; professores: string[];
};

const CAIXA = { admin: 'admin', secretaria: 'secretaria', professor: 'professor' } as const;
const NOME_DO_ADMIN = 'Marina Alves Correia';

const PROFESSORES = { total: 6, porUnidade: 3, disciplinasPorProfessor: 2 } as const;

const SEPARADOR_DE_UNIDADES = ' + ';

async function criarEquipe(sql: Connection, e: Estrutura, hash: string): Promise<Equipe> {
  const usuarios: Linha[] = [];
  const papeis: Linha[] = [];
  const credenciais: Equipe['credenciais'] = [];
  const secretarias: string[] = [];
  const professores: string[] = [];
  let indice = 0;
  const registrar = (nome: string, email: string, papel: Role, unidades: Registro[]): string => {
    const id = novoId();
    indice += 1;
    const cpf = generateCpf(indice);
    usuarios.push({
      id, network_id: e.redeId, email, password_hash: hash, name: nome, guardian_id: null, cpf,
    });
    for (const unidade of unidades) {
      papeis.push({ network_id: e.redeId, user_id: id, school_id: unidade.id, role: papel });
    }
    credenciais.push({
      email, cpf, papel, onde: unidades.map((u) => u.nome).join(SEPARADOR_DE_UNIDADES),
    });
    return id;
  };
  registrar(NOME_DO_ADMIN, `${CAIXA.admin}@${DOMINIO}`, ROLE.networkAdmin, e.unidades);
  e.unidades.forEach((unidade, i) => {
    const alvo = [unidade];
    const email = `${CAIXA.secretaria}${i + 1}@${DOMINIO}`;
    secretarias.push(registrar(nomeDePessoa(), email, ROLE.registrar, alvo));
  });
  for (let p = 0; p < PROFESSORES.total; p += 1) {
    const unidade = e.unidades[Math.floor(p / PROFESSORES.porUnidade)];
    if (unidade === undefined) throw new Error(ERROS.unidadeDoProfessor);
    const email = `${CAIXA.professor}${p + 1}@${DOMINIO}`;
    professores.push(registrar(nomeDePessoa(), email, ROLE.teacher, [unidade]));
  }
  await inserir(sql, TABELA.usuario, usuarios);
  await inserir(sql, TABELA.papelUsuario, papeis);
  return { credenciais, secretarias, professores };
}

type Povoamento = {
  matriculas: { id: string; turmaIndice: number }[];
  responsaveisPorUnidade: string[][]; contas: { email: string; cpf: string }[];
};

const TAXA_DE_DOIS_RESPONSAVEIS = 0.65;
const RESPONSAVEIS_POR_ALUNO = { maximo: 2, minimo: 1 } as const;

const PASSO_DO_INDICE_DE_RESPONSAVEL = 10;

const NASCIMENTO = { ultimoMes: 12, ultimoDia: 28 } as const;

const DOIS_DIGITOS = { casas: 2, preenchimento: '0' } as const;

const TELEFONE = {
  prefixo: '(27) 9',
  separador: '-',
  primeiroDoBloco: 1000,
  ultimoDoBloco: 9999,
} as const;

async function criarPessoas(sql: Connection, e: Estrutura, hash: string): Promise<Povoamento> {
  const alunos: Linha[] = [];
  const responsaveis: Linha[] = [];
  const vinculos: Linha[] = [];
  const usuarios: Linha[] = [];
  const papeis: Linha[] = [];
  const linhasDeMatricula: Linha[] = [];
  const matriculas: { id: string; turmaIndice: number }[] = [];
  const responsaveisPorUnidade: string[][] = e.unidades.map(() => []);
  const contas: { email: string; cpf: string }[] = [];
  let indice = 0;
  e.turmas.forEach((turma, turmaIndice) => {
    const unidade = e.unidades[turma.unidadeIndice];
    if (unidade === undefined) throw new Error(ERROS.unidadeDaTurma);
    for (let n = 0; n < ALUNOS_POR_TURMA; n += 1) {
      indice += 1;
      const alunoId = novoId();
      const mes = String(entre(1, NASCIMENTO.ultimoMes))
        .padStart(DOIS_DIGITOS.casas, DOIS_DIGITOS.preenchimento);
      const dia = String(entre(1, NASCIMENTO.ultimoDia))
        .padStart(DOIS_DIGITOS.casas, DOIS_DIGITOS.preenchimento);
      const nascimento = `${e.ano - turma.idade}-${mes}-${dia}`;
      alunos.push({
        id: alunoId, network_id: e.redeId, name: nomeDePessoa(), birth_date: nascimento,
      });
      const quantosResponsaveis = aleatorio() < TAXA_DE_DOIS_RESPONSAVEIS
        ? RESPONSAVEIS_POR_ALUNO.maximo
        : RESPONSAVEIS_POR_ALUNO.minimo;
      for (let r = 0; r < quantosResponsaveis; r += 1) {
        const respId = novoId();
        const usuarioId = novoId();
        const nome = nomeDePessoa();
        const semente = indice * PASSO_DO_INDICE_DE_RESPONSAVEL + r;
        const email = emailDe(nome, semente);
        const cpf = generateCpf(semente);
        const bloco = (): number => entre(TELEFONE.primeiroDoBloco, TELEFONE.ultimoDoBloco);
        const telefone = `${TELEFONE.prefixo}${bloco()}${TELEFONE.separador}${bloco()}`;
        responsaveis.push({
          id: respId, network_id: e.redeId, name: nome, email, phone: telefone, cpf,
        });
        vinculos.push({
          network_id: e.redeId, student_id: alunoId, guardian_id: respId,
          relationship: umDe(PARENTESCOS), financially_responsible: r === 0,
        });
        usuarios.push({
          id: usuarioId, network_id: e.redeId, email, password_hash: hash, name: nome,
          guardian_id: respId, cpf,
        });
        papeis.push({
          network_id: e.redeId, user_id: usuarioId, school_id: unidade.id,
          role: ROLE.guardian,
        });
        responsaveisPorUnidade[turma.unidadeIndice]?.push(respId);
        contas.push({ email, cpf });
      }
      const matriculaId = novoId();
      matriculas.push({ id: matriculaId, turmaIndice });
      linhasDeMatricula.push({
        id: matriculaId, network_id: e.redeId, student_id: alunoId, class_group_id: turma.id,
        academic_year_id: e.anoLetivoId, enrollment_date: CALENDARIO.diaDaMatricula(e.ano),
        status: MATRICULA_ATIVA,
      });
    }
  });
  await inserir(sql, TABELA.aluno, alunos);
  await inserir(sql, TABELA.responsavel, responsaveis);
  await inserir(sql, TABELA.alunoResponsavel, vinculos);
  await inserir(sql, TABELA.usuario, usuarios);
  await inserir(sql, TABELA.papelUsuario, papeis);
  await inserir(sql, TABELA.matricula, linhasDeMatricula);
  return { matriculas, responsaveisPorUnidade, contas };
}

async function alocar(sql: Connection, e: Estrutura, professores: string[]): Promise<string[][]> {
  const linhas: Linha[] = [];
  const porTurma: string[][] = e.turmas.map(() => []);
  e.turmas.forEach((turma, t) => {
    e.disciplinas.forEach((disciplina, d) => {
      const posicao = turma.unidadeIndice * PROFESSORES.porUnidade
        + Math.floor(d / PROFESSORES.disciplinasPorProfessor);
      const professor = professores[posicao];
      if (professor === undefined) throw new Error(ERROS.professorDaDisciplina);
      const id = novoId();
      porTurma[t]?.push(id);
      linhas.push({
        id, network_id: e.redeId, class_group_id: turma.id,
        subject_id: disciplina.id, teacher_user_id: professor,
      });
    });
  });
  await inserir(sql, TABELA.turmaDisciplina, linhas);
  return porTurma;
}

const PRIMEIRA_DISCIPLINA_INCOMPLETA = 3;
const TAXA_DE_BIMESTRE_COMPLETO = 0.75;

const NOTA = { minimoDobrado: 8, maximoDobrado: 20, divisor: 2 } as const;

async function lancarNotas(
  sql: Connection, e: Estrutura, povoado: Povoamento, alocacoes: string[][], professores: string[],
): Promise<void> {
  const linhas: Linha[] = [];
  const bimestresDe = (d: number): number[] => {
    if (d < PRIMEIRA_DISCIPLINA_INCOMPLETA) return [1, 2, 3];
    if (d === PRIMEIRA_DISCIPLINA_INCOMPLETA) {
      return aleatorio() < TAXA_DE_BIMESTRE_COMPLETO ? [1, 2, 3] : [1, 2];
    }
    return [1, 2];
  };
  povoado.matriculas.forEach((matricula) => {
    const turma = e.turmas[matricula.turmaIndice];
    const lancador = professores[(turma?.unidadeIndice ?? 0) * PROFESSORES.porUnidade] ?? '';
    (alocacoes[matricula.turmaIndice] ?? []).forEach((turmaDisciplinaId, d) => {
      const bimestres = bimestresDe(d);
      for (const bimestre of bimestres) {
        linhas.push({
          id: novoId(), network_id: e.redeId, enrollment_id: matricula.id, posted_by: lancador,
          class_group_subject_id: turmaDisciplinaId, term: bimestre,
          value: entre(NOTA.minimoDobrado, NOTA.maximoDobrado) / NOTA.divisor,
        });
      }
    });
  });
  await inserir(sql, TABELA.nota, linhas);
}

function diasLetivos(quantidade: number): string[] {
  const dias: string[] = [];
  const cursor = new Date();
  while (dias.length < quantidade) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    const semana = cursor.getUTCDay();
    if (semana !== 0 && semana !== WEEK_DAYS.saturdayJs) {
      dias.push(cursor.toISOString().slice(0, ISO_DATE_LENGTH));
    }
  }
  return dias.reverse();
}

async function registrarFrequencia(sql: Connection, e: Estrutura, povoado: Povoamento): Promise<void> {
  const dias = diasLetivos(DIAS_LETIVOS);
  const linhas: Linha[] = [];
  for (const matricula of povoado.matriculas) {
    for (const data of dias) {
      const presente = aleatorio() >= TAXA_DE_FALTA;
      const justificar = !presente && aleatorio() < TAXA_DE_JUSTIFICATIVA;
      linhas.push({
        id: novoId(), network_id: e.redeId, enrollment_id: matricula.id,
        attendance_date: data, present: presente,
        excuse: justificar ? umDe(JUSTIFICATIVAS) : null,
      });
    }
  }
  await inserir(sql, TABELA.frequencia, linhas);
}

const COMUNICADOS = [
  { titulo: 'Reunião de pais e mestres do 2º bimestre', dias: 34 },
  { titulo: 'Calendário da semana de provas', dias: 21 },
  { titulo: 'Campanha de agasalho — entrega na secretaria', dias: 12 },
  { titulo: 'Alteração no horário de entrada às sextas-feiras', dias: 4 },
];

const CORPO_DO_COMUNICADO = (titulo: string, unidade: string): string =>
  `${titulo}. A equipe da ${unidade} pede a leitura atenta e a confirmação no portal.`;

async function publicarComunicados(
  sql: Connection, e: Estrutura, povoado: Povoamento, equipe: Equipe,
): Promise<void> {
  const comunicados: Linha[] = [];
  const destinatarios: Linha[] = [];
  COMUNICADOS.forEach((comunicado, i) => {
    const unidadeIndice = i % e.unidades.length;
    const unidade = e.unidades[unidadeIndice];
    const autor = equipe.secretarias[unidadeIndice];
    if (unidade === undefined || autor === undefined) {
      throw new Error(ERROS.comunicadoSemUnidadeOuAutor);
    }
    const id = novoId();
    comunicados.push({
      id, network_id: e.redeId, school_id: unidade.id, title: comunicado.titulo,
      body: CORPO_DO_COMUNICADO(comunicado.titulo, unidade.nome),
      author_user_id: autor,
      published_at: new Date(Date.now() - comunicado.dias * TIME.msPerDay).toISOString(),
    });
    const daUnidade = povoado.responsaveisPorUnidade[unidadeIndice] ?? [];
    const quantosLeram = Math.round(daUnidade.length * TAXA_DE_LEITURA);
    const acumulado = (ate: number): number => Math.floor((ate * quantosLeram) / daUnidade.length);
    daUnidade.forEach((responsavelId, posicao) => {
      const lido = acumulado(posicao) < acumulado(posicao + 1);
      const quando = new Date(Date.now() - entre(1, comunicado.dias) * TIME.msPerDay);
      destinatarios.push({
        network_id: e.redeId, announcement_id: id, guardian_id: responsavelId,
        read_at: lido ? quando.toISOString() : null,
      });
    });
  });
  await inserir(sql, TABELA.comunicado, comunicados);
  await inserir(sql, TABELA.comunicadoDestinatario, destinatarios);
}

const TABELAS_DO_RESUMO = [
  TABELA.unidade, TABELA.usuario, TABELA.papelUsuario, TABELA.anoLetivo, TABELA.disciplina,
  TABELA.turma, TABELA.turmaDisciplina, TABELA.aluno, TABELA.responsavel,
  TABELA.alunoResponsavel, TABELA.matricula, TABELA.nota, TABELA.frequencia,
  TABELA.fechamentoBimestre, TABELA.comunicado, TABELA.comunicadoDestinatario,
];

const COLUNAS = { email: 38, cpf: 14, papel: 12, tabela: 24, total: 7 } as const;

const AMOSTRA_DE_RESPONSAVEIS = 3;

const SAIDA = {
  resumoPorTabela: '\nResumo por tabela',
  cabecalho: { email: 'E-MAIL', cpf: 'CPF', papel: 'PAPEL', unidade: 'UNIDADE' },
  acesso: (slug: string, senha: string): string =>
    `\nAcesso — rede "${slug}", senha "${senha}" para todos\n`,
  portalDoResponsavel: 'portal do responsável',
  demaisResponsaveis: (quantos: number): string =>
    `  … e mais ${quantos} responsáveis, mesma senha.`,
  redeRecriada: (slug: string, segundos: string): string =>
    `\nRede "${slug}" recriada em ${segundos} s.`,
  bimestreIncompleto:
    'O bimestre 3 está incompleto de propósito: fechá-lo recusa e lista as pendências.',
  falhaNoSeed: (detalhe: string): string => `Falha no seed: ${detalhe}`,
} as const;

async function imprimirResumo(sql: Connection, redeId: string): Promise<void> {
  console.log(SAIDA.resumoPorTabela);
  for (const tabela of TABELAS_DO_RESUMO) {
    const linhas: { total: number }[] = await sql`
      SELECT count(*)::int AS total FROM ${sql(tabela)} WHERE network_id = ${redeId}`;
    console.log(
      `  ${tabela.padEnd(COLUNAS.tabela)} `
        + `${String(linhas[0]?.total ?? 0).padStart(COLUNAS.total)}`,
    );
  }
}

function imprimirCredenciais(equipe: Equipe, responsaveis: { email: string; cpf: string }[]): void {
  console.log(SAIDA.acesso(SLUG, SENHA));
  console.log(
    `  ${SAIDA.cabecalho.email.padEnd(COLUNAS.email)} `
      + `${SAIDA.cabecalho.cpf.padEnd(COLUNAS.cpf)} `
      + `${SAIDA.cabecalho.papel.padEnd(COLUNAS.papel)} ${SAIDA.cabecalho.unidade}`,
  );
  for (const linha of equipe.credenciais) {
    console.log(
      `  ${linha.email.padEnd(COLUNAS.email)} `
        + `${formatCpf(linha.cpf).padEnd(COLUNAS.cpf)} `
        + `${linha.papel.padEnd(COLUNAS.papel)} ${linha.onde}`,
    );
  }
  for (const conta of responsaveis.slice(0, AMOSTRA_DE_RESPONSAVEIS)) {
    console.log(
      `  ${conta.email.padEnd(COLUNAS.email)} `
        + `${formatCpf(conta.cpf).padEnd(COLUNAS.cpf)} `
        + `${ROLE.guardian.padEnd(COLUNAS.papel)} ${SAIDA.portalDoResponsavel}`,
    );
  }
  const restantes = responsaveis.length - AMOSTRA_DE_RESPONSAVEIS;
  console.log(SAIDA.demaisResponsaveis(restantes));
}

async function semear(): Promise<void> {
  if (config.environment === PRODUCTION_ENV) {
    throw new Error(ERROS.ambienteDeProducao);
  }
  const ano = new Date().getUTCFullYear();
  const hash = await Bun.password.hash(SENHA);
  const inicio = Date.now();
  const { redeId, equipe, responsaveis } = await unitOfWork(async ({ sql }) => {
    const existente: { id: string }[] = await sql`SELECT id FROM network WHERE slug = ${SLUG}`;
    if (existente[0] !== undefined) await apagarRedeDeDemonstracao(sql, existente[0].id);
    const estrutura = await criarEstrutura(sql, ano);
    const equipeCriada = await criarEquipe(sql, estrutura, hash);
    const povoado = await criarPessoas(sql, estrutura, hash);
    const alocacoes = await alocar(sql, estrutura, equipeCriada.professores);
    await lancarNotas(sql, estrutura, povoado, alocacoes, equipeCriada.professores);
    await registrarFrequencia(sql, estrutura, povoado);
    await publicarComunicados(sql, estrutura, povoado, equipeCriada);
    return { redeId: estrutura.redeId, equipe: equipeCriada, responsaveis: povoado.contas };
  });

  imprimirCredenciais(equipe, responsaveis);
  await imprimirResumo(writer(), redeId);
  const segundos = ((Date.now() - inicio) / TIME.msPerSecond).toFixed(1);
  console.log(SAIDA.redeRecriada(SLUG, segundos));
  console.log(SAIDA.bimestreIncompleto);
}

try {
  await semear();
} catch (erro) {
  console.error(SAIDA.falhaNoSeed(erro instanceof Error ? erro.message : String(erro)));
  process.exitCode = 1;
} finally {
  await closeDatabase();
}

/*
 * Dados de demonstração da aula: uma rede pequena, completa e previsível. É idempotente por
 * apagar e recriar — a rede de slug `demo` sai inteira e volta igual, então rodar duas vezes
 * deixa o banco no mesmo estado da primeira. O sorteio tem semente fixa: os nomes, as notas e
 * as faltas são os mesmos em toda máquina, e a captura de tela do professor continua batendo
 * com o que o aluno vê. O bimestre 3 nasce incompleto de propósito — fechá-lo falha, e é assim
 * que a aula demonstra a validação de `fecharBimestre` sem estragar dado na hora.
 *
 * As TABELAS DE DADO deste arquivo — nomes de pessoa, disciplinas, turmas, títulos de comunicado
 * e os tamanhos da amostra — continuam literais de propósito: são a amostra, e não política do
 * produto. O que foi nomeado é a LÓGICA em volta delas, e o que é vocabulário de outro módulo
 * (papel, status de rede, situação de matrícula, turno) passou a vir do módulo dono, pelo
 * `index.ts` dele.
 */

import { MATRICULA_ATIVA, TURNOS } from '../src/academico';
import { PAPEL, REDE_ATIVA, type Papel } from '../src/identidade';
import { config } from '../src/shared/config';
import {
  AMBIENTE_PRODUCAO,
  DIAS_DA_SEMANA,
  TAMANHO_DA_DATA_ISO,
  TEMPO,
} from '../src/shared/constantes';
import { encerrar, escrita, unidadeDeTrabalho, type Conexao } from '../src/shared/db';
import { formatarCpf, gerarCpf } from '../src/shared/documento';
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

/** A semente do sorteio. Fixa: é ela que faz a mesma turma nascer em toda máquina. */
const SEMENTE_DO_SORTEIO = 20260201;

type Linha = Record<string, string | number | boolean | null>;
type Registro = { id: string; nome: string };
type Turma = {
  id: string;
  unidadeIndice: number;
  nome: string;
  /** O turno vem do vocabulário fechado do acadêmico: turno escrito errado não compila. */
  turno: (typeof TURNOS)[number];
  idade: number;
};

const novoId = (): string => idGeneratorUuid.novo();

/** Sorteio determinístico (mulberry32): mesma semente, mesma turma, mesmas notas, toda vez. */
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

/** Texto de `throw` deste script: falha de programação do seed, não erro de quem o roda. */
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

/** As peças do endereço montado a partir do nome, e as reservas para quando o nome não tem partes. */
const EMAIL = {
  normalizacao: 'NFD',
  separadorDoNome: ' ',
  primeiroDeReserva: 'pessoa',
  ultimoDeReserva: 'demo',
} as const;

/** Primeiro nome, último sobrenome e o índice: `usuario (rede_id, email)` é único e o nome repete. */
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
  { unidadeIndice: 0, nome: '6º A', turno: 'matutino', idade: 11 },
  { unidadeIndice: 0, nome: '7º A', turno: 'matutino', idade: 12 },
  { unidadeIndice: 0, nome: '8º A', turno: 'vespertino', idade: 13 },
  { unidadeIndice: 1, nome: '6º B', turno: 'vespertino', idade: 11 },
  { unidadeIndice: 1, nome: '9º A', turno: 'matutino', idade: 14 },
  { unidadeIndice: 1, nome: '9º B', turno: 'integral', idade: 14 },
];

/** A série sai do nome da turma: `6º A` vira `6º ano`. */
const SERIE = { digitosDoNome: 2, sufixo: ' ano' } as const;

/**
 * Os nomes de tabela que o `inserir()` recebe como ARGUMENTO — o `sql` marcado continua fora do
 * alcance da regra, mas aqui o nome viaja como valor e precisa existir uma vez só. A fonte é a
 * migração; este mapa é o espelho local dela, e é o que as três listas abaixo consultam.
 */
const TABELA = {
  unidade: 'unidade',
  usuario: 'usuario',
  papelUsuario: 'papel_usuario',
  sessao: 'sessao',
  anoLetivo: 'ano_letivo',
  disciplina: 'disciplina',
  turma: 'turma',
  turmaDisciplina: 'turma_disciplina',
  aluno: 'aluno',
  responsavel: 'responsavel',
  alunoResponsavel: 'aluno_responsavel',
  matricula: 'matricula',
  nota: 'nota',
  frequencia: 'frequencia',
  fechamentoBimestre: 'fechamento_bimestre',
  comunicado: 'comunicado',
  comunicadoDestinatario: 'comunicado_destinatario',
} as const;

/** Um `INSERT` por lote: 7 mil linhas de frequência não podem virar 7 mil idas ao banco. */
async function inserir(sql: Conexao, tabela: string, linhas: readonly Linha[]): Promise<void> {
  for (let inicio = 0; inicio < linhas.length; inicio += LOTE) {
    await sql`INSERT INTO ${sql(tabela)} ${sql(linhas.slice(inicio, inicio + LOTE))}`;
  }
}

// Ordem de remoção: filha antes de mãe, sempre. `requisicao_idempotente` sai primeiro porque é
// tabela de plataforma — não tem `rede_id` e aponta para `usuario`.
const APAGAR_EM_ORDEM = [
  TABELA.comunicadoDestinatario, TABELA.comunicado, TABELA.frequencia, TABELA.nota,
  TABELA.fechamentoBimestre, TABELA.matricula, TABELA.alunoResponsavel, TABELA.turmaDisciplina,
  TABELA.turma, TABELA.disciplina, TABELA.anoLetivo, TABELA.sessao, TABELA.papelUsuario,
  TABELA.usuario, TABELA.responsavel, TABELA.aluno, TABELA.unidade,
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

/**
 * O calendário da demonstração, em um lugar só: o ano letivo vai de 1º de fevereiro a 15 de
 * dezembro, e todo mundo entra no mesmo dia, 5 de fevereiro. As datas são da amostra, mas
 * viajam pela lógica de três inserções diferentes e precisam concordar entre si.
 */
const CALENDARIO = {
  inicioDoAnoLetivo: (ano: number): string => `${ano}-02-01`,
  fimDoAnoLetivo: (ano: number): string => `${ano}-12-15`,
  diaDaMatricula: (ano: number): string => `${ano}-02-05`,
} as const;

async function criarEstrutura(sql: Conexao, ano: number): Promise<Estrutura> {
  const redeId = novoId();
  const anoLetivoId = novoId();
  const unidades = UNIDADES.map((nome) => ({ id: novoId(), nome }));
  const disciplinas = DISCIPLINAS.map((nome) => ({ id: novoId(), nome }));
  const turmas = TURMAS.map((turma) => ({ ...turma, id: novoId() }));

  // O `status` é vocabulário da identidade — o mesmo `'ativa'` que `redePorSlug` cobra no login.
  // Escrito à mão aqui, uma rede semeada com outro rótulo entraria no banco e só falharia na tela.
  await sql`INSERT INTO rede (id, nome, slug, status)
            VALUES (${redeId}, ${REDE}, ${SLUG}, ${REDE_ATIVA})`;
  await inserir(sql, TABELA.unidade, unidades.map((u) => ({
    id: u.id, rede_id: redeId, nome: u.nome,
  })));
  await sql`INSERT INTO ano_letivo (id, rede_id, ano, data_inicio, data_fim)
            VALUES (${anoLetivoId}, ${redeId}, ${ano},
                    ${CALENDARIO.inicioDoAnoLetivo(ano)}, ${CALENDARIO.fimDoAnoLetivo(ano)})`;
  await inserir(sql, TABELA.disciplina, disciplinas.map((d) => ({
    id: d.id, rede_id: redeId, nome: d.nome,
  })));
  await inserir(sql, TABELA.turma, turmas.map((turma) => ({
    id: turma.id, rede_id: redeId, unidade_id: unidades[turma.unidadeIndice]?.id ?? '',
    ano_letivo_id: anoLetivoId, nome: turma.nome, turno: turma.turno,
    serie: `${turma.nome.slice(0, SERIE.digitosDoNome)}${SERIE.sufixo}`,
  })));
  return { redeId, unidades, anoLetivoId, ano, disciplinas, turmas };
}

type Equipe = {
  credenciais: { email: string; cpf: string; papel: Papel; onde: string }[];
  secretarias: string[]; professores: string[];
};

/** O nome da caixa antes do `@` — é endereço fixo da equipe, e não o papel de mesmo nome. */
const CAIXA = { admin: 'admin', secretaria: 'secretaria', professor: 'professor' } as const;
const NOME_DO_ADMIN = 'Marina Alves Correia';

/** Três professores por unidade, seis ao todo, cada um com duas disciplinas em cada turma. */
const PROFESSORES = { total: 6, porUnidade: 3, disciplinasPorProfessor: 2 } as const;

/** Separa as unidades na coluna "onde" das credenciais impressas. */
const SEPARADOR_DE_UNIDADES = ' + ';

/** Admin, secretaria e professores. Todos com a mesma senha — é base de aula, e o README a publica. */
async function criarEquipe(sql: Conexao, e: Estrutura, hash: string): Promise<Equipe> {
  const usuarios: Linha[] = [];
  const papeis: Linha[] = [];
  const credenciais: Equipe['credenciais'] = [];
  const secretarias: string[] = [];
  const professores: string[] = [];
  // Índice próprio, e não o `i` do laço de unidade nem o `p` do laço de professor: os dois
  // reiniciam em zero, e reaproveitá-los faria secretaria e professor caírem no mesmo CPF
  // dentro da mesma rede — o índice do e-mail garante unicidade por papel, não entre papéis.
  let indice = 0;
  const registrar = (nome: string, email: string, papel: Papel, unidades: Registro[]): string => {
    const id = novoId();
    indice += 1;
    const cpf = gerarCpf(indice);
    usuarios.push({
      id, rede_id: e.redeId, email, senha_hash: hash, nome, responsavel_id: null, cpf,
    });
    for (const unidade of unidades) {
      papeis.push({ rede_id: e.redeId, usuario_id: id, unidade_id: unidade.id, papel });
    }
    credenciais.push({
      email, cpf, papel, onde: unidades.map((u) => u.nome).join(SEPARADOR_DE_UNIDADES),
    });
    return id;
  };
  // O admin da rede responde pelas duas unidades: `papel_usuario` só existe por unidade.
  registrar(NOME_DO_ADMIN, `${CAIXA.admin}@${DOMINIO}`, PAPEL.adminRede, e.unidades);
  e.unidades.forEach((unidade, i) => {
    const alvo = [unidade];
    const email = `${CAIXA.secretaria}${i + 1}@${DOMINIO}`;
    secretarias.push(registrar(nomeDePessoa(), email, PAPEL.secretaria, alvo));
  });
  // Três professores por unidade, cada um com duas disciplinas nas três turmas de lá.
  for (let p = 0; p < PROFESSORES.total; p += 1) {
    const unidade = e.unidades[Math.floor(p / PROFESSORES.porUnidade)];
    if (unidade === undefined) throw new Error(ERROS.unidadeDoProfessor);
    const email = `${CAIXA.professor}${p + 1}@${DOMINIO}`;
    professores.push(registrar(nomeDePessoa(), email, PAPEL.professor, [unidade]));
  }
  await inserir(sql, TABELA.usuario, usuarios);
  await inserir(sql, TABELA.papelUsuario, papeis);
  return { credenciais, secretarias, professores };
}

type Povoamento = {
  matriculas: { id: string; turmaIndice: number }[];
  responsaveisPorUnidade: string[][]; contas: { email: string; cpf: string }[];
};

/** A maior parte dos alunos tem dois responsáveis; o restante tem um. */
const TAXA_DE_DOIS_RESPONSAVEIS = 0.65;
const RESPONSAVEIS_POR_ALUNO = { maximo: 2, minimo: 1 } as const;

/**
 * Quantas posições do índice cada aluno reserva para os responsáveis dele. Dez cabem de sobra
 * para os dois de hoje, e é o que mantém e-mail e CPF únicos sem depender da ordem do laço.
 */
const PASSO_DO_INDICE_DE_RESPONSAVEL = 10;

/** A data de nascimento sorteada: mês cheio, e dia que existe até em fevereiro. */
const NASCIMENTO = { ultimoMes: 12, ultimoDia: 28 } as const;

/** Mês e dia saem com duas casas e zero à esquerda, como manda o `AAAA-MM-DD`. */
const DOIS_DIGITOS = { casas: 2, preenchimento: '0' } as const;

/** Telefone fictício: DDD do Espírito Santo, o nono dígito e dois blocos de quatro. */
const TELEFONE = {
  prefixo: '(27) 9',
  separador: '-',
  primeiroDoBloco: 1000,
  ultimoDoBloco: 9999,
} as const;

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
        id: alunoId, rede_id: e.redeId, nome: nomeDePessoa(), data_nascimento: nascimento,
      });
      const quantosResponsaveis = aleatorio() < TAXA_DE_DOIS_RESPONSAVEIS
        ? RESPONSAVEIS_POR_ALUNO.maximo
        : RESPONSAVEIS_POR_ALUNO.minimo;
      for (let r = 0; r < quantosResponsaveis; r += 1) {
        const respId = novoId();
        const usuarioId = novoId();
        const nome = nomeDePessoa();
        // O mesmo índice que dá unicidade ao e-mail dá unicidade ao CPF: responsável e o
        // usuário pelo qual ele acessa são a mesma pessoa, então carregam o mesmo documento.
        const semente = indice * PASSO_DO_INDICE_DE_RESPONSAVEL + r;
        const email = emailDe(nome, semente);
        const cpf = gerarCpf(semente);
        const bloco = (): number => entre(TELEFONE.primeiroDoBloco, TELEFONE.ultimoDoBloco);
        const telefone = `${TELEFONE.prefixo}${bloco()}${TELEFONE.separador}${bloco()}`;
        responsaveis.push({ id: respId, rede_id: e.redeId, nome, email, telefone, cpf });
        // Exatamente um responsável por aluno responde pelo financeiro: é quem receberá a
        // cobrança quando o Estágio 02 existir.
        vinculos.push({
          rede_id: e.redeId, aluno_id: alunoId, responsavel_id: respId,
          parentesco: umDe(PARENTESCOS), financeiro: r === 0,
        });
        usuarios.push({
          id: usuarioId, rede_id: e.redeId, email, senha_hash: hash, nome,
          responsavel_id: respId, cpf,
        });
        papeis.push({
          rede_id: e.redeId, usuario_id: usuarioId, unidade_id: unidade.id,
          papel: PAPEL.responsavel,
        });
        responsaveisPorUnidade[turma.unidadeIndice]?.push(respId);
        contas.push({ email, cpf });
      }
      const matriculaId = novoId();
      matriculas.push({ id: matriculaId, turmaIndice });
      linhasDeMatricula.push({
        id: matriculaId, rede_id: e.redeId, aluno_id: alunoId, turma_id: turma.id,
        ano_letivo_id: e.anoLetivoId, data_matricula: CALENDARIO.diaDaMatricula(e.ano),
        situacao: MATRICULA_ATIVA,
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

/** As 36 alocações: seis disciplinas em cada uma das seis turmas. */
async function alocar(sql: Conexao, e: Estrutura, professores: string[]): Promise<string[][]> {
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
        id, rede_id: e.redeId, turma_id: turma.id,
        disciplina_id: disciplina.id, professor_usuario_id: professor,
      });
    });
  });
  await inserir(sql, TABELA.turmaDisciplina, linhas);
  return porTurma;
}

/**
 * O índice da primeira disciplina que não fecha o bimestre 3, e a chance de essa disciplina
 * escapar da pendência. As anteriores lançam os três bimestres; as seguintes, só os dois
 * primeiros.
 */
const PRIMEIRA_DISCIPLINA_INCOMPLETA = 3;
const TAXA_DE_BIMESTRE_COMPLETO = 0.75;

/** A nota vem em meios pontos: `entre(8, 20) / 2` cobre de 4,0 a 10,0. */
const NOTA = { minimoDobrado: 8, maximoDobrado: 20, divisor: 2 } as const;

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
          id: novoId(), rede_id: e.redeId, matricula_id: matricula.id, lancada_por: lancador,
          turma_disciplina_id: turmaDisciplinaId, bimestre,
          valor: entre(NOTA.minimoDobrado, NOTA.maximoDobrado) / NOTA.divisor,
        });
      }
    });
  });
  await inserir(sql, TABELA.nota, linhas);
}

/** Os dias letivos para trás a partir de hoje, pulando fim de semana. */
function diasLetivos(quantidade: number): string[] {
  const dias: string[] = [];
  const cursor = new Date();
  while (dias.length < quantidade) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    const semana = cursor.getUTCDay();
    if (semana !== 0 && semana !== DIAS_DA_SEMANA.sabadoJs) {
      dias.push(cursor.toISOString().slice(0, TAMANHO_DA_DATA_ISO));
    }
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
  await inserir(sql, TABELA.frequencia, linhas);
}

const COMUNICADOS = [
  { titulo: 'Reunião de pais e mestres do 2º bimestre', dias: 34 },
  { titulo: 'Calendário da semana de provas', dias: 21 },
  { titulo: 'Campanha de agasalho — entrega na secretaria', dias: 12 },
  { titulo: 'Alteração no horário de entrada às sextas-feiras', dias: 4 },
];

/** O corpo é derivado do título: a demonstração não precisa de quatro textos escritos à mão. */
const CORPO_DO_COMUNICADO = (titulo: string, unidade: string): string =>
  `${titulo}. A equipe da ${unidade} pede a leitura atenta e a confirmação no portal.`;

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
    const unidadeIndice = i % e.unidades.length;
    const unidade = e.unidades[unidadeIndice];
    const autor = equipe.secretarias[unidadeIndice];
    if (unidade === undefined || autor === undefined) {
      throw new Error(ERROS.comunicadoSemUnidadeOuAutor);
    }
    const id = novoId();
    comunicados.push({
      id, rede_id: e.redeId, unidade_id: unidade.id, titulo: comunicado.titulo,
      corpo: CORPO_DO_COMUNICADO(comunicado.titulo, unidade.nome),
      autor_usuario_id: autor,
      publicado_em: new Date(Date.now() - comunicado.dias * TEMPO.msPorDia).toISOString(),
    });
    // Contadas, não sorteadas: a taxa é o número da Seção 5 do documento e não pode variar de
    // execução para execução por azar de moeda. O corte espalha as leituras pela lista inteira.
    const daUnidade = povoado.responsaveisPorUnidade[unidadeIndice] ?? [];
    const quantosLeram = Math.round(daUnidade.length * TAXA_DE_LEITURA);
    const acumulado = (ate: number): number => Math.floor((ate * quantosLeram) / daUnidade.length);
    daUnidade.forEach((responsavelId, posicao) => {
      const lido = acumulado(posicao) < acumulado(posicao + 1);
      const quando = new Date(Date.now() - entre(1, comunicado.dias) * TEMPO.msPorDia);
      destinatarios.push({
        rede_id: e.redeId, comunicado_id: id, responsavel_id: responsavelId,
        lido_em: lido ? quando.toISOString() : null,
      });
    });
  });
  await inserir(sql, TABELA.comunicado, comunicados);
  await inserir(sql, TABELA.comunicadoDestinatario, destinatarios);
}

// `fechamento_bimestre` aparece zerado de propósito: nenhum bimestre chega fechado, e é o
// professor quem fecha o 1 na tela para ver a operação passar antes de o 3 recusar.
const TABELAS_DO_RESUMO = [
  TABELA.unidade, TABELA.usuario, TABELA.papelUsuario, TABELA.anoLetivo, TABELA.disciplina,
  TABELA.turma, TABELA.turmaDisciplina, TABELA.aluno, TABELA.responsavel,
  TABELA.alunoResponsavel, TABELA.matricula, TABELA.nota, TABELA.frequencia,
  TABELA.fechamentoBimestre, TABELA.comunicado, TABELA.comunicadoDestinatario,
];

/** As larguras das colunas impressas no terminal. Alinhamento, não regra: só o olho depende delas. */
const COLUNAS = { email: 38, cpf: 14, papel: 12, tabela: 24, total: 7 } as const;

const AMOSTRA_DE_RESPONSAVEIS = 3;

/** Os títulos e as frases que este script escreve no terminal. */
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

async function imprimirResumo(sql: Conexao, redeId: string): Promise<void> {
  console.log(SAIDA.resumoPorTabela);
  for (const tabela of TABELAS_DO_RESUMO) {
    const linhas: { total: number }[] = await sql`
      SELECT count(*)::int AS total FROM ${sql(tabela)} WHERE rede_id = ${redeId}`;
    console.log(
      `  ${tabela.padEnd(COLUNAS.tabela)} `
        + `${String(linhas[0]?.total ?? 0).padStart(COLUNAS.total)}`,
    );
  }
}

// CPF impresso formatado, e não cru: a base é de aula e já publica a senha em texto puro, então
// não há segredo a proteger aqui — só a legibilidade de quem lê o terminal.
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
        + `${formatarCpf(linha.cpf).padEnd(COLUNAS.cpf)} `
        + `${linha.papel.padEnd(COLUNAS.papel)} ${linha.onde}`,
    );
  }
  for (const conta of responsaveis.slice(0, AMOSTRA_DE_RESPONSAVEIS)) {
    console.log(
      `  ${conta.email.padEnd(COLUNAS.email)} `
        + `${formatarCpf(conta.cpf).padEnd(COLUNAS.cpf)} `
        + `${PAPEL.responsavel.padEnd(COLUNAS.papel)} ${SAIDA.portalDoResponsavel}`,
    );
  }
  const restantes = responsaveis.length - AMOSTRA_DE_RESPONSAVEIS;
  console.log(SAIDA.demaisResponsaveis(restantes));
}

async function semear(): Promise<void> {
  if (config.ambiente === AMBIENTE_PRODUCAO) {
    throw new Error(ERROS.ambienteDeProducao);
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
    return { redeId: estrutura.redeId, equipe: equipeCriada, responsaveis: povoado.contas };
  });

  imprimirCredenciais(equipe, responsaveis);
  await imprimirResumo(escrita(), redeId);
  const segundos = ((Date.now() - inicio) / TEMPO.msPorSegundo).toFixed(1);
  console.log(SAIDA.redeRecriada(SLUG, segundos));
  console.log(SAIDA.bimestreIncompleto);
}

try {
  await semear();
} catch (erro) {
  console.error(SAIDA.falhaNoSeed(erro instanceof Error ? erro.message : String(erro)));
  process.exitCode = 1;
} finally {
  await encerrar();
}

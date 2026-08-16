import { Hono, type Context } from 'hono';
import {
  ACADEMIC_LIMITS,
  ACADEMIC_VOCABULARY,
  academics,
  type AcademicYear,
  type ClassGroup,
  type Enrollment,
  type Guardian,
  type GuardianLink,
  type Student,
  type Subject,
} from '../../academics';
import { ROLE, identity } from '../../identity';
import {
  CONTEXT_VARIABLES,
  ISO_DATE_LENGTH,
  LOCALE,
  MASKED_CPF_LENGTH,
  MISSING_VALUE,
} from '../../shared/constants';
import {
  currentNetwork,
  currentUser,
  isUuid,
  requireRole,
  type FormBody,
  type Variables,
} from '../../shared/http';
import { sliceItems } from '../../shared/pagination';
import { systemClock } from '../../shared/ports';
import type { ApplicationError } from '../../shared/result';
import {
  APRESENTACAO,
  AVISOS,
  CAMPOS,
  MARCADO,
  PAGINAS_DE_ERRO,
  PARAMETROS,
  ROTAS,
  SUFIXOS_DE_ID,
  TEMPLATES,
  TITULOS,
  VALORES_INICIAIS,
} from '../constantes';
import { navegacao, paginaDaQuery } from '../paginacao';
import { renderizar, renderizarErro } from '../render';
import type { Params } from './mapa';

type Contexto = Context<{ Variables: Variables }>;
type Valores = Record<string, string | boolean>;
type Erros = readonly ApplicationError[];
type Unidade = { id: string; nome: string };
type Dados = Record<string, unknown>;

type TurmaEmLista = {
  id: string;
  nome: string;
  serie: string;
  turno: string;
  anoLetivoId: string;
  unidadeNome: string;
  ano: number | null;
};

const PARAMETROS_DE_ROTA = {
  id: 'id',
} as const satisfies Params<
  | typeof ROTAS.secretaria.aluno.padrao
  | typeof ROTAS.secretaria.alunoResponsavelNovo.padrao
  | typeof ROTAS.secretaria.alunoResponsaveis.padrao
  | typeof ROTAS.secretaria.alunoMatricular.padrao
  | typeof ROTAS.secretaria.matriculaTransferir.padrao
  | typeof ROTAS.secretaria.turma.padrao
  | typeof ROTAS.secretaria.turmaDisciplinaNova.padrao
  | typeof ROTAS.secretaria.turmaDisciplinas.padrao
>;

const DA_CAMADA = {
  parciais: TEMPLATES.parciais,
  sufixos: SUFIXOS_DE_ID,
  semValor: MISSING_VALUE,
  opcaoVazia: APRESENTACAO.opcaoVazia,
} as const;

const NOME_DO_TURNO: Record<string, string> = ACADEMIC_VOCABULARY.shift;
const TURNOS = Object.entries(NOME_DO_TURNO).map(([valor, nome]) => ({ valor, nome }));

const NOME_DA_SITUACAO: Record<string, string> = ACADEMIC_VOCABULARY.enrollmentStatus;

type AnoEmTela = { id: string; ano: number; dataInicio: string; dataFim: string };

const alunoParaTela = (aluno: Student) => ({
  id: aluno.id,
  nome: aluno.name,
  dataNascimento: aluno.birthDate,
});

const anoParaTela = (anoLetivo: AcademicYear): AnoEmTela => ({
  id: anoLetivo.id,
  ano: anoLetivo.year,
  dataInicio: anoLetivo.startDate,
  dataFim: anoLetivo.endDate,
});

const responsavelParaTela = (responsavel: Guardian) => ({
  id: responsavel.id,
  nome: responsavel.name,
  email: responsavel.email,
  cpf: responsavel.cpf,
  telefone: responsavel.phone,
});

const vinculoParaTela = (vinculo: GuardianLink) => ({
  responsavelId: vinculo.guardianId,
  nome: vinculo.name,
  email: vinculo.email,
  parentesco: vinculo.relationship,
  financeiro: vinculo.financiallyResponsible,
});

const disciplinaParaTela = (disciplina: Subject) => ({ id: disciplina.id, nome: disciplina.name });

const hoje = (): string => systemClock.now().toISOString().slice(0, ISO_DATE_LENGTH);
const porNome = (a: Unidade, b: Unidade): number => a.nome.localeCompare(b.nome, LOCALE);

const texto = (corpo: FormBody, campo: string): string => {
  const valor = corpo[campo];
  return typeof valor === 'string' ? valor.trim() : '';
};

const marcado = (corpo: FormBody, campo: string): boolean => texto(corpo, campo) !== '';

const escolhido = (valor: string | undefined, permitidos: readonly string[]): string | null =>
  valor !== undefined && permitidos.includes(valor) ? valor : null;

const concluir = (c: Contexto, destino: string, mensagem: string): Response =>
  c.redirect(`${destino}?${PARAMETROS.ok}=${encodeURIComponent(mensagem)}`, 303);

const naoEncontrado = (c: Contexto): Response =>
  renderizarErro(
    c,
    404,
    PAGINAS_DE_ERRO.registroForaDoAlcance.titulo,
    PAGINAS_DE_ERRO.registroForaDoAlcance.detalhe,
  );

const unidadesDaSecretaria = (c: Contexto): Unidade[] => {
  const nomePorId = new Map<string, string>();
  for (const atribuicao of currentUser(c).roles) {
    if (atribuicao.role === ROLE.registrar) {
      nomePorId.set(atribuicao.schoolId, atribuicao.schoolName);
    }
  }
  return [...nomePorId].map(([id, nome]) => ({ id, nome })).sort(porNome);
};

const idsDe = (unidades: readonly Unidade[]): string[] => unidades.map(({ id }) => id);

const turmasDoAlcance = (
  redeId: string,
  unidades: readonly Unidade[],
  anoLetivoId: string | null,
): Promise<ClassGroup[]> =>
  academics.listClassGroups(redeId, {
    schoolIds: idsDe(unidades),
    ...(anoLetivoId === null ? {} : { academicYearId: anoLetivoId }),
  });

const turmaNoAlcance = async (c: Contexto, turmaId: string): Promise<ClassGroup | null> => {
  if (!isUuid(turmaId)) return null;
  const turma = await academics.classGroupById(currentNetwork(c), turmaId);
  if (turma === null) return null;
  return unidadesDaSecretaria(c).some(({ id }) => id === turma.schoolId) ? turma : null;
};

const turmaEmLista = (
  turma: ClassGroup,
  ano: ReadonlyMap<string, number>,
  unidade: ReadonlyMap<string, string>,
): TurmaEmLista => ({
  id: turma.id,
  nome: turma.name,
  serie: turma.gradeLevel,
  turno: NOME_DO_TURNO[turma.shift] ?? turma.shift,
  anoLetivoId: turma.academicYearId,
  unidadeNome: unidade.get(turma.schoolId) ?? MISSING_VALUE,
  ano: ano.get(turma.academicYearId) ?? null,
});

const matriculaEmLista = (matricula: Enrollment): Dados => ({
  id: matricula.id,
  alunoId: matricula.studentId,
  alunoNome: matricula.studentName,
  turmaId: matricula.classGroupId,
  turmaNome: matricula.classGroupName,
  anoLetivoId: matricula.academicYearId,
  ano: matricula.year,
  dataMatricula: matricula.enrollmentDate,
  situacao: matricula.status,
  situacaoNome: NOME_DA_SITUACAO[matricula.status] ?? matricula.status,
});

export const rotasSecretaria = new Hono<{ Variables: Variables }>();

rotasSecretaria.use(requireRole(ROLE.registrar));

rotasSecretaria.get(ROTAS.secretaria.painel.padrao, async (c) => {
  const redeId = currentNetwork(c);
  const unidades = unidadesDaSecretaria(c);
  const pagina = sliceItems(unidades, paginaDaQuery(c));

  const [anosLetivos, totais, porUnidade] = await Promise.all([
    academics.listAcademicYears(redeId),
    academics.scopeTotals(redeId, idsDe(unidades)),
    academics.countsBySchool(redeId, idsDe(pagina.items)),
  ]);

  const contagens = pagina.items.map((unidade) => {
    const daUnidade = porUnidade.get(unidade.id);
    return {
      nome: unidade.nome,
      turmas: daUnidade?.classGroups ?? 0,
      matriculas: daUnidade?.enrollments ?? 0,
      responsaveis: daUnidade?.guardians ?? 0,
    };
  });
  const anoCorrente = anosLetivos[0];

  return renderizar(c, TEMPLATES.secretaria.painel, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.painel,
    unidades: contagens,
    navegacao: navegacao(c, pagina),
    anoCorrente: anoCorrente === undefined ? null : anoParaTela(anoCorrente),
    totais: {
      turmas: totais.classGroups,
      matriculas: totais.enrollments,
      responsaveis: totais.guardians,
      disciplinas: totais.subjects,
    },
  });
});

rotasSecretaria.get(ROTAS.secretaria.alunos.padrao, async (c) => {
  const redeId = currentNetwork(c);
  const termo = (c.req.query(PARAMETROS.busca) ?? '').trim();
  const pagina =
    termo === ''
      ? sliceItems<Student>([], 1)
      : await academics.studentsPage(redeId, termo, paginaDaQuery(c));
  const encontrados = pagina.items;

  const ativas = await academics.activeEnrollmentsOfStudents(
    redeId,
    encontrados.map((aluno) => aluno.id),
    idsDe(unidadesDaSecretaria(c)),
  );
  const ativaPorAluno = new Map(ativas.map((matricula) => [matricula.studentId, matricula]));

  const alunos = encontrados.map((aluno) => {
    const matricula = ativaPorAluno.get(aluno.id) ?? null;
    return {
      ...alunoParaTela(aluno),
      turmaNome: matricula?.classGroupName ?? null,
      ano: matricula?.year ?? null,
      situacao: matricula?.status ?? null,
      situacaoNome: matricula === null ? null : (NOME_DA_SITUACAO[matricula.status] ?? null),
    };
  });

  return renderizar(c, TEMPLATES.secretaria.alunos, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.alunos,
    campoDaBusca: PARAMETROS.busca,
    limiteDoNome: ACADEMIC_LIMITS.student.name,
    linhasPorPagina: pagina.size,
    termo,
    buscou: termo !== '',
    alunos,
    navegacao: navegacao(c, pagina),
  });
});

const formDeAluno = (c: Contexto, valores: Valores, erros: Erros): Response =>
  renderizar(c, TEMPLATES.secretaria.alunoNovo, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.alunoNovo,
    limiteDoNome: ACADEMIC_LIMITS.student.name,
    valores,
    erros,
  });

rotasSecretaria.get(ROTAS.secretaria.alunoNovo.padrao, (c) =>
  formDeAluno(c, VALORES_INICIAIS.aluno, []));

rotasSecretaria.post(ROTAS.secretaria.alunos.padrao, async (c) => {
  const corpo = c.get(CONTEXT_VARIABLES.body);
  const valores = {
    nome: texto(corpo, CAMPOS.aluno.nome),
    dataNascimento: texto(corpo, CAMPOS.aluno.dataNascimento),
  };
  const resultado = await academics.registerStudent({
    networkId: currentNetwork(c),
    name: valores.nome,
    birthDate: valores.dataNascimento,
  });
  if (resultado.ok) {
    return concluir(
      c,
      ROTAS.secretaria.aluno({ id: resultado.valor.id }),
      AVISOS.alunoCadastrado,
    );
  }
  return formDeAluno(c, valores, resultado.erros);
});

const alunoNoAlcance = async (c: Contexto, alunoId: string): Promise<Student | null> => {
  if (!isUuid(alunoId)) return null;
  const redeId = currentNetwork(c);
  const unidadeIds = idsDe(unidadesDaSecretaria(c));

  const [aluno, historico, temMatricula] = await Promise.all([
    academics.studentById(redeId, alunoId),
    academics.studentEnrollmentsPage(redeId, alunoId, unidadeIds, 1),
    academics.studentHasEnrollment(redeId, alunoId),
  ]);
  if (aluno === null) return null;
  return temMatricula && historico.total === 0 ? null : aluno;
};

const fichaDoAluno = async (c: Contexto, alunoId: string): Promise<Dados | null> => {
  if (!isUuid(alunoId)) return null;
  const redeId = currentNetwork(c);
  const unidadeIds = idsDe(unidadesDaSecretaria(c));

  const [aluno, vinculos, historico, ativas, temMatricula] = await Promise.all([
    academics.studentById(redeId, alunoId),
    academics.studentGuardiansPage(
      redeId,
      alunoId,
      paginaDaQuery(c, PARAMETROS.paginaDeResponsaveis),
    ),
    academics.studentEnrollmentsPage(
      redeId,
      alunoId,
      unidadeIds,
      paginaDaQuery(c, PARAMETROS.paginaDeMatriculas),
    ),
    academics.activeEnrollmentsOfStudents(redeId, [alunoId], unidadeIds),
    academics.studentHasEnrollment(redeId, alunoId),
  ]);
  if (aluno === null) return null;
  if (temMatricula && historico.total === 0) return null;

  const ativa = ativas[0] ?? null;

  return {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.aluno,
    aluno: alunoParaTela(aluno),
    vinculos: vinculos.items.map(vinculoParaTela),
    navegacaoVinculos: navegacao(c, vinculos, PARAMETROS.paginaDeResponsaveis),
    matriculas: historico.items.map(matriculaEmLista),
    navegacaoMatriculas: navegacao(c, historico, PARAMETROS.paginaDeMatriculas),
    ativa: ativa === null ? null : matriculaEmLista(ativa),
  };
};

rotasSecretaria.get(ROTAS.secretaria.aluno.padrao, async (c) => {
  const ficha = await fichaDoAluno(c, c.req.param(PARAMETROS_DE_ROTA.id));
  return ficha === null ? naoEncontrado(c) : renderizar(c, TEMPLATES.secretaria.aluno, ficha);
});

const formDeVinculo = async (
  c: Contexto,
  aluno: Student,
  valores: Valores,
  erros: Erros,
): Promise<Response> => {
  const redeId = currentNetwork(c);
  const [responsaveis, vinculados] = await Promise.all([
    academics.listGuardians(redeId),
    academics.studentGuardiansPage(redeId, aluno.id, 1),
  ]);
  const jaVinculados = new Set(vinculados.items.map((vinculo) => vinculo.guardianId));

  return renderizar(c, TEMPLATES.secretaria.alunoResponsavelNovo, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.vincularResponsavel,
    limiteDoParentesco: ACADEMIC_LIMITS.relationship.description,
    marcado: MARCADO,
    aluno: alunoParaTela(aluno),
    disponiveis: responsaveis
      .filter((pessoa) => !jaVinculados.has(pessoa.id))
      .map(responsavelParaTela),
    temResponsaveis: responsaveis.length > 0,
    valores,
    erros,
  });
};

rotasSecretaria.get(ROTAS.secretaria.alunoResponsavelNovo.padrao, async (c) => {
  const aluno = await alunoNoAlcance(c, c.req.param(PARAMETROS_DE_ROTA.id));
  return aluno === null ? naoEncontrado(c) : await formDeVinculo(c, aluno, {}, []);
});

rotasSecretaria.post(ROTAS.secretaria.alunoResponsaveis.padrao, async (c) => {
  const aluno = await alunoNoAlcance(c, c.req.param(PARAMETROS_DE_ROTA.id));
  if (aluno === null) return naoEncontrado(c);

  const corpo = c.get(CONTEXT_VARIABLES.body);
  const valores = {
    responsavelId: texto(corpo, CAMPOS.vinculo.responsavelId),
    parentesco: texto(corpo, CAMPOS.vinculo.parentesco),
    financeiro: marcado(corpo, CAMPOS.vinculo.financeiro),
  };
  const resultado = await academics.linkGuardian({
    networkId: currentNetwork(c),
    studentId: aluno.id,
    guardianId: valores.responsavelId,
    relationship: valores.parentesco,
    financiallyResponsible: valores.financeiro,
  });
  if (resultado.ok) {
    return concluir(c, ROTAS.secretaria.aluno({ id: aluno.id }), AVISOS.responsavelVinculado);
  }
  return await formDeVinculo(c, aluno, valores, resultado.erros);
});

const opcoesDeTurma = async (
  c: Contexto,
): Promise<{ turmas: TurmaEmLista[]; anosLetivos: AnoEmTela[] }> => {
  const redeId = currentNetwork(c);
  const unidades = unidadesDaSecretaria(c);
  const [turmas, anosDaRede] = await Promise.all([
    turmasDoAlcance(redeId, unidades, null),
    academics.listAcademicYears(redeId),
  ]);
  const anosLetivos = anosDaRede.map(anoParaTela);
  const anoPorId = new Map(anosLetivos.map((anoLetivo) => [anoLetivo.id, anoLetivo.ano]));
  const nomePorUnidade = new Map(unidades.map(({ id, nome }) => [id, nome]));
  return { turmas: turmas.map((turma) => turmaEmLista(turma, anoPorId, nomePorUnidade)), anosLetivos };
};

const formDeMatricula = async (
  c: Contexto,
  aluno: Student,
  valores: Valores,
  erros: Erros,
): Promise<Response> => {
  const { turmas, anosLetivos } = await opcoesDeTurma(c);
  return renderizar(c, TEMPLATES.secretaria.alunoMatriculaNova, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.matricular,
    aluno: alunoParaTela(aluno),
    turmas,
    anosLetivos,
    hoje: hoje(),
    valores,
    erros,
  });
};

rotasSecretaria.get(ROTAS.secretaria.alunoMatricular.padrao, async (c) => {
  const aluno = await alunoNoAlcance(c, c.req.param(PARAMETROS_DE_ROTA.id));
  return aluno === null ? naoEncontrado(c) : await formDeMatricula(c, aluno, {}, []);
});

rotasSecretaria.post(ROTAS.secretaria.matriculas.padrao, async (c) => {
  const corpo = c.get(CONTEXT_VARIABLES.body);
  const aluno = await alunoNoAlcance(c, texto(corpo, CAMPOS.matricula.alunoId));
  if (aluno === null) return naoEncontrado(c);

  const valores = {
    turmaId: texto(corpo, CAMPOS.matricula.turmaId),
    anoLetivoId: texto(corpo, CAMPOS.matricula.anoLetivoId),
    dataMatricula: texto(corpo, CAMPOS.matricula.dataMatricula),
  };
  if (valores.turmaId !== '' && (await turmaNoAlcance(c, valores.turmaId)) === null) {
    return naoEncontrado(c);
  }

  const resultado = await academics.enroll({
    networkId: currentNetwork(c),
    studentId: aluno.id,
    classGroupId: valores.turmaId,
    academicYearId: valores.anoLetivoId,
    enrollmentDate: valores.dataMatricula,
  });
  if (resultado.ok) {
    return concluir(c, ROTAS.secretaria.aluno({ id: aluno.id }), AVISOS.matriculaRegistrada);
  }
  return await formDeMatricula(c, aluno, valores, resultado.erros);
});

const transferenciaNoAlcance = async (
  c: Contexto,
  matriculaId: string,
): Promise<{ matricula: Enrollment; aluno: Student } | null> => {
  if (!isUuid(matriculaId)) return null;
  const matricula = await academics.enrollmentById(currentNetwork(c), matriculaId);
  if (matricula === null) return null;
  if (!unidadesDaSecretaria(c).some(({ id }) => id === matricula.schoolId)) return null;
  const aluno = await alunoNoAlcance(c, matricula.studentId);
  return aluno === null ? null : { matricula, aluno };
};

const formDeTransferencia = async (
  c: Contexto,
  matricula: Enrollment,
  aluno: Student,
  valores: Valores,
  erros: Erros,
): Promise<Response> => {
  const { turmas } = await opcoesDeTurma(c);
  return renderizar(c, TEMPLATES.secretaria.matriculaTransferencia, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.transferir,
    aluno: alunoParaTela(aluno),
    ativa: matriculaEmLista(matricula),
    turmas: turmas.filter((turma) => turma.id !== matricula.classGroupId),
    hoje: hoje(),
    valores,
    erros,
  });
};

rotasSecretaria.get(ROTAS.secretaria.matriculaTransferir.padrao, async (c) => {
  const alvo = await transferenciaNoAlcance(c, c.req.param(PARAMETROS_DE_ROTA.id));
  if (alvo === null) return naoEncontrado(c);
  return await formDeTransferencia(c, alvo.matricula, alvo.aluno, {}, []);
});

rotasSecretaria.post(ROTAS.secretaria.matriculaTransferir.padrao, async (c) => {
  const matriculaId = c.req.param(PARAMETROS_DE_ROTA.id);
  const alvo = await transferenciaNoAlcance(c, matriculaId);
  if (alvo === null) return naoEncontrado(c);

  const corpo = c.get(CONTEXT_VARIABLES.body);
  const valores = {
    turmaDestinoId: texto(corpo, CAMPOS.transferencia.turmaDestinoId),
    data: texto(corpo, CAMPOS.transferencia.data),
  };
  if (valores.turmaDestinoId !== '' && (await turmaNoAlcance(c, valores.turmaDestinoId)) === null) {
    return naoEncontrado(c);
  }

  const resultado = await academics.transfer({
    networkId: currentNetwork(c),
    enrollmentId: matriculaId,
    targetClassGroupId: valores.turmaDestinoId,
    date: valores.data,
  });
  if (resultado.ok) {
    return concluir(
      c,
      ROTAS.secretaria.aluno({ id: alvo.aluno.id }),
      AVISOS.transferenciaConcluida,
    );
  }
  return await formDeTransferencia(c, alvo.matricula, alvo.aluno, valores, resultado.erros);
});

const telaDeResponsaveis = async (c: Contexto): Promise<Response> => {
  const pagina = await academics.guardiansPage(currentNetwork(c), paginaDaQuery(c));
  return renderizar(c, TEMPLATES.secretaria.responsaveis, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.responsaveis,
    responsaveis: pagina.items.map(responsavelParaTela),
    navegacao: navegacao(c, pagina),
  });
};

const formDeResponsavel = (c: Contexto, valores: Valores, erros: Erros): Response =>
  renderizar(c, TEMPLATES.secretaria.responsavelNovo, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.responsavelNovo,
    limiteDoNome: ACADEMIC_LIMITS.guardian.name,
    limiteDoEmail: ACADEMIC_LIMITS.guardian.email,
    limiteDoTelefone: ACADEMIC_LIMITS.guardian.phone,
    limiteDoCpfComMascara: MASKED_CPF_LENGTH,
    valores,
    erros,
  });

rotasSecretaria.get(ROTAS.secretaria.responsaveis.padrao, (c) => telaDeResponsaveis(c));

rotasSecretaria.get(ROTAS.secretaria.responsavelNovo.padrao, (c) =>
  formDeResponsavel(c, VALORES_INICIAIS.responsavel, []));

rotasSecretaria.post(ROTAS.secretaria.responsaveis.padrao, async (c) => {
  const corpo = c.get(CONTEXT_VARIABLES.body);
  const valores = {
    nome: texto(corpo, CAMPOS.responsavel.nome),
    email: texto(corpo, CAMPOS.responsavel.email),
    telefone: texto(corpo, CAMPOS.responsavel.telefone),
    cpf: texto(corpo, CAMPOS.responsavel.cpf),
  };
  const resultado = await academics.registerGuardian({
    networkId: currentNetwork(c),
    name: valores.nome,
    email: valores.email,
    phone: valores.telefone,
    cpf: valores.cpf,
  });
  if (resultado.ok) {
    return concluir(c, ROTAS.secretaria.responsaveis(), AVISOS.responsavelCadastrado);
  }
  return formDeResponsavel(c, valores, resultado.erros);
});

const telaDeTurmas = async (c: Contexto): Promise<Response> => {
  const redeId = currentNetwork(c);
  const unidades = unidadesDaSecretaria(c);
  const anosLetivos = (await academics.listAcademicYears(redeId)).map(anoParaTela);

  const unidadeId = escolhido(c.req.query(PARAMETROS.unidade), idsDe(unidades));
  const anoLetivoId = escolhido(c.req.query(PARAMETROS.ano), anosLetivos.map(({ id }) => id));
  const alvo = unidadeId === null ? unidades : unidades.filter(({ id }) => id === unidadeId);

  const pagina = await academics.classGroupsPage(
    redeId,
    { schoolIds: idsDe(alvo), ...(anoLetivoId === null ? {} : { academicYearId: anoLetivoId }) },
    paginaDaQuery(c),
  );

  const anoPorId = new Map(anosLetivos.map((anoLetivo) => [anoLetivo.id, anoLetivo.ano]));
  const nomePorUnidade = new Map(unidades.map(({ id, nome }) => [id, nome]));

  return renderizar(c, TEMPLATES.secretaria.turmas, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.turmas,
    campoDaUnidade: PARAMETROS.unidade,
    campoDoAno: PARAMETROS.ano,
    unidades,
    anosLetivos,
    filtro: { unidadeId: unidadeId ?? '', anoLetivoId: anoLetivoId ?? '' },
    turmas: pagina.items.map((turma) => turmaEmLista(turma, anoPorId, nomePorUnidade)),
    navegacao: navegacao(c, pagina),
  });
};

const formDeTurma = async (c: Contexto, valores: Valores, erros: Erros): Promise<Response> =>
  renderizar(c, TEMPLATES.secretaria.turmaNova, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.turmaNova,
    limiteDoNome: ACADEMIC_LIMITS.classGroup.name,
    limiteDaSerie: ACADEMIC_LIMITS.classGroup.gradeLevel,
    unidades: unidadesDaSecretaria(c),
    anosLetivos: (await academics.listAcademicYears(currentNetwork(c))).map(anoParaTela),
    turnos: TURNOS,
    valores,
    erros,
  });

rotasSecretaria.get(ROTAS.secretaria.turmas.padrao, (c) => telaDeTurmas(c));

rotasSecretaria.get(ROTAS.secretaria.turmaNova.padrao, (c) =>
  formDeTurma(c, VALORES_INICIAIS.turma, []));

rotasSecretaria.post(ROTAS.secretaria.turmas.padrao, async (c) => {
  const corpo = c.get(CONTEXT_VARIABLES.body);
  const valores = {
    nome: texto(corpo, CAMPOS.turma.nome),
    serie: texto(corpo, CAMPOS.turma.serie),
    turno: texto(corpo, CAMPOS.turma.turno),
    unidadeId: texto(corpo, CAMPOS.turma.unidadeId),
    anoLetivoId: texto(corpo, CAMPOS.turma.anoLetivoId),
  };
  const unidades = unidadesDaSecretaria(c);
  if (valores.unidadeId !== '' && !unidades.some(({ id }) => id === valores.unidadeId)) {
    return naoEncontrado(c);
  }

  const resultado = await academics.registerClassGroup({
    networkId: currentNetwork(c),
    name: valores.nome,
    gradeLevel: valores.serie,
    shift: valores.turno,
    schoolId: valores.unidadeId,
    academicYearId: valores.anoLetivoId,
  });
  if (resultado.ok) {
    return concluir(c, ROTAS.secretaria.turma({ id: resultado.valor.id }), AVISOS.turmaCadastrada);
  }
  return formDeTurma(c, valores, resultado.erros);
});

const turmaParaTela = async (c: Contexto, turma: ClassGroup): Promise<TurmaEmLista> => {
  const anosLetivos = await academics.listAcademicYears(currentNetwork(c));
  const anoPorId = new Map(anosLetivos.map((anoLetivo) => [anoLetivo.id, anoLetivo.year]));
  const nomePorUnidade = new Map(unidadesDaSecretaria(c).map(({ id, nome }) => [id, nome]));
  return turmaEmLista(turma, anoPorId, nomePorUnidade);
};

const telaDaTurma = async (c: Contexto, turma: ClassGroup): Promise<Response> => {
  const redeId = currentNetwork(c);
  const [alocacoes, matriculas] = await Promise.all([
    academics.classGroupSubjectsPage(
      redeId,
      turma.id,
      paginaDaQuery(c, PARAMETROS.paginaDeDisciplinas),
    ),
    academics.activeEnrollmentsOfClassGroupPage(
      redeId,
      turma.id,
      paginaDaQuery(c, PARAMETROS.paginaDeMatriculas),
    ),
  ]);
  const nomes = await identity.userNames(
    redeId,
    alocacoes.items.map((a) => a.teacherUserId),
  );

  return renderizar(c, TEMPLATES.secretaria.turma, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.turma(turma.name),
    turma: await turmaParaTela(c, turma),
    alocacoes: alocacoes.items.map((alocacao) => ({
      id: alocacao.id,
      disciplinaNome: alocacao.subjectName,
      professorNome: nomes.get(alocacao.teacherUserId) ?? MISSING_VALUE,
    })),
    navegacaoAlocacoes: navegacao(c, alocacoes, PARAMETROS.paginaDeDisciplinas),
    matriculas: matriculas.items.map(matriculaEmLista),
    navegacaoMatriculas: navegacao(c, matriculas, PARAMETROS.paginaDeMatriculas),
  });
};

rotasSecretaria.get(ROTAS.secretaria.turma.padrao, async (c) => {
  const turma = await turmaNoAlcance(c, c.req.param(PARAMETROS_DE_ROTA.id));
  return turma === null ? naoEncontrado(c) : await telaDaTurma(c, turma);
});

const formDeAlocacao = async (
  c: Contexto,
  turma: ClassGroup,
  valores: Valores,
  erros: Erros,
): Promise<Response> => {
  const redeId = currentNetwork(c);
  const [disciplinas, professores] = await Promise.all([
    academics.listSubjects(redeId),
    identity.schoolTeachers(redeId, turma.schoolId),
  ]);
  return renderizar(c, TEMPLATES.secretaria.turmaDisciplinaNova, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.alocar,
    turma: await turmaParaTela(c, turma),
    disciplinas: disciplinas.map(disciplinaParaTela),
    professores,
    valores,
    erros,
  });
};

rotasSecretaria.get(ROTAS.secretaria.turmaDisciplinaNova.padrao, async (c) => {
  const turma = await turmaNoAlcance(c, c.req.param(PARAMETROS_DE_ROTA.id));
  if (turma === null) return naoEncontrado(c);
  return await formDeAlocacao(c, turma, { disciplinaId: '', professorUsuarioId: '' }, []);
});

rotasSecretaria.post(ROTAS.secretaria.turmaDisciplinas.padrao, async (c) => {
  const turmaId = c.req.param(PARAMETROS_DE_ROTA.id);
  const turma = await turmaNoAlcance(c, turmaId);
  if (turma === null) return naoEncontrado(c);

  const corpo = c.get(CONTEXT_VARIABLES.body);
  const valores = {
    disciplinaId: texto(corpo, CAMPOS.alocacao.disciplinaId),
    professorUsuarioId: texto(corpo, CAMPOS.alocacao.professorUsuarioId),
  };
  const resultado = await academics.assignTeacher({
    networkId: currentNetwork(c),
    classGroupId: turmaId,
    subjectId: valores.disciplinaId,
    teacherUserId: valores.professorUsuarioId,
  });
  if (resultado.ok) {
    return concluir(c, ROTAS.secretaria.turma({ id: turmaId }), AVISOS.disciplinaAlocada);
  }
  return await formDeAlocacao(c, turma, valores, resultado.erros);
});

const telaDeDisciplinas = async (c: Contexto): Promise<Response> => {
  const pagina = await academics.subjectsPage(currentNetwork(c), paginaDaQuery(c));
  return renderizar(c, TEMPLATES.secretaria.disciplinas, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.disciplinas,
    disciplinas: pagina.items.map(disciplinaParaTela),
    navegacao: navegacao(c, pagina),
  });
};

const formDeDisciplina = (c: Contexto, valores: Valores, erros: Erros): Response =>
  renderizar(c, TEMPLATES.secretaria.disciplinaNova, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.disciplinaNova,
    limiteDoNome: ACADEMIC_LIMITS.subject.name,
    valores,
    erros,
  });

rotasSecretaria.get(ROTAS.secretaria.disciplinas.padrao, (c) => telaDeDisciplinas(c));

rotasSecretaria.get(ROTAS.secretaria.disciplinaNova.padrao, (c) =>
  formDeDisciplina(c, VALORES_INICIAIS.disciplina, []));

rotasSecretaria.post(ROTAS.secretaria.disciplinas.padrao, async (c) => {
  const valores = { nome: texto(c.get(CONTEXT_VARIABLES.body), CAMPOS.disciplina.nome) };
  const resultado = await academics.registerSubject({
    networkId: currentNetwork(c),
    name: valores.nome,
  });
  if (resultado.ok) {
    return concluir(c, ROTAS.secretaria.disciplinas(), AVISOS.disciplinaCadastrada);
  }
  return formDeDisciplina(c, valores, resultado.erros);
});

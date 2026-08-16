import { Hono, type Context } from 'hono';
import { ACADEMIC_VOCABULARY, academics } from '../../academics';
import {
  ASSESSMENT_LIMITS,
  ASSESSMENT_VOCABULARY,
  NOON_UTC,
  TERMS,
  assessment,
  type TermClosingState,
} from '../../assessment';
import { ROLE } from '../../identity';
import { CONTEXT_VARIABLES, FORMATS, ISO_DATE_LENGTH, LOCALE, TIME } from '../../shared/constants';
import {
  BusinessRuleViolation,
  NotFound,
  currentNetwork,
  currentUser,
  requireRole,
  type FormBody,
  type Variables,
} from '../../shared/http';
import { systemClock } from '../../shared/ports';
import type { ApplicationError } from '../../shared/result';
import {
  APRESENTACAO,
  AVISOS,
  CAMPOS,
  DIAGNOSTICOS,
  ERROS_DE_FORMULARIO,
  NOTA_FORA_DA_FAIXA,
  PARAMETROS,
  PREFIXOS_DE_ID,
  RESUMO_DE_NOTA_FORA_DA_FAIXA,
  ROTAS,
  TEMPLATES,
  TITULOS,
} from '../constants';
import { formatarData, renderizar, type DadosDeTemplate } from '../render';
import type { Params } from './routeMap';

type ContextoWeb = Context<{ Variables: Variables }>;

type Alocacao = Awaited<ReturnType<typeof academics.teacherClassGroupSubjects>>[number];

type TurmaDoProfessor = {
  turmaId: string;
  turmaNome: string;
  serie: string;
  turno: string;
  disciplinas: { id: string; disciplinaNome: string }[];
};

type LancamentoRecusado = {
  valores: Map<string, string>;
  porMatricula: Map<string, string>;
  problemas: readonly ApplicationError[];
};

type ChamadaRecusada = {
  informadas: Map<string, { presente: boolean; justificativa: string }>;
  problemas: readonly ApplicationError[];
};

const PARAMETROS_DE_ROTA = {
  turmaDisciplinaId: 'turmaDisciplinaId',
  turmaId: 'turmaId',
} as const satisfies Params<
  typeof ROTAS.professor.notas.padrao | typeof ROTAS.professor.chamada.padrao
>;

const BIMESTRE_PADRAO = 1;

const PARCIAIS = { parciais: TEMPLATES.parciais };
const SEPARADORES = {
  separador: APRESENTACAO.separador,
  separadorDeTurno: APRESENTACAO.separadorDeTurno,
};
const PREFIXOS = { prefixos: PREFIXOS_DE_ID };

const NOME_DO_TURNO: Record<string, string> = ACADEMIC_VOCABULARY.shift;

const turnoNaFrase = (turno: string): string =>
  (NOME_DO_TURNO[turno] ?? turno).toLocaleLowerCase(LOCALE);

const NOTA_INVALIDA = NOTA_FORA_DA_FAIXA(
  ASSESSMENT_LIMITS.grade.minimum,
  ASSESSMENT_LIMITS.grade.maximum,
);

const RESUMO_DE_NOTAS_INVALIDAS: ApplicationError = {
  ...ERROS_DE_FORMULARIO.notaInvalida,
  mensagem: RESUMO_DE_NOTA_FORA_DA_FAIXA(
    ASSESSMENT_LIMITS.grade.minimum,
    ASSESSMENT_LIMITS.grade.maximum,
  ),
};

const comParametros = (caminho: string, parametros: Record<string, string>): string =>
  `${caminho}?${new URLSearchParams(parametros).toString()}`;

const campo = (corpo: FormBody, nome: string): string => {
  const valor = corpo[nome];
  return typeof valor === 'string' ? valor.trim() : '';
};

const marcado = (corpo: FormBody, nome: string): boolean => corpo[nome] !== undefined;

const ouNulo = (texto: string): string | null => (texto === '' ? null : texto);

const bimestreOuNulo = (bruto: string | undefined): number | null => {
  const numero = Number(bruto);
  return TERMS.includes(numero) ? numero : null;
};

const SEPARADOR_DECIMAL_DO_NUMBER = '.';

const doisDigitos = (valor: number): string =>
  String(valor).padStart(APRESENTACAO.colunaDeDoisDigitos, APRESENTACAO.preenchimentoDeDigito);

const hoje = (): string => {
  const d = systemClock.now();
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
};

const dataOuNula = (bruto: string | undefined): string | null => {
  if (bruto === undefined || !FORMATS.isoDate.test(bruto)) return null;
  const convertida = new Date(`${bruto}${NOON_UTC}`);
  if (Number.isNaN(convertida.getTime())) return null;
  return convertida.toISOString().slice(0, ISO_DATE_LENGTH) === bruto ? bruto : null;
};

const deslocarDia = (data: string, dias: number): string => {
  const base = new Date(`${data}${NOON_UTC}`).getTime();
  return new Date(base + dias * TIME.msPerDay).toISOString().slice(0, ISO_DATE_LENGTH);
};

const alocacoesDoProfessor = (c: ContextoWeb): Promise<Alocacao[]> =>
  academics.teacherClassGroupSubjects(currentNetwork(c), currentUser(c).id);

function agruparPorTurma(alocacoes: readonly Alocacao[]): TurmaDoProfessor[] {
  const turmas = new Map<string, TurmaDoProfessor>();
  for (const alocacao of alocacoes) {
    const turmaId = alocacao.classGroupId;
    const anteriores = turmas.get(turmaId)?.disciplinas ?? [];
    const disciplinas = [...anteriores, { id: alocacao.id, disciplinaNome: alocacao.subjectName }];
    turmas.set(turmaId, {
      turmaId,
      turmaNome: alocacao.classGroupName,
      serie: alocacao.gradeLevel,
      turno: turnoNaFrase(alocacao.shift),
      disciplinas,
    });
  }
  return [...turmas.values()];
}

const comLinks = (turma: TurmaDoProfessor) => ({
  ...turma,
  hrefChamada: ROTAS.professor.chamada({ turmaId: turma.turmaId }),
  hrefFechamento: ROTAS.professor.fechamento({ turmaId: turma.turmaId }),
  disciplinas: turma.disciplinas.map((d) => ({
    ...d,
    hrefNotas: ROTAS.professor.notas({ turmaDisciplinaId: d.id }),
  })),
});

function alocacaoOu404(alocacoes: readonly Alocacao[], turmaDisciplinaId: string): Alocacao {
  const alocacao = alocacoes.find((candidata) => candidata.id === turmaDisciplinaId);
  if (alocacao === undefined) throw new NotFound(DIAGNOSTICOS.disciplinaForaDoQuadro);
  return alocacao;
}

function turmaOu404(alocacoes: readonly Alocacao[], turmaId: string): TurmaDoProfessor {
  const turma = agruparPorTurma(alocacoes).find((candidata) => candidata.turmaId === turmaId);
  if (turma === undefined) throw new NotFound(DIAGNOSTICOS.turmaForaDoQuadro);
  return turma;
}

const comoNota = (digitado: string): number | null | undefined => {
  if (digitado === '') return null;
  const numero = Number(
    digitado.replace(APRESENTACAO.separadorDecimal, SEPARADOR_DECIMAL_DO_NUMBER),
  );
  if (
    !Number.isFinite(numero) ||
    numero < ASSESSMENT_LIMITS.grade.minimum ||
    numero > ASSESSMENT_LIMITS.grade.maximum
  ) {
    return undefined;
  }
  return numero;
};

function lerNotas(corpo: FormBody, matriculas: readonly { id: string }[]) {
  const valores = new Map<string, string>();
  const porMatricula = new Map<string, string>();
  const notas = matriculas.map((matricula) => {
    const digitado = campo(corpo, `${CAMPOS.diario.nota}${matricula.id}`);
    valores.set(matricula.id, digitado);
    const valor = comoNota(digitado);
    if (valor === undefined) porMatricula.set(matricula.id, NOTA_INVALIDA);
    return { enrollmentId: matricula.id, value: valor ?? null };
  });
  return { valores, porMatricula, notas };
}

async function telaDeNotas(
  c: ContextoWeb,
  alocacao: Alocacao,
  bimestre: number,
  recusado: LancamentoRecusado | null,
): Promise<DadosDeTemplate> {
  const redeId = currentNetwork(c);
  const [matriculas, notas, estados] = await Promise.all([
    academics.activeEnrollmentsOfClassGroup(redeId, alocacao.classGroupId),
    assessment.classGroupSubjectGrades(redeId, alocacao.id, bimestre),
    assessment.closingState(redeId, alocacao.classGroupId),
  ]);

  return {
    ...PARCIAIS,
    ...SEPARADORES,
    ...PREFIXOS,
    titulo: TITULOS.professor.notas(alocacao.subjectName, alocacao.classGroupName),
    alocacao: {
      disciplinaNome: alocacao.subjectName,
      turmaNome: alocacao.classGroupName,
      serie: alocacao.gradeLevel,
      turno: turnoNaFrase(alocacao.shift),
    },
    bimestre,
    bimestres: TERMS,
    fechado: estados.some((estado) => estado.term === bimestre && estado.closed),
    acaoDoFormulario: ROTAS.professor.notas({ turmaDisciplinaId: alocacao.id }),
    hrefChamada: ROTAS.professor.chamada({ turmaId: alocacao.classGroupId }),
    hrefFechamento: ROTAS.professor.fechamento({ turmaId: alocacao.classGroupId }),
    campoBimestre: CAMPOS.bimestre,
    prefixoNota: CAMPOS.diario.nota,
    notaMinima: ASSESSMENT_LIMITS.grade.minimum,
    notaMaxima: ASSESSMENT_LIMITS.grade.maximum,
    linhas: matriculas.map((matricula) => ({
      matriculaId: matricula.id,
      alunoNome: matricula.studentName,
      valor: recusado?.valores.get(matricula.id) ?? String(notas.get(matricula.id) ?? ''),
      erro: recusado?.porMatricula.get(matricula.id) ?? null,
    })),
    erros: recusado?.problemas ?? [],
  };
}

const mensagemDeNotas = (gravadas: number): string => {
  if (gravadas === 0) return AVISOS.notasNenhuma;
  return gravadas === 1 ? AVISOS.notaUma : AVISOS.notasVarias(gravadas);
};

async function telaDeChamada(
  c: ContextoWeb,
  turma: TurmaDoProfessor,
  data: string,
  recusada: ChamadaRecusada | null,
): Promise<DadosDeTemplate> {
  const redeId = currentNetwork(c);
  const [matriculas, registradas] = await Promise.all([
    academics.activeEnrollmentsOfClassGroup(redeId, turma.turmaId),
    assessment.rollCallForDate(redeId, turma.turmaId, data),
  ]);

  return {
    ...PARCIAIS,
    ...SEPARADORES,
    titulo: TITULOS.professor.chamada(turma.turmaNome),
    turma: comLinks(turma),
    data,
    diaAnterior: deslocarDia(data, -1),
    diaSeguinte: deslocarDia(data, 1),
    acaoDoFormulario: ROTAS.professor.chamada({ turmaId: turma.turmaId }),
    campoData: CAMPOS.data,
    prefixoPresenca: CAMPOS.diario.presenca,
    prefixoJustificativa: CAMPOS.diario.justificativa,
    limiteDaJustificativa: ASSESSMENT_LIMITS.excuseCharacters,
    linhas: matriculas.map(({ id, studentName }) => {
      const informada = recusada?.informadas.get(id);
      const registrada = registradas.get(id);
      return {
        matriculaId: id,
        alunoNome: studentName,
        presente: informada?.presente ?? registrada?.present ?? true,
        justificativa: informada?.justificativa ?? registrada?.excuse ?? '',
      };
    }),
    erros: recusada?.problemas ?? [],
  };
}

const ROTULO_DO_FECHAMENTO = {
  fechado: ASSESSMENT_VOCABULARY.closing.closed,
  aberto: ASSESSMENT_VOCABULARY.closing.open,
};

const estadoParaTela = (estado: TermClosingState) => ({
  bimestre: estado.term,
  fechado: estado.closed,
  fechadoEm: estado.closedAt,
});

const telaDeFechamento = (
  turma: TurmaDoProfessor,
  estados: readonly TermClosingState[],
  problemas: readonly ApplicationError[],
  bimestreRecusado: number | null,
): DadosDeTemplate => ({
  ...SEPARADORES,
  ...PREFIXOS,
  titulo: TITULOS.professor.fechamento(turma.turmaNome),
  turma: comLinks(turma),
  estados: estados.map(estadoParaTela),
  acaoDoFormulario: ROTAS.professor.fechamento({ turmaId: turma.turmaId }),
  campoBimestre: CAMPOS.bimestre,
  rotuloDoFechamento: ROTULO_DO_FECHAMENTO,
  bimestreRecusado,
  erros: problemas,
});

export const rotasProfessor = new Hono<{ Variables: Variables }>();

rotasProfessor.use(requireRole(ROLE.teacher));

rotasProfessor.get(ROTAS.professor.painel.padrao, async (c) => {
  const turmas = agruparPorTurma(await alocacoesDoProfessor(c)).map(comLinks);
  return renderizar(c, TEMPLATES.professor.painel, {
    ...PARCIAIS,
    ...SEPARADORES,
    titulo: TITULOS.professor.painel,
    turmas,
  });
});

rotasProfessor.get(ROTAS.professor.notas.padrao, async (c) => {
  const alocacao = alocacaoOu404(
    await alocacoesDoProfessor(c),
    c.req.param(PARAMETROS_DE_ROTA.turmaDisciplinaId),
  );
  const bimestre = bimestreOuNulo(c.req.query(PARAMETROS.bimestre)) ?? BIMESTRE_PADRAO;
  return renderizar(c, TEMPLATES.professor.notas, await telaDeNotas(c, alocacao, bimestre, null));
});

rotasProfessor.post(ROTAS.professor.notas.padrao, async (c) => {
  const alocacao = alocacaoOu404(
    await alocacoesDoProfessor(c),
    c.req.param(PARAMETROS_DE_ROTA.turmaDisciplinaId),
  );
  const corpo = c.get(CONTEXT_VARIABLES.body);
  const bimestre = bimestreOuNulo(campo(corpo, CAMPOS.bimestre));
  if (bimestre === null) throw new BusinessRuleViolation(DIAGNOSTICOS.bimestreNoLancamento);

  const redeId = currentNetwork(c);
  const matriculas = await academics.activeEnrollmentsOfClassGroup(redeId, alocacao.classGroupId);
  const { valores, porMatricula, notas } = lerNotas(corpo, matriculas);
  const recusar = async (problemas: readonly ApplicationError[]): Promise<Response> =>
    renderizar(
      c,
      TEMPLATES.professor.notas,
      await telaDeNotas(c, alocacao, bimestre, { valores, porMatricula, problemas }),
    );

  if (porMatricula.size > 0) return await recusar([RESUMO_DE_NOTAS_INVALIDAS]);

  const resultado = await assessment.postGrades({
    networkId: redeId,
    classGroupSubjectId: alocacao.id,
    term: bimestre,
    postedBy: currentUser(c).id,
    grades: notas,
  });
  if (!resultado.ok) return await recusar(resultado.erros);

  const parametros = {
    [PARAMETROS.bimestre]: String(bimestre),
    [PARAMETROS.ok]: mensagemDeNotas(resultado.valor),
  };
  return c.redirect(
    comParametros(ROTAS.professor.notas({ turmaDisciplinaId: alocacao.id }), parametros),
    303,
  );
});

rotasProfessor.get(ROTAS.professor.chamada.padrao, async (c) => {
  const turma = turmaOu404(await alocacoesDoProfessor(c), c.req.param(PARAMETROS_DE_ROTA.turmaId));
  const data = dataOuNula(c.req.query(PARAMETROS.data)) ?? hoje();
  return renderizar(c, TEMPLATES.professor.chamada, await telaDeChamada(c, turma, data, null));
});

rotasProfessor.post(ROTAS.professor.chamada.padrao, async (c) => {
  const turma = turmaOu404(await alocacoesDoProfessor(c), c.req.param(PARAMETROS_DE_ROTA.turmaId));
  const corpo = c.get(CONTEXT_VARIABLES.body);
  const data = dataOuNula(campo(corpo, CAMPOS.data));
  if (data === null) throw new BusinessRuleViolation(DIAGNOSTICOS.dataDeChamadaMalformada);

  const redeId = currentNetwork(c);
  const matriculas = await academics.activeEnrollmentsOfClassGroup(redeId, turma.turmaId);
  const informadas = new Map<string, { presente: boolean; justificativa: string }>();
  const linhas = matriculas.map((matricula) => {
    const presente = marcado(corpo, `${CAMPOS.diario.presenca}${matricula.id}`);
    const justificativa = campo(corpo, `${CAMPOS.diario.justificativa}${matricula.id}`);
    informadas.set(matricula.id, { presente, justificativa });
    return { enrollmentId: matricula.id, present: presente, excuse: ouNulo(justificativa) };
  });

  const resultado = await assessment.recordRollCall({
    networkId: redeId,
    classGroupId: turma.turmaId,
    date: data,
    rows: linhas,
  });
  if (!resultado.ok) {
    const tela = await telaDeChamada(c, turma, data, { informadas, problemas: resultado.erros });
    return renderizar(c, TEMPLATES.professor.chamada, tela);
  }

  const parametros = {
    [PARAMETROS.data]: data,
    [PARAMETROS.ok]: AVISOS.chamadaRegistrada(formatarData(data)),
  };
  return c.redirect(
    comParametros(ROTAS.professor.chamada({ turmaId: turma.turmaId }), parametros),
    303,
  );
});

rotasProfessor.get(ROTAS.professor.fechamento.padrao, async (c) => {
  const turma = turmaOu404(await alocacoesDoProfessor(c), c.req.param(PARAMETROS_DE_ROTA.turmaId));
  const estados = await assessment.closingState(currentNetwork(c), turma.turmaId);
  return renderizar(
    c,
    TEMPLATES.professor.fechamento,
    telaDeFechamento(turma, estados, [], null),
  );
});

rotasProfessor.post(ROTAS.professor.fechamento.padrao, async (c) => {
  const turma = turmaOu404(await alocacoesDoProfessor(c), c.req.param(PARAMETROS_DE_ROTA.turmaId));
  const bimestre = bimestreOuNulo(campo(c.get(CONTEXT_VARIABLES.body), CAMPOS.bimestre));
  if (bimestre === null) throw new BusinessRuleViolation(DIAGNOSTICOS.bimestreNoFechamento);

  const redeId = currentNetwork(c);
  const resultado = await assessment.closeTerm({
    networkId: redeId,
    classGroupId: turma.turmaId,
    term: bimestre,
    closedBy: currentUser(c).id,
  });
  if (!resultado.ok) {
    const estados = await assessment.closingState(redeId, turma.turmaId);
    return renderizar(
      c,
      TEMPLATES.professor.fechamento,
      telaDeFechamento(turma, estados, resultado.erros, bimestre),
    );
  }

  const parametros = { [PARAMETROS.ok]: AVISOS.bimestreFechado(bimestre, turma.turmaNome) };
  return c.redirect(
    comParametros(ROTAS.professor.fechamento({ turmaId: turma.turmaId }), parametros),
    303,
  );
});

import { Hono, type Context } from 'hono';
import { ACADEMIC_VOCABULARY, academics, type Enrollment } from '../../academics';
import {
  ARITHMETIC,
  ASSESSMENT_VOCABULARY,
  PASSING,
  assessment,
  type AttendanceEntry,
  type ReportCard,
} from '../../assessment';
import { communication, type Announcement, type BoardItem } from '../../communication';
import { ROLE } from '../../identity';
import {
  NotFound,
  currentNetwork,
  currentUser,
  requireRole,
  type Variables,
} from '../../shared/http';
import { emptyPage } from '../../shared/pagination';
import {
  APRESENTACAO,
  AVISOS,
  DIAGNOSTICOS,
  MISSING_VALUE,
  PARAMETROS,
  ROTAS,
  TEMPLATES,
  TITULOS,
} from '../constantes';
import { navegacao, paginaDaQuery } from '../paginacao';
import { formatarNota, renderizar } from '../render';

export const rotasResponsavel = new Hono<{ Variables: Variables }>();

rotasResponsavel.use(requireRole(ROLE.guardian));

const PARCIAIS = { parciais: TEMPLATES.parciais };

const ROTULOS_DA_AVALIACAO = {
  rotuloDaSituacao: ASSESSMENT_VOCABULARY.finalStatus,
  rotuloDaPresenca: {
    presente: ASSESSMENT_VOCABULARY.attendance.present,
    faltaJustificada: ASSESSMENT_VOCABULARY.attendance.excusedAbsence,
    falta: ASSESSMENT_VOCABULARY.attendance.absence,
  },
};

const ROTULOS_DO_ACADEMICO = {
  rotuloDaSituacao: ACADEMIC_VOCABULARY.enrollmentStatus,
};

const matriculaParaTela = (matricula: Enrollment) => ({
  id: matricula.id,
  alunoNome: matricula.studentName,
  turmaNome: matricula.classGroupName,
  ano: matricula.year,
  situacao: matricula.status,
});

const naEscalaDaTela = (emCentesimos: number): number => emCentesimos / ARITHMETIC.hundredths;

const CRITERIO_DE_APROVACAO = {
  media: formatarNota(naEscalaDaTela(PASSING.minimumAverageInHundredths)),
  frequencia: `${naEscalaDaTela(PASSING.minimumAttendanceInHundredths)}${APRESENTACAO.sufixoDePercentual}`,
};

const responsavelDaSessao = (c: Context): string | null => currentUser(c).guardianId;

const matriculaSobResponsabilidade = async (
  c: Context,
  matriculaId: string,
): Promise<Enrollment> => {
  const responsavelId = responsavelDaSessao(c);
  if (responsavelId === null) throw new NotFound(DIAGNOSTICOS.contaSemResponsavel);

  const matriculas = await academics.guardianEnrollments(currentNetwork(c), responsavelId);
  const matricula = matriculas.find((linha) => linha.id === matriculaId);
  if (matricula === undefined) {
    throw new NotFound(DIAGNOSTICOS.matriculaForaDaResponsabilidade);
  }
  return matricula;
};

const boletimParaTela = (boletim: ReportCard) => ({
  matriculaId: boletim.enrollmentId,
  alunoNome: boletim.studentName,
  turmaNome: boletim.classGroupName,
  ano: boletim.year,
  linhas: boletim.rows.map((linha) => ({
    disciplinaNome: linha.subjectName,
    notas: linha.grades,
    media: linha.average,
  })),
  mediasPorBimestre: boletim.termAverages,
  mediaGeral: boletim.overallAverage,
  percentualFrequencia: boletim.attendanceRate,
  totalDias: boletim.totalDays,
  presencas: boletim.presentDays,
  situacao: boletim.status,
});

const itemDoMuralParaTela = (item: BoardItem) => ({
  comunicadoId: item.announcementId,
  titulo: item.title,
  publicadoEm: item.publishedAt,
  lidoEm: item.readAt,
});

const comunicadoParaTela = (comunicado: Announcement) => ({
  id: comunicado.id,
  titulo: comunicado.title,
  corpo: comunicado.body,
  autorNome: comunicado.authorName,
  publicadoEm: comunicado.publishedAt,
});

const diaParaTela = (dia: AttendanceEntry) => ({
  data: dia.date,
  presente: dia.present,
  justificativa: dia.excuse,
});

const bimestresDe = (boletim: ReportCard): number[] =>
  Array.from({ length: boletim.rows[0]?.grades.length ?? 0 }, (_, indice) => indice + 1);

const comMensagem = (destino: string, aviso: Record<string, string>): string =>
  `${destino}?${new URLSearchParams(aviso).toString()}`;

rotasResponsavel.get(ROTAS.responsavel.painel.padrao, async (c) => {
  const redeId = currentNetwork(c);
  const responsavelId = responsavelDaSessao(c);

  if (responsavelId === null) {
    return renderizar(c, TEMPLATES.responsavel.painel, {
      ...PARCIAIS,
      ...ROTULOS_DO_ACADEMICO,
      titulo: TITULOS.responsavel.painel,
      matriculas: [],
      navegacao: navegacao(c, emptyPage<Enrollment>()),
      naoLidos: [],
      totalNaoLidos: 0,
      totalNoMural: 0,
    });
  }

  const [pagina, naoLidos, contagem] = await Promise.all([
    academics.guardianEnrollmentsPage(redeId, responsavelId, paginaDaQuery(c)),
    communication.boardPage(redeId, responsavelId, false, 1),
    communication.boardCounts(redeId, responsavelId),
  ]);

  return renderizar(c, TEMPLATES.responsavel.painel, {
    ...PARCIAIS,
    ...ROTULOS_DO_ACADEMICO,
    titulo: TITULOS.responsavel.painel,
    matriculas: pagina.items.map(matriculaParaTela),
    navegacao: navegacao(c, pagina),
    naoLidos: naoLidos.items.map(itemDoMuralParaTela),
    totalNaoLidos: contagem.unread,
    totalNoMural: contagem.total,
  });
});

rotasResponsavel.get(ROTAS.responsavel.boletim.padrao, async (c) => {
  const { id: matriculaId } = c.req.param();
  await matriculaSobResponsabilidade(c, matriculaId);

  const boletim = await assessment.reportCard(currentNetwork(c), matriculaId);
  if (boletim === null) throw new NotFound(DIAGNOSTICOS.matriculaSemBoletim);

  return renderizar(c, TEMPLATES.responsavel.boletim, {
    ...PARCIAIS,
    rotuloDaSituacao: ROTULOS_DA_AVALIACAO.rotuloDaSituacao,
    criterio: CRITERIO_DE_APROVACAO,
    titulo: TITULOS.responsavel.boletim(boletim.studentName),
    matriculaId,
    boletim: boletimParaTela(boletim),
    bimestres: bimestresDe(boletim),
  });
});

rotasResponsavel.get(ROTAS.responsavel.frequencia.padrao, async (c) => {
  const { id: matriculaId } = c.req.param();
  const redeId = currentNetwork(c);
  const matricula = await matriculaSobResponsabilidade(c, matriculaId);

  const [dias, boletim] = await Promise.all([
    assessment.attendancePage(redeId, matriculaId, paginaDaQuery(c)),
    assessment.reportCard(redeId, matriculaId),
  ]);
  if (boletim === null) throw new NotFound(DIAGNOSTICOS.matriculaSemFrequencia);

  return renderizar(c, TEMPLATES.responsavel.frequencia, {
    ...PARCIAIS,
    rotuloDaPresenca: ROTULOS_DA_AVALIACAO.rotuloDaPresenca,
    semValor: MISSING_VALUE,
    criterio: CRITERIO_DE_APROVACAO,
    titulo: TITULOS.responsavel.frequencia(matricula.studentName),
    matricula: matriculaParaTela(matricula),
    boletim: boletimParaTela(boletim),
    dias: dias.items.map(diaParaTela),
    navegacao: navegacao(c, dias),
  });
});

rotasResponsavel.get(ROTAS.responsavel.mural.padrao, async (c) => {
  const responsavelId = responsavelDaSessao(c);
  const redeId = currentNetwork(c);
  const [naoLidos, lidos] =
    responsavelId === null
      ? [emptyPage<BoardItem>(), emptyPage<BoardItem>()]
      : await Promise.all([
          communication.boardPage(
            redeId,
            responsavelId,
            false,
            paginaDaQuery(c, PARAMETROS.paginaDeNaoLidos),
          ),
          communication.boardPage(
            redeId,
            responsavelId,
            true,
            paginaDaQuery(c, PARAMETROS.paginaDeLidos),
          ),
        ]);

  return renderizar(c, TEMPLATES.responsavel.mural, {
    ...PARCIAIS,
    titulo: TITULOS.responsavel.mural,
    naoLidos: naoLidos.items.map(itemDoMuralParaTela),
    navegacaoNaoLidos: navegacao(c, naoLidos, PARAMETROS.paginaDeNaoLidos),
    totalNaoLidos: naoLidos.total,
    lidos: lidos.items.map(itemDoMuralParaTela),
    navegacaoLidos: navegacao(c, lidos, PARAMETROS.paginaDeLidos),
    totalLidos: lidos.total,
  });
});

rotasResponsavel.get(ROTAS.responsavel.comunicado.padrao, async (c) => {
  const { comunicadoId } = c.req.param();
  const redeId = currentNetwork(c);
  const responsavelId = responsavelDaSessao(c);
  if (responsavelId === null) throw new NotFound(DIAGNOSTICOS.contaSemResponsavel);

  const [comunicado, mural] = await Promise.all([
    communication.announcementForGuardian(redeId, responsavelId, comunicadoId),
    communication.guardianBoard(redeId, responsavelId),
  ]);
  if (comunicado === null) throw new NotFound(DIAGNOSTICOS.comunicadoForaDoMural);

  return renderizar(c, TEMPLATES.responsavel.comunicado, {
    titulo: comunicado.title,
    comunicado: comunicadoParaTela(comunicado),
    lidoEm: mural.find((item) => item.announcementId === comunicadoId)?.readAt ?? null,
  });
});

rotasResponsavel.post(ROTAS.responsavel.comunicadoLido.padrao, async (c) => {
  const { comunicadoId } = c.req.param();
  const redeId = currentNetwork(c);
  const responsavelId = responsavelDaSessao(c);
  if (responsavelId === null) throw new NotFound(DIAGNOSTICOS.contaSemResponsavel);

  const comunicado = await communication.announcementForGuardian(
    redeId,
    responsavelId,
    comunicadoId,
  );
  if (comunicado === null) throw new NotFound(DIAGNOSTICOS.comunicadoForaDoMural);

  const resultado = await communication.markAsRead({
    networkId: redeId,
    announcementId: comunicadoId,
    guardianId: responsavelId,
  });
  if (!resultado.ok) {
    const mensagem = resultado.erros[0]?.mensagem ?? AVISOS.leituraNaoRegistrada;
    return c.redirect(
      comMensagem(ROTAS.responsavel.comunicado({ comunicadoId }), { [PARAMETROS.erro]: mensagem }),
      303,
    );
  }

  return c.redirect(
    comMensagem(ROTAS.responsavel.mural(), { [PARAMETROS.ok]: AVISOS.comunicadoLido }),
    303,
  );
});

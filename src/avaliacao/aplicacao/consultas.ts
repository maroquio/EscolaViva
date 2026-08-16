import { academico } from '../../academico';
import { reader } from '../../shared/db';
import { DEFAULT_PAGE_SIZE, queryPage, type Page } from '../../shared/pagination';
import {
  mediaDaDisciplina,
  mediaGeral,
  mediasPorBimestre,
  percentualFrequencia,
  situacaoFinal,
  type Boletim,
  type LinhaDeBoletim,
} from '../dominio/boletim';
import {
  estadosDeFechamento,
  todosBimestresFechados,
  type EstadoDeFechamento,
} from '../dominio/fechamentoBimestre';
import type { PresencaDoDia, ResumoFrequencia } from '../dominio/frequencia';
import { BIMESTRES } from '../dominio/nota';
import * as fechamentoRepositorio from '../infra/fechamentoRepositorio';
import * as frequenciaRepositorio from '../infra/frequenciaRepositorio';
import * as notaRepositorio from '../infra/notaRepositorio';

export async function notasDaTurmaDisciplina(
  redeId: string,
  turmaDisciplinaId: string,
  bimestre: number,
): Promise<Map<string, number>> {
  return await notaRepositorio.porTurmaDisciplinaEBimestre(
    reader(),
    redeId,
    turmaDisciplinaId,
    bimestre,
  );
}

export async function chamadaDoDia(
  redeId: string,
  turmaId: string,
  data: string,
): Promise<Map<string, PresencaDoDia>> {
  const matriculas = await academico.matriculasAtivasDaTurma(redeId, turmaId);
  if (matriculas.length === 0) return new Map();
  return await frequenciaRepositorio.porMatriculasEData(
    reader(),
    redeId,
    matriculas.map((matricula) => matricula.id),
    data,
  );
}

export async function estadoDeFechamento(
  redeId: string,
  turmaId: string,
): Promise<EstadoDeFechamento[]> {
  return estadosDeFechamento(await fechamentoRepositorio.porTurma(reader(), redeId, turmaId));
}

export async function frequenciaDaMatricula(
  redeId: string,
  matriculaId: string,
): Promise<ResumoFrequencia[]> {
  return await frequenciaRepositorio.porMatricula(reader(), redeId, matriculaId);
}

export async function paginaDeFrequencia(
  redeId: string,
  matriculaId: string,
  pagina: number,
  tamanho: number = DEFAULT_PAGE_SIZE,
): Promise<Page<ResumoFrequencia>> {
  const sql = reader();
  return await queryPage(
    pagina,
    tamanho,
    () => frequenciaRepositorio.contarPorMatricula(sql, redeId, matriculaId),
    (faixa) => frequenciaRepositorio.porMatricula(sql, redeId, matriculaId, faixa),
  );
}

export async function boletim(redeId: string, matriculaId: string): Promise<Boletim | null> {
  const matricula = await academico.matriculaPorId(redeId, matriculaId);
  if (matricula === null) return null;

  const sql = reader();
  const [disciplinas, notas, apuracao, fechamentos] = await Promise.all([
    academico.listarTurmaDisciplinas(redeId, matricula.turmaId),
    notaRepositorio.porMatricula(sql, redeId, matriculaId),
    frequenciaRepositorio.apuracaoDaMatricula(sql, redeId, matriculaId),
    fechamentoRepositorio.porTurma(sql, redeId, matricula.turmaId),
  ]);

  const linhas = disciplinas.map((disciplina) =>
    montarLinha(disciplina.id, disciplina.disciplinaNome, notas),
  );
  const media = mediaGeral(linhas.map((linha) => linha.media));
  const frequencia = percentualFrequencia(apuracao.presencas, apuracao.totalDias);

  return {
    matriculaId,
    alunoNome: matricula.alunoNome,
    turmaNome: matricula.turmaNome,
    ano: matricula.ano,
    linhas,
    mediasPorBimestre: mediasPorBimestre(linhas),
    mediaGeral: media,
    percentualFrequencia: frequencia,
    totalDias: apuracao.totalDias,
    presencas: apuracao.presencas,
    situacao: situacaoFinal(
      media,
      frequencia,
      todosBimestresFechados(estadosDeFechamento(fechamentos)),
    ),
  };
}

function montarLinha(
  turmaDisciplinaId: string,
  disciplinaNome: string,
  notas: readonly notaRepositorio.NotaDaMatricula[],
): LinhaDeBoletim {
  const daDisciplina = notas.filter((nota) => nota.turmaDisciplinaId === turmaDisciplinaId);
  const porBimestre = BIMESTRES.map(
    (bimestre) => daDisciplina.find((nota) => nota.bimestre === bimestre)?.valor ?? null,
  );
  return { disciplinaNome, notas: porBimestre, media: mediaDaDisciplina(porBimestre) };
}

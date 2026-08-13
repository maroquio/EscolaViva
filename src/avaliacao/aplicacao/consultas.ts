import { academico } from '../../academico';
import { leitura } from '../../shared/db';
import {
  mediaDaDisciplina,
  mediaGeral,
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

// I15: toda consulta daqui declara que é leitura. Hoje `leitura()` devolve o primário, e é essa
// declaração explícita que faz da réplica uma mudança de uma linha em `shared/db`, e não uma
// revisão de cada consulta do sistema.

export async function notasDaTurmaDisciplina(
  redeId: string,
  turmaDisciplinaId: string,
  bimestre: number,
): Promise<Map<string, number>> {
  return await notaRepositorio.porTurmaDisciplinaEBimestre(
    leitura(),
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
    leitura(),
    redeId,
    matriculas.map((matricula) => matricula.id),
    data,
  );
}

export async function estadoDeFechamento(
  redeId: string,
  turmaId: string,
): Promise<EstadoDeFechamento[]> {
  return estadosDeFechamento(await fechamentoRepositorio.porTurma(leitura(), redeId, turmaId));
}

export async function frequenciaDaMatricula(
  redeId: string,
  matriculaId: string,
): Promise<ResumoFrequencia[]> {
  return await frequenciaRepositorio.porMatricula(leitura(), redeId, matriculaId);
}

/**
 * I5: média, percentual de frequência e situação são calculados aqui, a cada leitura, a partir das
 * notas e da chamada. Nenhum deles tem coluna própria — coluna calculada é a cópia que diverge da
 * fonte e ninguém percebe.
 */
export async function boletim(redeId: string, matriculaId: string): Promise<Boletim | null> {
  const matricula = await academico.matriculaPorId(redeId, matriculaId);
  if (matricula === null) return null;

  const sql = leitura();
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
  // Bimestre sem lançamento vira `null` em vez de sumir da linha: a lacuna é o que o responsável
  // precisa enxergar, e é o que impede a média de sair de três bimestres.
  const porBimestre = BIMESTRES.map(
    (bimestre) => daDisciplina.find((nota) => nota.bimestre === bimestre)?.valor ?? null,
  );
  return { disciplinaNome, notas: porBimestre, media: mediaDaDisciplina(porBimestre) };
}

import { z } from 'zod';
import { academico } from '../../academico';
import { unidadeDeTrabalho } from '../../shared/db';
import {
  errosDeSchema,
  falha,
  falhaDeCampo,
  sucesso,
  type Resultado,
} from '../../shared/resultado';
import { CAMPOS, CODIGOS, MENSAGENS } from '../constantes';
import { mensagemDePendencias, pendenciasDoFechamento } from '../dominio/fechamentoBimestre';
import { bimestreValido } from '../dominio/nota';
import * as fechamentoRepositorio from '../infra/fechamentoRepositorio';
import * as notaRepositorio from '../infra/notaRepositorio';

export type FechamentoDeBimestre = {
  redeId: string;
  turmaId: string;
  bimestre: number;
  fechadoPor: string;
};

const esquema = z.object({
  redeId: z.string().uuid(),
  turmaId: z.string().uuid(),
  bimestre: z.number().refine(bimestreValido, MENSAGENS.bimestreInvalido),
  fechadoPor: z.string().uuid(),
});

export async function fecharBimestre(entrada: FechamentoDeBimestre): Promise<Resultado<void>> {
  const validada = esquema.safeParse(entrada);
  if (!validada.success) return falha(...errosDeSchema(validada.error.issues));
  const { redeId, turmaId, bimestre, fechadoPor } = validada.data;

  const turma = await academico.turmaPorId(redeId, turmaId);
  if (turma === null) {
    return falhaDeCampo(CAMPOS.turmaId, CODIGOS.naoEncontrada, MENSAGENS.turmaNaoEncontrada);
  }

  const disciplinas = await academico.listarTurmaDisciplinas(redeId, turmaId);
  if (disciplinas.length === 0) {
    return falhaDeCampo(
      CAMPOS.turmaId,
      CODIGOS.semDisciplina,
      MENSAGENS.fechamento.semDisciplina,
    );
  }

  const matriculas = await academico.matriculasAtivasDaTurma(redeId, turmaId);
  if (matriculas.length === 0) {
    return falhaDeCampo(
      CAMPOS.turmaId,
      CODIGOS.semMatriculaAtiva,
      MENSAGENS.fechamento.semMatriculaAtiva,
    );
  }

  return await unidadeDeTrabalho<Resultado<void>>(async ({ sql }) => {
    if (await fechamentoRepositorio.estaFechado(sql, redeId, turmaId, bimestre)) {
      return falhaDeCampo(CAMPOS.bimestre, CODIGOS.jaFechado, MENSAGENS.fechamento.jaFechado);
    }

    const lancadas = await notaRepositorio.contagemPorDisciplina(
      sql,
      redeId,
      disciplinas.map((disciplina) => disciplina.id),
      bimestre,
      matriculas.map((matricula) => matricula.id),
    );
    const pendencias = pendenciasDoFechamento(disciplinas, matriculas.length, lancadas);
    if (pendencias.length > 0) {
      return falhaDeCampo(
        CAMPOS.bimestre,
        CODIGOS.fechamentoIncompleto,
        mensagemDePendencias(pendencias),
      );
    }

    await fechamentoRepositorio.registrar(sql, { redeId, turmaId, bimestre, fechadoPor });
    return sucesso<void>(undefined);
  });
}

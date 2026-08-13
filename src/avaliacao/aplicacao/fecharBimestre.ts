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
  bimestre: z.number().refine(bimestreValido, 'O bimestre precisa ser 1, 2, 3 ou 4.'),
  fechadoPor: z.string().uuid(),
});

/**
 * Fecha o bimestre de uma turma. Só fecha quando TODA matrícula ativa tem nota em TODA disciplina
 * alocada — depois disso, `lancarNotas` recusa qualquer alteração naquele bimestre.
 *
 * O fechamento é síncrono, e é síncrono de propósito. Conferir todas as matrículas contra todas as
 * disciplinas e gravar o resultado dentro de uma única transação enquanto o navegador espera é o
 * que torna o custo visível: uma turma de 35 alunos leva segundos, e a secretaria que fecha as 40
 * turmas da rede numa tarde vê o navegador desistir antes do fim. Esse número é a medição que
 * justifica a mudança quando ela for feita — por isso não há fila, worker nem execução em segundo
 * plano aqui, e não deve haver.
 */
export async function fecharBimestre(entrada: FechamentoDeBimestre): Promise<Resultado<void>> {
  const validada = esquema.safeParse(entrada);
  if (!validada.success) return falha(...errosDeSchema(validada.error.issues));
  const { redeId, turmaId, bimestre, fechadoPor } = validada.data;

  const turma = await academico.turmaPorId(redeId, turmaId);
  if (turma === null) {
    return falhaDeCampo('turmaId', 'nao_encontrada', 'Turma não encontrada nesta rede.');
  }

  const disciplinas = await academico.listarTurmaDisciplinas(redeId, turmaId);
  if (disciplinas.length === 0) {
    return falhaDeCampo(
      'turmaId',
      'sem_disciplina',
      'A turma não tem disciplina alocada; não há bimestre a fechar.',
    );
  }

  const matriculas = await academico.matriculasAtivasDaTurma(redeId, turmaId);
  if (matriculas.length === 0) {
    return falhaDeCampo(
      'turmaId',
      'sem_matricula_ativa',
      'A turma não tem matrícula ativa; não há bimestre a fechar.',
    );
  }

  return await unidadeDeTrabalho<Resultado<void>>(async ({ sql }) => {
    if (await fechamentoRepositorio.estaFechado(sql, redeId, turmaId, bimestre)) {
      return falhaDeCampo('bimestre', 'ja_fechado', 'Este bimestre já está fechado para a turma.');
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
      return falhaDeCampo('bimestre', 'fechamento_incompleto', mensagemDePendencias(pendencias));
    }

    await fechamentoRepositorio.registrar(sql, { redeId, turmaId, bimestre, fechadoPor });
    return sucesso<void>(undefined);
  });
}

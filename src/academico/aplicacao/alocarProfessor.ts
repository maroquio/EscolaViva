import { z } from 'zod';
import { identidade } from '../../identidade/index';
import { unidadeDeTrabalho } from '../../shared/db';
import { idGeneratorUuid } from '../../shared/ports';
import {
  errosDeSchema,
  falha,
  falhaDeCampo,
  sucesso,
  type Resultado,
} from '../../shared/resultado';
import type { TurmaDisciplina } from '../dominio/turma';
import * as disciplinas from '../infra/disciplinaRepositorio';
import * as turmas from '../infra/turmaRepositorio';

const entrada = z.object({
  redeId: z.string().uuid(),
  turmaId: z.string().uuid('Selecione a turma.'),
  disciplinaId: z.string().uuid('Selecione a disciplina.'),
  professorUsuarioId: z.string().uuid('Selecione o professor.'),
});

export async function alocarProfessor(e: {
  redeId: string;
  turmaId: string;
  disciplinaId: string;
  professorUsuarioId: string;
}): Promise<Resultado<TurmaDisciplina>> {
  const validada = entrada.safeParse(e);
  if (!validada.success) return falha(...errosDeSchema(validada.error.issues));

  const { redeId, turmaId, disciplinaId, professorUsuarioId } = validada.data;
  return unidadeDeTrabalho(async ({ sql }): Promise<Resultado<TurmaDisciplina>> => {
    const turma = await turmas.porId(sql, redeId, turmaId);
    if (turma === null) {
      return falhaDeCampo('turmaId', 'turma_nao_encontrada', 'Turma não encontrada nesta rede.');
    }
    const disciplina = await disciplinas.porId(sql, redeId, disciplinaId);
    if (disciplina === null) {
      return falhaDeCampo(
        'disciplinaId',
        'disciplina_nao_encontrada',
        'Disciplina não encontrada nesta rede.',
      );
    }
    // Quem leciona precisa ter o papel na unidade da turma: é `identidade` quem responde isso,
    // e é por isso que a fronteira entre os dois módulos é uma pergunta, não uma consulta.
    const ehProfessor = await identidade.ehProfessorNaUnidade(
      redeId,
      professorUsuarioId,
      turma.unidadeId,
    );
    if (!ehProfessor) {
      return falhaDeCampo(
        'professorUsuarioId',
        'sem_papel_de_professor',
        'Este usuário não tem papel de professor na unidade desta turma.',
      );
    }

    const alocacao: TurmaDisciplina = {
      id: idGeneratorUuid.novo(),
      redeId,
      turmaId,
      disciplinaId,
      disciplinaNome: disciplina.nome,
      professorUsuarioId,
    };
    const criada = await turmas.inserirDisciplina(sql, alocacao);
    if (!criada) {
      return falhaDeCampo(
        'disciplinaId',
        'disciplina_ja_alocada',
        'Esta disciplina já está alocada nesta turma.',
      );
    }
    return sucesso(alocacao);
  });
}

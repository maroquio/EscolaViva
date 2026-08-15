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
import { CAMPOS, CODIGOS, MENSAGENS } from '../constantes';
import type { TurmaDisciplina } from '../dominio/turma';
import * as disciplinas from '../infra/disciplinaRepositorio';
import * as turmas from '../infra/turmaRepositorio';

const entrada = z.object({
  redeId: z.string().uuid(),
  turmaId: z.string().uuid(MENSAGENS.alocacao.turmaObrigatoria),
  disciplinaId: z.string().uuid(MENSAGENS.alocacao.disciplinaObrigatoria),
  professorUsuarioId: z.string().uuid(MENSAGENS.alocacao.professorObrigatorio),
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
      return falhaDeCampo(
        CAMPOS.alocacao.turmaId,
        CODIGOS.turmaNaoEncontrada,
        MENSAGENS.turmaNaoEncontrada,
      );
    }
    const disciplina = await disciplinas.porId(sql, redeId, disciplinaId);
    if (disciplina === null) {
      return falhaDeCampo(
        CAMPOS.alocacao.disciplinaId,
        CODIGOS.disciplinaNaoEncontrada,
        MENSAGENS.disciplinaNaoEncontrada,
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
        CAMPOS.alocacao.professorUsuarioId,
        CODIGOS.alocacao.semPapelDeProfessor,
        MENSAGENS.alocacao.semPapelDeProfessor,
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
        CAMPOS.alocacao.disciplinaId,
        CODIGOS.alocacao.disciplinaJaAlocada,
        MENSAGENS.alocacao.disciplinaJaAlocada,
      );
    }
    return sucesso(alocacao);
  });
}

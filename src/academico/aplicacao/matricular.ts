import { z } from 'zod';
import type { Conexao } from '../../shared/db';
import { unidadeDeTrabalho } from '../../shared/db';
import { idGeneratorUuid } from '../../shared/ports';
import {
  errosDeSchema,
  falha,
  falhaDeCampo,
  sucesso,
  type Resultado,
} from '../../shared/resultado';
import type { Matricula } from '../dominio/matricula';
import type { Turma } from '../dominio/turma';
import * as alunos from '../infra/alunoRepositorio';
import * as anosLetivos from '../infra/anoLetivoRepositorio';
import * as matriculas from '../infra/matriculaRepositorio';
import * as turmas from '../infra/turmaRepositorio';

const entrada = z.object({
  redeId: z.string().uuid(),
  alunoId: z.string().uuid('Selecione um aluno.'),
  turmaId: z.string().uuid('Selecione uma turma.'),
  anoLetivoId: z.string().uuid('Selecione o ano letivo.'),
  dataMatricula: z.string().date('Informe a data da matrícula no formato AAAA-MM-DD.'),
});

type Alvo = { redeId: string; alunoId: string; turmaId: string; anoLetivoId: string };
type ContextoDaMatricula = { alunoNome: string; turma: Turma; ano: number };

/**
 * As chaves estrangeiras garantem que aluno, turma e ano letivo existem; que os três sejam desta
 * rede é responsabilidade daqui — é o que impede matricular um aluno em turma de outra rede.
 */
async function contexto(sql: Conexao, alvo: Alvo): Promise<Resultado<ContextoDaMatricula>> {
  const aluno = await alunos.porId(sql, alvo.redeId, alvo.alunoId);
  if (aluno === null) {
    return falhaDeCampo('alunoId', 'aluno_nao_encontrado', 'Aluno não encontrado nesta rede.');
  }
  const turma = await turmas.porId(sql, alvo.redeId, alvo.turmaId);
  if (turma === null) {
    return falhaDeCampo('turmaId', 'turma_nao_encontrada', 'Turma não encontrada nesta rede.');
  }
  const anoLetivo = await anosLetivos.porId(sql, alvo.redeId, alvo.anoLetivoId);
  if (anoLetivo === null) {
    return falhaDeCampo(
      'anoLetivoId',
      'ano_letivo_nao_encontrado',
      'Ano letivo não encontrado nesta rede.',
    );
  }
  if (turma.anoLetivoId !== alvo.anoLetivoId) {
    return falhaDeCampo(
      'turmaId',
      'turma_de_outro_ano',
      'A turma não pertence ao ano letivo informado.',
    );
  }
  return sucesso({ alunoNome: aluno.nome, turma, ano: anoLetivo.ano });
}

export async function matricular(e: {
  redeId: string;
  alunoId: string;
  turmaId: string;
  anoLetivoId: string;
  dataMatricula: string;
}): Promise<Resultado<Matricula>> {
  const validada = entrada.safeParse(e);
  if (!validada.success) return falha(...errosDeSchema(validada.error.issues));

  const { redeId, alunoId, turmaId, anoLetivoId, dataMatricula } = validada.data;
  return unidadeDeTrabalho(async ({ sql }): Promise<Resultado<Matricula>> => {
    const encontrado = await contexto(sql, { redeId, alunoId, turmaId, anoLetivoId });
    if (!encontrado.ok) return encontrado;

    const { alunoNome, turma, ano } = encontrado.valor;
    const matricula: Matricula = {
      id: idGeneratorUuid.novo(),
      redeId,
      alunoId,
      alunoNome,
      turmaId,
      turmaNome: turma.nome,
      unidadeId: turma.unidadeId,
      anoLetivoId,
      ano,
      dataMatricula,
      situacao: 'ativa',
    };
    const criada = await matriculas.inserir(sql, matricula);
    if (!criada) {
      return falhaDeCampo(
        'alunoId',
        'matricula_ativa_duplicada',
        'Este aluno já tem matrícula ativa neste ano letivo.',
      );
    }
    return sucesso(matricula);
  });
}

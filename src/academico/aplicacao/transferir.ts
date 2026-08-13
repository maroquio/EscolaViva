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
import { podeTransferir, type Matricula } from '../dominio/matricula';
import type { Turma } from '../dominio/turma';
import * as matriculas from '../infra/matriculaRepositorio';
import * as turmas from '../infra/turmaRepositorio';

const entrada = z.object({
  redeId: z.string().uuid(),
  matriculaId: z.string().uuid('Selecione a matrícula.'),
  turmaDestinoId: z.string().uuid('Selecione a turma de destino.'),
  data: z.string().date('Informe a data da transferência no formato AAAA-MM-DD.'),
});

/**
 * As duas escritas moram na mesma transação e nesta ordem: enquanto a matrícula de origem
 * estiver 'ativa', o índice único parcial impede a criação da matrícula de destino.
 */
async function trocarDeTurma(
  sql: Conexao,
  origem: Matricula,
  destino: Turma,
  data: string,
): Promise<Resultado<Matricula>> {
  const encerrada = await matriculas.marcarComoTransferida(sql, origem.redeId, origem.id);
  if (!encerrada) {
    return falhaDeCampo(
      'matriculaId',
      'matricula_nao_ativa',
      'Esta matrícula deixou de estar ativa antes da transferência ser concluída.',
    );
  }

  const nova: Matricula = {
    id: idGeneratorUuid.novo(),
    redeId: origem.redeId,
    alunoId: origem.alunoId,
    alunoNome: origem.alunoNome,
    turmaId: destino.id,
    turmaNome: destino.nome,
    unidadeId: destino.unidadeId,
    anoLetivoId: origem.anoLetivoId,
    ano: origem.ano,
    dataMatricula: data,
    situacao: 'ativa',
  };
  const criada = await matriculas.inserir(sql, nova);
  // A vaga no índice único parcial foi liberada pelo UPDATE acima, nesta mesma transação: um
  // conflito aqui só viria de escrita concorrente, e então a transferência inteira volta atrás.
  if (!criada) throw new Error('conflito de matrícula ativa durante a transferência');
  return sucesso(nova);
}

export async function transferir(e: {
  redeId: string;
  matriculaId: string;
  turmaDestinoId: string;
  data: string;
}): Promise<Resultado<Matricula>> {
  const validada = entrada.safeParse(e);
  if (!validada.success) return falha(...errosDeSchema(validada.error.issues));

  const { redeId, matriculaId, turmaDestinoId, data } = validada.data;
  return unidadeDeTrabalho(async ({ sql }): Promise<Resultado<Matricula>> => {
    const origem = await matriculas.porId(sql, redeId, matriculaId);
    if (origem === null) {
      return falhaDeCampo(
        'matriculaId',
        'matricula_nao_encontrada',
        'Matrícula não encontrada nesta rede.',
      );
    }
    if (!podeTransferir(origem)) {
      return falhaDeCampo(
        'matriculaId',
        'matricula_nao_ativa',
        'Apenas uma matrícula ativa pode ser transferida.',
      );
    }
    if (origem.turmaId === turmaDestinoId) {
      return falhaDeCampo(
        'turmaDestinoId',
        'mesma_turma',
        'A turma de destino é a mesma turma da matrícula atual.',
      );
    }

    const destino = await turmas.porId(sql, redeId, turmaDestinoId);
    if (destino === null) {
      return falhaDeCampo(
        'turmaDestinoId',
        'turma_nao_encontrada',
        'Turma de destino não encontrada nesta rede.',
      );
    }
    if (destino.anoLetivoId !== origem.anoLetivoId) {
      return falhaDeCampo(
        'turmaDestinoId',
        'turma_de_outro_ano',
        'A turma de destino pertence a outro ano letivo.',
      );
    }

    return trocarDeTurma(sql, origem, destino, data);
  });
}

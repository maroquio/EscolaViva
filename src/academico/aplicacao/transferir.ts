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
import { CAMPOS, CODIGOS, ERROS_INTERNOS, MENSAGENS } from '../constantes';
import { MATRICULA_ATIVA, podeTransferir, type Matricula } from '../dominio/matricula';
import type { Turma } from '../dominio/turma';
import * as matriculas from '../infra/matriculaRepositorio';
import * as turmas from '../infra/turmaRepositorio';

const entrada = z.object({
  redeId: z.string().uuid(),
  matriculaId: z.string().uuid(MENSAGENS.transferencia.matriculaObrigatoria),
  turmaDestinoId: z.string().uuid(MENSAGENS.transferencia.turmaDestinoObrigatoria),
  data: z.string().date(MENSAGENS.transferencia.dataFormato),
});

async function trocarDeTurma(
  sql: Conexao,
  origem: Matricula,
  destino: Turma,
  data: string,
): Promise<Resultado<Matricula>> {
  const encerrada = await matriculas.marcarComoTransferida(sql, origem.redeId, origem.id);
  if (!encerrada) {
    return falhaDeCampo(
      CAMPOS.transferencia.matriculaId,
      CODIGOS.transferencia.perdeuACorrida,
      MENSAGENS.transferencia.perdeuACorrida,
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
    situacao: MATRICULA_ATIVA,
  };
  const criada = await matriculas.inserir(sql, nova);
  if (!criada) throw new Error(ERROS_INTERNOS.conflitoDeMatriculaNaTransferencia);
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
        CAMPOS.transferencia.matriculaId,
        CODIGOS.transferencia.matriculaNaoEncontrada,
        MENSAGENS.transferencia.matriculaNaoEncontrada,
      );
    }
    if (!podeTransferir(origem)) {
      return falhaDeCampo(
        CAMPOS.transferencia.matriculaId,
        CODIGOS.transferencia.somenteAtivaTransfere,
        MENSAGENS.transferencia.somenteAtivaTransfere,
      );
    }
    if (origem.turmaId === turmaDestinoId) {
      return falhaDeCampo(
        CAMPOS.transferencia.turmaDestinoId,
        CODIGOS.transferencia.mesmaTurma,
        MENSAGENS.transferencia.mesmaTurma,
      );
    }

    const destino = await turmas.porId(sql, redeId, turmaDestinoId);
    if (destino === null) {
      return falhaDeCampo(
        CAMPOS.transferencia.turmaDestinoId,
        CODIGOS.transferencia.turmaDestinoNaoEncontrada,
        MENSAGENS.transferencia.turmaDestinoNaoEncontrada,
      );
    }
    if (destino.anoLetivoId !== origem.anoLetivoId) {
      return falhaDeCampo(
        CAMPOS.transferencia.turmaDestinoId,
        CODIGOS.transferencia.turmaDeOutroAno,
        MENSAGENS.transferencia.turmaDeOutroAno,
      );
    }

    return trocarDeTurma(sql, origem, destino, data);
  });
}

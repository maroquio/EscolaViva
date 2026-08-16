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
} from '../../shared/result';
import { CAMPOS, CODIGOS, MENSAGENS } from '../constantes';
import { MATRICULA_ATIVA, type Matricula } from '../dominio/matricula';
import type { Turma } from '../dominio/turma';
import * as alunos from '../infra/alunoRepositorio';
import * as anosLetivos from '../infra/anoLetivoRepositorio';
import * as matriculas from '../infra/matriculaRepositorio';
import * as turmas from '../infra/turmaRepositorio';

const entrada = z.object({
  redeId: z.string().uuid(),
  alunoId: z.string().uuid(MENSAGENS.alunoObrigatorio),
  turmaId: z.string().uuid(MENSAGENS.matricula.turmaObrigatoria),
  anoLetivoId: z.string().uuid(MENSAGENS.anoLetivoObrigatorio),
  dataMatricula: z.string().date(MENSAGENS.matricula.dataFormato),
});

type Alvo = { redeId: string; alunoId: string; turmaId: string; anoLetivoId: string };
type ContextoDaMatricula = { alunoNome: string; turma: Turma; ano: number };

async function contexto(sql: Conexao, alvo: Alvo): Promise<Resultado<ContextoDaMatricula>> {
  const aluno = await alunos.porId(sql, alvo.redeId, alvo.alunoId);
  if (aluno === null) {
    return falhaDeCampo(
      CAMPOS.matricula.alunoId,
      CODIGOS.alunoNaoEncontrado,
      MENSAGENS.alunoNaoEncontrado,
    );
  }
  const turma = await turmas.porId(sql, alvo.redeId, alvo.turmaId);
  if (turma === null) {
    return falhaDeCampo(
      CAMPOS.matricula.turmaId,
      CODIGOS.turmaNaoEncontrada,
      MENSAGENS.turmaNaoEncontrada,
    );
  }
  const anoLetivo = await anosLetivos.porId(sql, alvo.redeId, alvo.anoLetivoId);
  if (anoLetivo === null) {
    return falhaDeCampo(
      CAMPOS.matricula.anoLetivoId,
      CODIGOS.anoLetivoNaoEncontrado,
      MENSAGENS.anoLetivoNaoEncontrado,
    );
  }
  if (turma.anoLetivoId !== alvo.anoLetivoId) {
    return falhaDeCampo(
      CAMPOS.matricula.turmaId,
      CODIGOS.matricula.turmaDeOutroAno,
      MENSAGENS.matricula.turmaDeOutroAno,
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
      situacao: MATRICULA_ATIVA,
    };
    const criada = await matriculas.inserir(sql, matricula);
    if (!criada) {
      return falhaDeCampo(
        CAMPOS.matricula.alunoId,
        CODIGOS.matricula.ativaDuplicada,
        MENSAGENS.matricula.ativaDuplicada,
      );
    }
    return sucesso(matricula);
  });
}

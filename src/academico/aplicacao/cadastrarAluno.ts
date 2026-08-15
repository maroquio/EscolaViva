import { z } from 'zod';
import { TAMANHO_DA_DATA_ISO } from '../../shared/constantes';
import { unidadeDeTrabalho } from '../../shared/db';
import { clockDoSistema, idGeneratorUuid } from '../../shared/ports';
import {
  errosDeSchema,
  falha,
  falhaDeCampo,
  sucesso,
  type Resultado,
} from '../../shared/resultado';
import { CAMPOS, CODIGOS, LIMITES, MENSAGENS } from '../constantes';
import { idadeEm, type Aluno } from '../dominio/aluno';
import * as alunos from '../infra/alunoRepositorio';

const entrada = z.object({
  redeId: z.string().uuid(),
  nome: z
    .string()
    .trim()
    .min(1, MENSAGENS.aluno.nomeObrigatorio)
    .max(LIMITES.aluno.nome, MENSAGENS.aluno.nomeLongo),
  dataNascimento: z.string().date(MENSAGENS.aluno.dataNascimentoFormato),
});

const hoje = (): string => clockDoSistema.agora().toISOString().slice(0, TAMANHO_DA_DATA_ISO);

export async function cadastrarAluno(e: {
  redeId: string;
  nome: string;
  dataNascimento: string;
}): Promise<Resultado<Aluno>> {
  const validada = entrada.safeParse(e);
  if (!validada.success) return falha(...errosDeSchema(validada.error.issues));

  if (idadeEm(validada.data.dataNascimento, hoje()) < 0) {
    return falhaDeCampo(
      CAMPOS.aluno.dataNascimento,
      CODIGOS.aluno.dataNoFuturo,
      MENSAGENS.aluno.dataNoFuturo,
    );
  }

  const aluno: Aluno = { id: idGeneratorUuid.novo(), ...validada.data };
  await unidadeDeTrabalho(({ sql }) => alunos.inserir(sql, aluno));
  return sucesso(aluno);
}

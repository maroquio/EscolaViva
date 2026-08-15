import { z } from 'zod';
import { unidadeDeTrabalho } from '../../shared/db';
import { idGeneratorUuid } from '../../shared/ports';
import {
  errosDeSchema,
  falha,
  falhaDeCampo,
  sucesso,
  type Resultado,
} from '../../shared/resultado';
import { CAMPOS, CODIGOS, LIMITES, MENSAGENS } from '../constantes';
import type { Disciplina } from '../dominio/disciplina';
import * as disciplinas from '../infra/disciplinaRepositorio';

const entrada = z.object({
  redeId: z.string().uuid(),
  nome: z
    .string()
    .trim()
    .min(1, MENSAGENS.disciplina.nomeObrigatorio)
    .max(LIMITES.disciplina.nome, MENSAGENS.disciplina.nomeLongo),
});

export async function cadastrarDisciplina(e: {
  redeId: string;
  nome: string;
}): Promise<Resultado<Disciplina>> {
  const validada = entrada.safeParse(e);
  if (!validada.success) return falha(...errosDeSchema(validada.error.issues));

  const disciplina: Disciplina = { id: idGeneratorUuid.novo(), ...validada.data };
  const criada = await unidadeDeTrabalho(({ sql }) => disciplinas.inserir(sql, disciplina));
  if (!criada) {
    return falhaDeCampo(
      CAMPOS.disciplina.nome,
      CODIGOS.disciplina.duplicada,
      MENSAGENS.disciplina.duplicada,
    );
  }
  return sucesso(disciplina);
}

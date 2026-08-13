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
import type { Disciplina } from '../dominio/disciplina';
import * as disciplinas from '../infra/disciplinaRepositorio';

const NOME_MAXIMO = 120;

const entrada = z.object({
  redeId: z.string().uuid(),
  nome: z
    .string()
    .trim()
    .min(1, 'Informe o nome da disciplina.')
    .max(NOME_MAXIMO, `O nome precisa ter até ${NOME_MAXIMO} caracteres.`),
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
      'nome',
      'disciplina_duplicada',
      'Esta rede já tem uma disciplina com este nome.',
    );
  }
  return sucesso(disciplina);
}

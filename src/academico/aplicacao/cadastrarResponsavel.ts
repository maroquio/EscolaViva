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
import type { Responsavel } from '../dominio/responsavel';
import * as responsaveis from '../infra/responsavelRepositorio';

const NOME_MAXIMO = 120;
const EMAIL_MAXIMO = 254;
const TELEFONE_MAXIMO = 30;

const entrada = z.object({
  redeId: z.string().uuid(),
  nome: z
    .string()
    .trim()
    .min(1, 'Informe o nome do responsável.')
    .max(NOME_MAXIMO, `O nome precisa ter até ${NOME_MAXIMO} caracteres.`),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Informe um e-mail válido.')
    .max(EMAIL_MAXIMO, `O e-mail precisa ter até ${EMAIL_MAXIMO} caracteres.`),
  // Campo em branco no formulário é ausência de telefone, não um telefone vazio.
  telefone: z
    .string()
    .trim()
    .max(TELEFONE_MAXIMO, `O telefone precisa ter até ${TELEFONE_MAXIMO} caracteres.`)
    .nullish()
    .transform((valor) => (valor === undefined || valor === '' ? null : valor)),
});

export async function cadastrarResponsavel(e: {
  redeId: string;
  nome: string;
  email: string;
  telefone?: string | null;
}): Promise<Resultado<Responsavel>> {
  const validada = entrada.safeParse(e);
  if (!validada.success) return falha(...errosDeSchema(validada.error.issues));

  const responsavel: Responsavel = { id: idGeneratorUuid.novo(), ...validada.data };
  const criado = await unidadeDeTrabalho(({ sql }) => responsaveis.inserir(sql, responsavel));
  if (!criado) {
    return falhaDeCampo(
      'email',
      'email_duplicado',
      'Esta rede já tem um responsável com este e-mail.',
    );
  }
  return sucesso(responsavel);
}

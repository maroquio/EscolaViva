import { z } from 'zod';
import { isValidCpf, normalizeCpf } from '../../shared/document';
import { unitOfWork } from '../../shared/db';
import { uuidIdGenerator } from '../../shared/ports';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CAMPOS, CODIGOS, LIMITES, MENSAGENS } from '../constantes';
import type { Responsavel } from '../dominio/responsavel';
import * as responsaveis from '../infra/responsavelRepositorio';

const entrada = z.object({
  redeId: z.string().uuid(),
  nome: z
    .string()
    .trim()
    .min(1, MENSAGENS.responsavel.nomeObrigatorio)
    .max(LIMITES.responsavel.nome, MENSAGENS.responsavel.nomeLongo),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email(MENSAGENS.responsavel.emailInvalido)
    .max(LIMITES.responsavel.email, MENSAGENS.responsavel.emailLongo),
  telefone: z
    .string()
    .trim()
    .max(LIMITES.responsavel.telefone, MENSAGENS.responsavel.telefoneLongo)
    .nullish()
    .transform((valor) => (valor === undefined || valor === '' ? null : valor)),
  cpf: z
    .string()
    .trim()
    .nullish()
    .transform((valor) => (valor ? normalizeCpf(valor) : null))
    .refine((valor) => valor === null || isValidCpf(valor), MENSAGENS.responsavel.cpfInvalido),
});

export async function cadastrarResponsavel(e: {
  redeId: string;
  nome: string;
  email: string;
  telefone?: string | null;
  cpf?: string | null;
}): Promise<Result<Responsavel>> {
  const validada = entrada.safeParse(e);
  if (!validada.success) return failure(...schemaErrors(validada.error.issues));

  const responsavel: Responsavel = { id: uuidIdGenerator.next(), ...validada.data };
  const criado = await unitOfWork(({ sql }) => responsaveis.inserir(sql, responsavel));
  if (!criado) {
    return fieldFailure(
      CAMPOS.responsavel.email,
      CODIGOS.responsavel.emailDuplicado,
      MENSAGENS.responsavel.emailDuplicado,
    );
  }
  return success(responsavel);
}

import { z } from 'zod';
import { cpfValido, normalizarCpf } from '../../shared/documento';
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
  // Campo em branco no formulário é ausência de telefone, não um telefone vazio.
  telefone: z
    .string()
    .trim()
    .max(LIMITES.responsavel.telefone, MENSAGENS.responsavel.telefoneLongo)
    .nullish()
    .transform((valor) => (valor === undefined || valor === '' ? null : valor)),
  // Campo em branco é ausência de CPF, não CPF vazio: o responsável estrangeiro existe como
  // contato e simplesmente não pode receber acesso ao portal enquanto não informar o documento.
  cpf: z
    .string()
    .trim()
    .nullish()
    .transform((valor) => (valor ? normalizarCpf(valor) : null))
    .refine((valor) => valor === null || cpfValido(valor), MENSAGENS.responsavel.cpfInvalido),
});

export async function cadastrarResponsavel(e: {
  redeId: string;
  nome: string;
  email: string;
  telefone?: string | null;
  cpf?: string | null;
}): Promise<Resultado<Responsavel>> {
  const validada = entrada.safeParse(e);
  if (!validada.success) return falha(...errosDeSchema(validada.error.issues));

  const responsavel: Responsavel = { id: idGeneratorUuid.novo(), ...validada.data };
  const criado = await unidadeDeTrabalho(({ sql }) => responsaveis.inserir(sql, responsavel));
  if (!criado) {
    return falhaDeCampo(
      CAMPOS.responsavel.email,
      CODIGOS.responsavel.emailDuplicado,
      MENSAGENS.responsavel.emailDuplicado,
    );
  }
  return sucesso(responsavel);
}

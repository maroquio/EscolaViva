import { z } from 'zod';
import { reader, unitOfWork } from '../../shared/db';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CAMPOS, CODIGOS, MENSAGENS } from '../constants';
import { TAMANHO_MINIMO_DE_SENHA } from '../domain/user';
import * as usuarioRepositorio from '../infra/userRepository';

const schema = z.object({
  usuarioId: z.string().uuid(MENSAGENS.senha.usuarioInvalido),
  senhaAtual: z.string().min(1, MENSAGENS.senha.atualObrigatoria),
  senhaNova: z
    .string()
    .min(TAMANHO_MINIMO_DE_SENHA, MENSAGENS.senha.novaCurta(TAMANHO_MINIMO_DE_SENHA)),
});

export async function trocarSenha(entrada: {
  usuarioId: string;
  senhaAtual: string;
  senhaNova: string;
}): Promise<Result<void>> {
  const analise = schema.safeParse(entrada);
  if (!analise.success) return failure(...schemaErrors(analise.error.issues));
  const dados = analise.data;

  const credenciais = await usuarioRepositorio.credenciaisPorId(reader(), dados.usuarioId);
  if (credenciais === null) {
    return failure({
      codigo: CODIGOS.usuarioInexistente,
      mensagem: MENSAGENS.senha.usuarioInexistente,
    });
  }

  const confere = await Bun.password.verify(dados.senhaAtual, credenciais.senhaHash);
  if (!confere) {
    return fieldFailure(CAMPOS.senha.atual, CODIGOS.senhaIncorreta, MENSAGENS.senha.atualNaoConfere);
  }

  const senhaHash = await Bun.password.hash(dados.senhaNova);
  await unitOfWork(async ({ sql }) => {
    await usuarioRepositorio.atualizarSenha(
      sql,
      credenciais.usuario.redeId,
      credenciais.usuario.id,
      senhaHash,
    );
  });
  return success<void>(undefined);
}

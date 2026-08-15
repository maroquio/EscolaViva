import { z } from 'zod';
import { leitura, unidadeDeTrabalho } from '../../shared/db';
import { errosDeSchema, falha, falhaDeCampo, sucesso, type Resultado } from '../../shared/resultado';
import { CAMPOS, CODIGOS, MENSAGENS } from '../constantes';
import { TAMANHO_MINIMO_DE_SENHA } from '../dominio/usuario';
import * as usuarioRepositorio from '../infra/usuarioRepositorio';

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
}): Promise<Resultado<void>> {
  const analise = schema.safeParse(entrada);
  if (!analise.success) return falha(...errosDeSchema(analise.error.issues));
  const dados = analise.data;

  const credenciais = await usuarioRepositorio.credenciaisPorId(leitura(), dados.usuarioId);
  if (credenciais === null) {
    return falha({
      codigo: CODIGOS.usuarioInexistente,
      mensagem: MENSAGENS.senha.usuarioInexistente,
    });
  }

  const confere = await Bun.password.verify(dados.senhaAtual, credenciais.senhaHash);
  if (!confere) {
    return falhaDeCampo(CAMPOS.senha.atual, CODIGOS.senhaIncorreta, MENSAGENS.senha.atualNaoConfere);
  }

  const senhaHash = await Bun.password.hash(dados.senhaNova);
  await unidadeDeTrabalho(async ({ sql }) => {
    await usuarioRepositorio.atualizarSenha(
      sql,
      credenciais.usuario.redeId,
      credenciais.usuario.id,
      senhaHash,
    );
  });
  return sucesso<void>(undefined);
}

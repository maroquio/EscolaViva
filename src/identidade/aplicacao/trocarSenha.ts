import { z } from 'zod';
import { leitura, unidadeDeTrabalho } from '../../shared/db';
import { errosDeSchema, falha, falhaDeCampo, sucesso, type Resultado } from '../../shared/resultado';
import { TAMANHO_MINIMO_DE_SENHA } from '../dominio/usuario';
import * as usuarioRepositorio from '../infra/usuarioRepositorio';

const schema = z.object({
  usuarioId: z.string().uuid('usuário inválido'),
  senhaAtual: z.string().min(1, 'informe a senha atual'),
  senhaNova: z
    .string()
    .min(TAMANHO_MINIMO_DE_SENHA, `a senha nova precisa de ao menos ${TAMANHO_MINIMO_DE_SENHA} caracteres`),
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
    return falha({ codigo: 'usuario_inexistente', mensagem: 'usuário não encontrado' });
  }

  const confere = await Bun.password.verify(dados.senhaAtual, credenciais.senhaHash);
  if (!confere) {
    return falhaDeCampo('senhaAtual', 'senha_incorreta', 'a senha atual não confere');
  }

  // Gerar o hash custa cerca de cem milissegundos: fica fora da transação para não segurar
  // conexão do pool durante um cálculo que não depende do banco.
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

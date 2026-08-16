import { z } from 'zod';
import { config } from '../../shared/config';
import { leitura, unidadeDeTrabalho } from '../../shared/db';
import { normalizarCpf } from '../../shared/document';
import { logger } from '../../shared/log';
import { clockDoSistema, idGeneratorUuid } from '../../shared/ports';
import {
  errosDeSchema,
  falha,
  falhaDeCampo,
  sucesso,
  type Resultado,
} from '../../shared/result';
import { CAMPOS, CODIGOS, EVENTOS_DE_LOG, MENSAGENS, SEGURANCA } from '../constantes';
import { redeAtiva } from '../dominio/rede';
import { expiracaoDaSessao, type Sessao } from '../dominio/sessao';
import { usuarioAutenticado, type UsuarioAutenticado } from '../dominio/usuario';
import * as redeRepositorio from '../infra/redeRepositorio';
import * as sessaoRepositorio from '../infra/sessaoRepositorio';
import * as usuarioRepositorio from '../infra/usuarioRepositorio';

const schema = z.object({
  redeSlug: z.string().trim().min(1, MENSAGENS.login.redeObrigatoria),
  identificador: z.string().trim().min(1, MENSAGENS.login.cpfObrigatorio),
  senha: z.string().min(1, MENSAGENS.login.senhaObrigatoria),
  ip: z.string(),
});

const CREDENCIAIS_INVALIDAS = {
  codigo: CODIGOS.credenciaisInvalidas,
  mensagem: MENSAGENS.login.credenciaisInvalidas,
};

async function criarSessao(redeId: string, usuarioId: string, ip: string): Promise<Sessao> {
  const agora = clockDoSistema.agora();
  const sessao: Sessao = {
    id: idGeneratorUuid.novo(),
    redeId,
    usuarioId,
    criadoEm: agora,
    expiraEm: expiracaoDaSessao(agora, config.sessaoDuracaoHoras),
    ip: ip === '' ? null : ip,
  };
  await unidadeDeTrabalho(async ({ sql }) => {
    await sessaoRepositorio.inserir(sql, sessao);
  });
  return sessao;
}

export async function autenticar(entrada: {
  redeSlug: string;
  identificador: string;
  senha: string;
  ip: string;
}): Promise<Resultado<{ sessaoId: string; usuario: UsuarioAutenticado }>> {
  const analise = schema.safeParse(entrada);
  if (!analise.success) return falha(...errosDeSchema(analise.error.issues));
  const dados = analise.data;

  const sql = leitura();
  const rede = await redeRepositorio.porSlug(sql, dados.redeSlug);
  if (rede === null || !redeAtiva(rede)) {
    return falhaDeCampo(
      CAMPOS.login.redeSlug,
      CODIGOS.redeIndisponivel,
      MENSAGENS.login.redeIndisponivel,
    );
  }

  const credenciais = await usuarioRepositorio.credenciaisPorCpf(
    sql,
    rede.id,
    normalizarCpf(dados.identificador),
  );
  const senhaConfere = await Bun.password.verify(
    dados.senha,
    credenciais?.senhaHash ?? SEGURANCA.hashDeUsuarioInexistente,
  );
  if (credenciais === null || !senhaConfere) {
    logger.warn({ rede_id: rede.id }, EVENTOS_DE_LOG.autenticacaoRecusada);
    return falha(CREDENCIAIS_INVALIDAS);
  }

  const papeis = await usuarioRepositorio.papeisDoUsuario(sql, rede.id, credenciais.usuario.id);
  const sessao = await criarSessao(rede.id, credenciais.usuario.id, dados.ip);
  logger.info({ rede_id: rede.id, usuario_id: sessao.usuarioId }, EVENTOS_DE_LOG.sessaoAberta);
  return sucesso({
    sessaoId: sessao.id,
    usuario: usuarioAutenticado(credenciais.usuario, rede, papeis),
  });
}

import { z } from 'zod';
import { config } from '../../shared/config';
import { reader, unitOfWork } from '../../shared/db';
import { normalizeCpf } from '../../shared/document';
import { logger } from '../../shared/log';
import { systemClock, uuidIdGenerator } from '../../shared/ports';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CAMPOS, CODIGOS, EVENTOS_DE_LOG, MENSAGENS, SEGURANCA } from '../constants';
import { redeAtiva } from '../domain/network';
import { expiracaoDaSessao, type Sessao } from '../domain/session';
import { usuarioAutenticado, type UsuarioAutenticado } from '../domain/user';
import * as redeRepositorio from '../infra/networkRepository';
import * as sessaoRepositorio from '../infra/sessionRepository';
import * as usuarioRepositorio from '../infra/userRepository';

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
  const agora = systemClock.now();
  const sessao: Sessao = {
    id: uuidIdGenerator.next(),
    redeId,
    usuarioId,
    criadoEm: agora,
    expiraEm: expiracaoDaSessao(agora, config.sessionDurationHours),
    ip: ip === '' ? null : ip,
  };
  await unitOfWork(async ({ sql }) => {
    await sessaoRepositorio.inserir(sql, sessao);
  });
  return sessao;
}

export async function autenticar(entrada: {
  redeSlug: string;
  identificador: string;
  senha: string;
  ip: string;
}): Promise<Result<{ sessaoId: string; usuario: UsuarioAutenticado }>> {
  const analise = schema.safeParse(entrada);
  if (!analise.success) return failure(...schemaErrors(analise.error.issues));
  const dados = analise.data;

  const sql = reader();
  const rede = await redeRepositorio.porSlug(sql, dados.redeSlug);
  if (rede === null || !redeAtiva(rede)) {
    return fieldFailure(
      CAMPOS.login.redeSlug,
      CODIGOS.redeIndisponivel,
      MENSAGENS.login.redeIndisponivel,
    );
  }

  const credenciais = await usuarioRepositorio.credenciaisPorCpf(
    sql,
    rede.id,
    normalizeCpf(dados.identificador),
  );
  const senhaConfere = await Bun.password.verify(
    dados.senha,
    credenciais?.senhaHash ?? SEGURANCA.hashDeUsuarioInexistente,
  );
  if (credenciais === null || !senhaConfere) {
    logger.warn({ network_id: rede.id }, EVENTOS_DE_LOG.autenticacaoRecusada);
    return failure(CREDENCIAIS_INVALIDAS);
  }

  const papeis = await usuarioRepositorio.papeisDoUsuario(sql, rede.id, credenciais.usuario.id);
  const sessao = await criarSessao(rede.id, credenciais.usuario.id, dados.ip);
  logger.info({ network_id: rede.id, user_id: sessao.usuarioId }, EVENTOS_DE_LOG.sessaoAberta);
  return success({
    sessaoId: sessao.id,
    usuario: usuarioAutenticado(credenciais.usuario, rede, papeis),
  });
}

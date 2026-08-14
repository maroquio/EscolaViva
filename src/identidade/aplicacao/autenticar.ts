import { z } from 'zod';
import { config } from '../../shared/config';
import { leitura, unidadeDeTrabalho, type Conexao } from '../../shared/db';
import { normalizarCpf } from '../../shared/documento';
import { logger } from '../../shared/log';
import { clockDoSistema, idGeneratorUuid } from '../../shared/ports';
import {
  errosDeSchema,
  falha,
  falhaDeCampo,
  sucesso,
  type Resultado,
} from '../../shared/resultado';
import { redeAtiva } from '../dominio/rede';
import { expiracaoDaSessao, type Sessao } from '../dominio/sessao';
import { emailNormalizado, usuarioAutenticado, type UsuarioAutenticado } from '../dominio/usuario';
import * as redeRepositorio from '../infra/redeRepositorio';
import * as sessaoRepositorio from '../infra/sessaoRepositorio';
import type { Credenciais } from '../infra/usuarioRepositorio';
import * as usuarioRepositorio from '../infra/usuarioRepositorio';

const schema = z.object({
  redeSlug: z.string().trim().min(1, 'informe a rede'),
  identificador: z.string().trim().min(1, 'informe o CPF'),
  senha: z.string().min(1, 'informe a senha'),
  ip: z.string(),
});

/**
 * Hash fixo conferido quando ninguém é encontrado pelo identificador informado (CPF ou e-mail).
 * Sem ele a resposta volta em um milissegundo para identificador desconhecido e em cerca de cem
 * para identificador cadastrado, e o relógio passa a responder quem estuda ou trabalha na rede.
 */
const HASH_DE_USUARIO_INEXISTENTE =
  '$argon2id$v=19$m=65536,t=2,p=1$XMdb31Dd1P5tOekJsaneq6Yl0CU6HnbV15d11ekBprQ$jxM302vDpER0f7uF9xQRIwAkDNaDTukAT0y3bg04lhQ';

/** Uma única mensagem para identificador inexistente e para senha errada: a tela não é um oráculo. */
const CREDENCIAIS_INVALIDAS = {
  codigo: 'credenciais_invalidas',
  mensagem: 'CPF ou senha inválidos',
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

/**
 * Na janela de compatibilidade o mesmo campo aceita as duas formas, e a arroba decide: e-mail
 * tem, CPF não. Some na FASE B, quando todo usuário já tem CPF.
 */
const credenciaisDe = async (
  sql: Conexao,
  redeId: string,
  identificador: string,
): Promise<Credenciais | null> =>
  identificador.includes('@')
    ? await usuarioRepositorio.credenciaisPorEmail(sql, redeId, emailNormalizado(identificador))
    : await usuarioRepositorio.credenciaisPorCpf(sql, redeId, normalizarCpf(identificador));

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
  // A rede é dita pelo próprio usuário na tela e não é segredo; esconder que ela está suspensa
  // só transformaria uma cobrança em atraso em chamado de "minha senha parou de funcionar".
  if (rede === null || !redeAtiva(rede)) {
    return falhaDeCampo('redeSlug', 'rede_indisponivel', 'rede não encontrada ou fora de operação');
  }

  const credenciais = await credenciaisDe(sql, rede.id, dados.identificador);
  const senhaConfere = await Bun.password.verify(
    dados.senha,
    credenciais?.senhaHash ?? HASH_DE_USUARIO_INEXISTENTE,
  );
  if (credenciais === null || !senhaConfere) {
    logger.warn({ rede_id: rede.id }, 'tentativa de autenticação recusada');
    return falha(CREDENCIAIS_INVALIDAS);
  }

  const papeis = await usuarioRepositorio.papeisDoUsuario(sql, rede.id, credenciais.usuario.id);
  const sessao = await criarSessao(rede.id, credenciais.usuario.id, dados.ip);
  logger.info({ rede_id: rede.id, usuario_id: sessao.usuarioId }, 'sessão aberta');
  return sucesso({
    sessaoId: sessao.id,
    usuario: usuarioAutenticado(credenciais.usuario, rede, papeis),
  });
}

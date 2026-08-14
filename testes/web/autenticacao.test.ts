/*
 * I2 — entrar, continuar entrado e sair.
 *
 * O processo não guarda sessão em memória: o cookie assinado carrega apenas o id e quem responde
 * quem é o usuário é a tabela `sessao`, a cada requisição. Os casos abaixo cobrem as quatro coisas
 * que isso implica — o cookie que a aplicação emite, o cookie que ela recusa, a tela que não conta
 * quem existe e o logout que apaga a linha, e não só o cookie.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { limparBanco, sqlDeTeste } from '../apoio/banco';
import { cenarioCompleto, criarRede, criarUsuario, SENHA_PADRAO } from '../apoio/fabricas';
import { abrir, cookieDaResposta, entrar, enviar, postar } from './apoio';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Duas telas de login só podem diferir no que a pessoa digitou — nunca no que o banco tem. */
const semValoresVolateis = (html: string, ...emails: string[]): string =>
  emails
    .reduce((texto, email) => texto.replaceAll(email, 'E-MAIL'), html)
    .replace(UUID, 'IDENTIFICADOR');

/** Troca o primeiro caractere do id assinado: mesma forma, assinatura que não confere mais. */
const adulterar = (cookie: string): string => {
  const separador = cookie.indexOf('=');
  const nome = cookie.slice(0, separador);
  const valor = cookie.slice(separador + 1);
  const trocado = valor.startsWith('a') ? 'b' : 'a';
  return `${nome}=${trocado}${valor.slice(1)}`;
};

const sessoesGravadas = async (usuarioId: string): Promise<number> => {
  const linhas = await sqlDeTeste()<{ total: string }[]>`
    SELECT count(*)::text AS total FROM sessao WHERE usuario_id = ${usuarioId}`;
  return Number(linhas[0]?.total ?? '0');
};

describe('autenticação', () => {
  beforeEach(async () => {
    await limparBanco();
  });

  test('credenciais válidas levam ao painel com 303', async () => {
    const cenario = await cenarioCompleto();

    const resposta = await enviar('/login', {
      redeSlug: cenario.rede.slug,
      identificador: cenario.secretaria.email,
      senha: cenario.senha,
    });

    expect(resposta.status).toBe(303);
    expect(resposta.headers.get('Location')).toBe('/painel');
  });

  test('o cookie de sessão é HttpOnly, SameSite=Lax e vale para todo o site', async () => {
    const cenario = await cenarioCompleto();

    const resposta = await enviar('/login', {
      redeSlug: cenario.rede.slug,
      identificador: cenario.secretaria.email,
      senha: cenario.senha,
    });
    const cabecalho = resposta.headers.get('Set-Cookie') ?? '';

    expect(cabecalho).toContain('ev_sessao=');
    expect(cabecalho).toContain('HttpOnly');
    expect(cabecalho).toContain('SameSite=Lax');
    expect(cabecalho).toContain('Path=/');
  });

  test('o cookie carrega apenas o id da sessão gravada, e não o usuário', async () => {
    const cenario = await cenarioCompleto();

    const cookie = await entrar({
      redeSlug: cenario.rede.slug,
      email: cenario.secretaria.email,
      senha: cenario.senha,
    });
    const linhas = await sqlDeTeste()<{ id: string }[]>`
      SELECT id::text FROM sessao WHERE usuario_id = ${cenario.secretaria.id}`;
    const sessaoId = linhas[0]?.id ?? '';

    expect(linhas).toHaveLength(1);
    expect(decodeURIComponent(cookie)).toContain(sessaoId);
    expect(cookie).not.toContain(cenario.secretaria.email);
  });

  test('senha errada volta para a tela de entrada sem abrir sessão', async () => {
    const cenario = await cenarioCompleto();

    const resposta = await enviar('/login', {
      redeSlug: cenario.rede.slug,
      identificador: cenario.secretaria.email,
      senha: 'senha-que-nao-e-a-dele',
    });

    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('Set-Cookie')).toBeNull();
    expect(await sessoesGravadas(cenario.secretaria.id)).toBe(0);
  });

  test('e-mail desconhecido e senha errada devolvem a mesma tela', async () => {
    const cenario = await cenarioCompleto();
    const desconhecido = 'nunca-cadastrada@escolaviva.test';

    const comSenhaErrada = await enviar('/login', {
      redeSlug: cenario.rede.slug,
      identificador: cenario.secretaria.email,
      senha: 'senha-que-nao-e-a-dele',
    });
    const comEmailInexistente = await enviar('/login', {
      redeSlug: cenario.rede.slug,
      identificador: desconhecido,
      senha: 'senha-que-nao-e-a-dele',
    });
    const primeira = semValoresVolateis(await comSenhaErrada.text(), cenario.secretaria.email);
    const segunda = semValoresVolateis(await comEmailInexistente.text(), desconhecido);

    expect(comEmailInexistente.status).toBe(comSenhaErrada.status);
    expect(segunda).toBe(primeira);
    expect(primeira).toContain('CPF ou senha inválidos');
  });

  test('usuário de outra rede não entra pelo slug errado', async () => {
    const cenario = await cenarioCompleto();
    const outra = await criarRede({});
    await criarUsuario({ redeId: outra.id, senha: SENHA_PADRAO });

    const resposta = await enviar('/login', {
      redeSlug: outra.slug,
      identificador: cenario.secretaria.email,
      senha: cenario.senha,
    });

    expect(resposta.status).toBe(200);
    expect(await sessoesGravadas(cenario.secretaria.id)).toBe(0);
  });

  test('rota autenticada sem cookie redireciona para o login', async () => {
    const resposta = await abrir('/secretaria');

    expect(resposta.status).toBe(303);
    expect(resposta.headers.get('Location')).toBe('/login');
  });

  test('escrita sem cookie é recusada em vez de redirecionada', async () => {
    const resposta = await enviar('/secretaria/disciplinas', { nome: 'Filosofia' });

    expect(resposta.status).toBe(401);
  });

  test('cookie com assinatura adulterada não abre rota autenticada', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrar({
      redeSlug: cenario.rede.slug,
      email: cenario.secretaria.email,
      senha: cenario.senha,
    });

    const comCookieBom = await abrir('/secretaria', cookie);
    const comCookieAdulterado = await abrir('/secretaria', adulterar(cookie));

    expect(comCookieBom.status).toBe(200);
    expect(comCookieAdulterado.status).toBe(303);
    expect(comCookieAdulterado.headers.get('Location')).toBe('/login');
  });

  test('cookie inventado, sem assinatura nenhuma, não abre rota autenticada', async () => {
    const resposta = await abrir('/secretaria', `ev_sessao=${crypto.randomUUID()}`);

    expect(resposta.status).toBe(303);
    expect(resposta.headers.get('Location')).toBe('/login');
  });

  test('sair apaga a sessão do banco, e não apenas o cookie do navegador', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrar({
      redeSlug: cenario.rede.slug,
      email: cenario.secretaria.email,
      senha: cenario.senha,
    });

    const saida = await postar('/logout', {}, cookie);
    const depois = await abrir('/secretaria', cookie);

    expect(saida.status).toBe(303);
    expect(await sessoesGravadas(cenario.secretaria.id)).toBe(0);
    expect(depois.status).toBe(303);
    expect(depois.headers.get('Location')).toBe('/login');
  });

  test('sair também manda o navegador descartar o cookie', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrar({
      redeSlug: cenario.rede.slug,
      email: cenario.secretaria.email,
      senha: cenario.senha,
    });

    const saida = await postar('/logout', {}, cookie);
    const descartado = cookieDaResposta(saida);

    expect(descartado).toBe('ev_sessao=');
  });

  test('quem já entrou não vê o formulário de entrada de novo', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrar({
      redeSlug: cenario.rede.slug,
      email: cenario.secretaria.email,
      senha: cenario.senha,
    });

    const resposta = await abrir('/login', cookie);

    expect(resposta.status).toBe(303);
    expect(resposta.headers.get('Location')).toBe('/painel');
  });

  test('a raiz leva ao login sem sessão e ao painel com sessão', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrar({
      redeSlug: cenario.rede.slug,
      email: cenario.secretaria.email,
      senha: cenario.senha,
    });

    const anonima = await abrir('/');
    const autenticada = await abrir('/', cookie);

    expect(anonima.headers.get('Location')).toBe('/login');
    expect(autenticada.headers.get('Location')).toBe('/painel');
  });
});

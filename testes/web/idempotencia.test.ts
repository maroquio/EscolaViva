/*
 * I4 — o navegador é entrada externa.
 *
 * Um responsável em 4G ruim toca duas vezes em "enviar" e o sistema recebe duas requisições
 * idênticas. A chave nasce no render do formulário, viaja em campo oculto e é gravada antes do
 * processamento: quem chega depois com a mesma chave encontra o conflito e é levado ao resultado
 * da primeira sem reprocessar nada. Dois cliques no mesmo botão são um registro; dois
 * carregamentos da tela são duas chaves e, portanto, dois registros — que é o que a pessoa pediu.
 *
 * A outra metade da regra é a devolução: quando o formulário volta com erro de validação, a chave
 * é liberada. Sem isso, corrigir um campo exigiria recarregar a página.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { limparBanco, sqlDeTeste } from '../apoio/banco';
import { cenarioCompleto, type Cenario } from '../apoio/fabricas';
import { abrir, entrar, enviar, postar } from './apoio';

const ROTA = '/secretaria/disciplinas';
const CHAVE_DE_UUID = /name="_chave" value="([0-9a-f-]{36})"/g;

const chavesDaPagina = (html: string): string[] =>
  [...html.matchAll(CHAVE_DE_UUID)].flatMap((encontro) =>
    encontro[1] === undefined ? [] : [encontro[1]],
  );

const entrarComoSecretaria = (cenario: Cenario): Promise<string> =>
  entrar({
    redeSlug: cenario.rede.slug,
    cpf: cenario.secretaria.cpf,
    senha: cenario.senha,
  });

const disciplinasChamadas = async (redeId: string, nome: string): Promise<number> => {
  const linhas = await sqlDeTeste()<{ total: string }[]>`
    SELECT count(*)::text AS total FROM disciplina WHERE rede_id = ${redeId} AND nome = ${nome}`;
  return Number(linhas[0]?.total ?? '0');
};

const chavesGravadas = async (): Promise<number> => {
  const linhas = await sqlDeTeste()<{ total: string }[]>`
    SELECT count(*)::text AS total FROM requisicao_idempotente`;
  return Number(linhas[0]?.total ?? '0');
};

describe('idempotência de formulário', () => {
  beforeEach(async () => {
    await limparBanco();
  });

  test('escrita sem chave de idempotência é recusada com 400', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComoSecretaria(cenario);

    const resposta = await postar(ROTA, { nome: 'Geografia' }, cookie);

    expect(resposta.status).toBe(400);
    expect(await disciplinasChamadas(cenario.rede.id, 'Geografia')).toBe(0);
  });

  test('chave fora do formato de uuid é recusada com 400', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComoSecretaria(cenario);

    const resposta = await postar(ROTA, { _chave: 'chave-inventada', nome: 'Geografia' }, cookie);

    expect(resposta.status).toBe(400);
    expect(await disciplinasChamadas(cenario.rede.id, 'Geografia')).toBe(0);
  });

  test('o mesmo formulário enviado duas vezes cria um único registro', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComoSecretaria(cenario);
    const campos = { _chave: crypto.randomUUID(), nome: 'Geografia' };

    const primeira = await postar(ROTA, campos, cookie);
    const segunda = await postar(ROTA, campos, cookie);

    expect(primeira.status).toBe(303);
    expect(segunda.status).toBe(303);
    expect(await disciplinasChamadas(cenario.rede.id, 'Geografia')).toBe(1);
  });

  test('o reenvio leva ao mesmo destino da primeira submissão', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComoSecretaria(cenario);
    const campos = { _chave: crypto.randomUUID(), nome: 'Geografia' };

    const primeira = await postar(ROTA, campos, cookie);
    const segunda = await postar(ROTA, campos, cookie);

    expect(segunda.headers.get('Location')).toBe(primeira.headers.get('Location'));
  });

  test('chaves diferentes criam dois registros', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComoSecretaria(cenario);

    await enviar(ROTA, { nome: 'Geografia' }, cookie);
    await enviar(ROTA, { nome: 'Artes' }, cookie);

    expect(await disciplinasChamadas(cenario.rede.id, 'Geografia')).toBe(1);
    expect(await disciplinasChamadas(cenario.rede.id, 'Artes')).toBe(1);
  });

  test('a chave é registrada com o destino gravado, e não com a resposta inteira', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComoSecretaria(cenario);
    const chave = crypto.randomUUID();

    const resposta = await postar(ROTA, { _chave: chave, nome: 'Geografia' }, cookie);
    const linhas = await sqlDeTeste()<{ rota: string; resposta_local: string }[]>`
      SELECT rota, resposta_local FROM requisicao_idempotente WHERE chave = ${chave}`;

    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.rota).toBe(ROTA);
    expect(linhas[0]?.resposta_local).toBe(resposta.headers.get('Location') ?? '');
  });

  test('formulário recusado na validação devolve a chave para a correção', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComoSecretaria(cenario);
    const chave = crypto.randomUUID();

    const recusada = await postar(ROTA, { _chave: chave, nome: '' }, cookie);
    const chavesApos = await chavesGravadas();
    const corrigida = await postar(ROTA, { _chave: chave, nome: 'Geografia' }, cookie);

    expect(recusada.status).toBe(200);
    expect(chavesApos).toBe(0);
    expect(corrigida.status).toBe(303);
    expect(await disciplinasChamadas(cenario.rede.id, 'Geografia')).toBe(1);
  });

  test('cada carregamento do formulário traz uma chave nova', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComoSecretaria(cenario);

    const primeira = chavesDaPagina(await (await abrir(ROTA, cookie)).text());
    const segunda = chavesDaPagina(await (await abrir(ROTA, cookie)).text());

    expect(primeira.length).toBeGreaterThan(0);
    expect(segunda.length).toBe(primeira.length);
    expect(primeira.some((chave) => segunda.includes(chave))).toBe(false);
  });

  test('a chave de uma pessoa não bloqueia o formulário de outra', async () => {
    const cenario = await cenarioCompleto();
    const outraRede = await cenarioCompleto();
    const chave = crypto.randomUUID();

    const daPrimeira = await postar(
      ROTA,
      { _chave: chave, nome: 'Geografia' },
      await entrarComoSecretaria(cenario),
    );
    const daSegunda = await postar(
      ROTA,
      { _chave: crypto.randomUUID(), nome: 'Geografia' },
      await entrarComoSecretaria(outraRede),
    );

    expect(daPrimeira.status).toBe(303);
    expect(daSegunda.status).toBe(303);
    expect(await disciplinasChamadas(cenario.rede.id, 'Geografia')).toBe(1);
    expect(await disciplinasChamadas(outraRede.rede.id, 'Geografia')).toBe(1);
  });
});

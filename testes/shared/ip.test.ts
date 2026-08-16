/*
 * I12: `X-Forwarded-For` é escrito por qualquer cliente. Sem proxy confiável declarado, acreditar
 * nele é deixar o usuário escolher o próprio IP — e o IP vai para a tabela de sessão. Com proxies
 * declarados, a cadeia é lida da direita para a esquerda: o primeiro salto que não é nosso é o
 * cliente.
 */

import { describe, expect, test } from 'bun:test';
import { clientIp } from '../../src/shared/http/ip';

const REMOTO = '198.51.100.10';
const PROXY_DA_BORDA = '10.0.0.1';
const PROXY_INTERNO = '10.0.0.2';
const CLIENTE = '203.0.113.7';

function requisicaoCom(cabecalhos: Record<string, string>): Request {
  return new Request('http://escolaviva.test/login', { headers: cabecalhos });
}

describe('clientIp — sem proxy confiável', () => {
  test('ignora X-Forwarded-For e devolve o endereço remoto', () => {
    const requisicao = requisicaoCom({ 'X-Forwarded-For': '1.2.3.4' });

    const ip = clientIp(requisicao, REMOTO, []);

    expect(ip).toBe(REMOTO);
  });

  test('ignora uma cadeia inteira forjada pelo cliente', () => {
    const requisicao = requisicaoCom({ 'X-Forwarded-For': `${CLIENTE}, 1.2.3.4, 5.6.7.8` });

    const ip = clientIp(requisicao, REMOTO, []);

    expect(ip).toBe(REMOTO);
  });

  test('sem cabeçalho nenhum devolve o endereço remoto', () => {
    const requisicao = requisicaoCom({});

    const ip = clientIp(requisicao, REMOTO, []);

    expect(ip).toBe(REMOTO);
  });

  test('endereço remoto desconhecido vira string vazia em vez de quebrar', () => {
    const requisicao = requisicaoCom({ 'X-Forwarded-For': CLIENTE });

    const ip = clientIp(requisicao, undefined, []);

    expect(ip).toBe('');
  });
});

describe('clientIp — com proxy confiável', () => {
  test('devolve o endereço à esquerda do proxy confiável', () => {
    const requisicao = requisicaoCom({ 'X-Forwarded-For': `${CLIENTE}, ${PROXY_DA_BORDA}` });

    const ip = clientIp(requisicao, PROXY_DA_BORDA, [PROXY_DA_BORDA]);

    expect(ip).toBe(CLIENTE);
  });

  test('descarta todos os saltos confiáveis da direita para a esquerda', () => {
    const requisicao = requisicaoCom({
      'X-Forwarded-For': `${CLIENTE}, ${PROXY_INTERNO}, ${PROXY_DA_BORDA}`,
    });

    const ip = clientIp(requisicao, PROXY_DA_BORDA, [PROXY_DA_BORDA, PROXY_INTERNO]);

    expect(ip).toBe(CLIENTE);
  });

  test('para no primeiro salto não confiável, mesmo com endereço forjado mais à esquerda', () => {
    const requisicao = requisicaoCom({
      'X-Forwarded-For': `1.2.3.4, ${CLIENTE}, ${PROXY_DA_BORDA}`,
    });

    const ip = clientIp(requisicao, PROXY_DA_BORDA, [PROXY_DA_BORDA]);

    expect(ip).toBe(CLIENTE);
  });

  test('cadeia formada só por proxies confiáveis cai no endereço remoto', () => {
    const requisicao = requisicaoCom({
      'X-Forwarded-For': `${PROXY_INTERNO}, ${PROXY_DA_BORDA}`,
    });

    const ip = clientIp(requisicao, PROXY_DA_BORDA, [PROXY_DA_BORDA, PROXY_INTERNO]);

    expect(ip).toBe(PROXY_DA_BORDA);
  });

  test('sem o cabeçalho devolve o endereço remoto', () => {
    const requisicao = requisicaoCom({});

    const ip = clientIp(requisicao, REMOTO, [PROXY_DA_BORDA]);

    expect(ip).toBe(REMOTO);
  });

  test('apara os espaços em volta de cada endereço da cadeia', () => {
    const requisicao = requisicaoCom({
      'X-Forwarded-For': `   ${CLIENTE}   ,   ${PROXY_DA_BORDA}   `,
    });

    const ip = clientIp(requisicao, PROXY_DA_BORDA, [PROXY_DA_BORDA]);

    expect(ip).toBe(CLIENTE);
  });

  test('apara os espaços da lista de proxies confiáveis', () => {
    const requisicao = requisicaoCom({ 'X-Forwarded-For': `${CLIENTE}, ${PROXY_DA_BORDA}` });

    const ip = clientIp(requisicao, PROXY_DA_BORDA, [`  ${PROXY_DA_BORDA}  `]);

    expect(ip).toBe(CLIENTE);
  });

  test('lê o cabeçalho independentemente da caixa do nome', () => {
    const requisicao = requisicaoCom({ 'x-forwarded-for': `${CLIENTE}, ${PROXY_DA_BORDA}` });

    const ip = clientIp(requisicao, PROXY_DA_BORDA, [PROXY_DA_BORDA]);

    expect(ip).toBe(CLIENTE);
  });
});

describe('clientIp — cabeçalho vazio ou com lixo', () => {
  test('cabeçalho vazio devolve o endereço remoto', () => {
    const requisicao = requisicaoCom({ 'X-Forwarded-For': '' });

    const ip = clientIp(requisicao, REMOTO, [PROXY_DA_BORDA]);

    expect(ip).toBe(REMOTO);
  });

  test('cabeçalho só com vírgulas e espaços devolve o endereço remoto', () => {
    const requisicao = requisicaoCom({ 'X-Forwarded-For': ' , ,, ' });

    const ip = clientIp(requisicao, REMOTO, [PROXY_DA_BORDA]);

    expect(ip).toBe(REMOTO);
  });

  test('cabeçalho com texto que não é endereço não quebra e é devolvido como veio', () => {
    const requisicao = requisicaoCom({ 'X-Forwarded-For': 'lixo-qualquer' });

    const ip = clientIp(requisicao, REMOTO, [PROXY_DA_BORDA]);

    expect(ip).toBe('lixo-qualquer');
  });

  test('cabeçalho com lixo é ignorado quando não há proxy confiável', () => {
    const requisicao = requisicaoCom({ 'X-Forwarded-For': 'lixo-qualquer' });

    const ip = clientIp(requisicao, REMOTO, []);

    expect(ip).toBe(REMOTO);
  });
});

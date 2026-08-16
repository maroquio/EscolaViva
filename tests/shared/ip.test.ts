/*
 * I12: `X-Forwarded-For` é escrito por qualquer cliente. Sem proxy confiável declarado, acreditar
 * nele é deixar o usuário escolher o próprio IP — e o IP vai para a tabela de sessão. Com proxies
 * declarados, a cadeia é lida da direita para a esquerda: o primeiro salto que não é nosso é o
 * cliente.
 */

import { describe, expect, test } from 'bun:test';
import { clientIp } from '../../src/shared/http/ip';

const REMOTE_IP = '198.51.100.10';
const EDGE_PROXY = '10.0.0.1';
const INTERNAL_PROXY = '10.0.0.2';
const CLIENT_IP = '203.0.113.7';

function requestWith(headers: Record<string, string>): Request {
  return new Request('http://escolaviva.test/login', { headers });
}

describe('clientIp — sem proxy confiável', () => {
  test('ignora X-Forwarded-For e devolve o endereço remoto', () => {
    const request = requestWith({ 'X-Forwarded-For': '1.2.3.4' });

    const ip = clientIp(request, REMOTE_IP, []);

    expect(ip).toBe(REMOTE_IP);
  });

  test('ignora uma cadeia inteira forjada pelo cliente', () => {
    const request = requestWith({ 'X-Forwarded-For': `${CLIENT_IP}, 1.2.3.4, 5.6.7.8` });

    const ip = clientIp(request, REMOTE_IP, []);

    expect(ip).toBe(REMOTE_IP);
  });

  test('sem cabeçalho nenhum devolve o endereço remoto', () => {
    const request = requestWith({});

    const ip = clientIp(request, REMOTE_IP, []);

    expect(ip).toBe(REMOTE_IP);
  });

  test('endereço remoto desconhecido vira string vazia em vez de quebrar', () => {
    const request = requestWith({ 'X-Forwarded-For': CLIENT_IP });

    const ip = clientIp(request, undefined, []);

    expect(ip).toBe('');
  });
});

describe('clientIp — com proxy confiável', () => {
  test('devolve o endereço à esquerda do proxy confiável', () => {
    const request = requestWith({ 'X-Forwarded-For': `${CLIENT_IP}, ${EDGE_PROXY}` });

    const ip = clientIp(request, EDGE_PROXY, [EDGE_PROXY]);

    expect(ip).toBe(CLIENT_IP);
  });

  test('descarta todos os saltos confiáveis da direita para a esquerda', () => {
    const request = requestWith({
      'X-Forwarded-For': `${CLIENT_IP}, ${INTERNAL_PROXY}, ${EDGE_PROXY}`,
    });

    const ip = clientIp(request, EDGE_PROXY, [EDGE_PROXY, INTERNAL_PROXY]);

    expect(ip).toBe(CLIENT_IP);
  });

  test('para no primeiro salto não confiável, mesmo com endereço forjado mais à esquerda', () => {
    const request = requestWith({
      'X-Forwarded-For': `1.2.3.4, ${CLIENT_IP}, ${EDGE_PROXY}`,
    });

    const ip = clientIp(request, EDGE_PROXY, [EDGE_PROXY]);

    expect(ip).toBe(CLIENT_IP);
  });

  test('cadeia formada só por proxies confiáveis cai no endereço remoto', () => {
    const request = requestWith({
      'X-Forwarded-For': `${INTERNAL_PROXY}, ${EDGE_PROXY}`,
    });

    const ip = clientIp(request, EDGE_PROXY, [EDGE_PROXY, INTERNAL_PROXY]);

    expect(ip).toBe(EDGE_PROXY);
  });

  test('sem o cabeçalho devolve o endereço remoto', () => {
    const request = requestWith({});

    const ip = clientIp(request, REMOTE_IP, [EDGE_PROXY]);

    expect(ip).toBe(REMOTE_IP);
  });

  test('apara os espaços em volta de cada endereço da cadeia', () => {
    const request = requestWith({
      'X-Forwarded-For': `   ${CLIENT_IP}   ,   ${EDGE_PROXY}   `,
    });

    const ip = clientIp(request, EDGE_PROXY, [EDGE_PROXY]);

    expect(ip).toBe(CLIENT_IP);
  });

  test('apara os espaços da lista de proxies confiáveis', () => {
    const request = requestWith({ 'X-Forwarded-For': `${CLIENT_IP}, ${EDGE_PROXY}` });

    const ip = clientIp(request, EDGE_PROXY, [`  ${EDGE_PROXY}  `]);

    expect(ip).toBe(CLIENT_IP);
  });

  test('lê o cabeçalho independentemente da caixa do nome', () => {
    const request = requestWith({ 'x-forwarded-for': `${CLIENT_IP}, ${EDGE_PROXY}` });

    const ip = clientIp(request, EDGE_PROXY, [EDGE_PROXY]);

    expect(ip).toBe(CLIENT_IP);
  });
});

describe('clientIp — cabeçalho vazio ou com lixo', () => {
  test('cabeçalho vazio devolve o endereço remoto', () => {
    const request = requestWith({ 'X-Forwarded-For': '' });

    const ip = clientIp(request, REMOTE_IP, [EDGE_PROXY]);

    expect(ip).toBe(REMOTE_IP);
  });

  test('cabeçalho só com vírgulas e espaços devolve o endereço remoto', () => {
    const request = requestWith({ 'X-Forwarded-For': ' , ,, ' });

    const ip = clientIp(request, REMOTE_IP, [EDGE_PROXY]);

    expect(ip).toBe(REMOTE_IP);
  });

  test('cabeçalho com texto que não é endereço não quebra e é devolvido como veio', () => {
    const request = requestWith({ 'X-Forwarded-For': 'lixo-qualquer' });

    const ip = clientIp(request, REMOTE_IP, [EDGE_PROXY]);

    expect(ip).toBe('lixo-qualquer');
  });

  test('cabeçalho com lixo é ignorado quando não há proxy confiável', () => {
    const request = requestWith({ 'X-Forwarded-For': 'lixo-qualquer' });

    const ip = clientIp(request, REMOTE_IP, []);

    expect(ip).toBe(REMOTE_IP);
  });
});

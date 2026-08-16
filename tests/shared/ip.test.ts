/*
 * I12: `X-Forwarded-For` is written by any client at all. With no trusted proxy declared, believing
 * it means letting the user pick their own IP — and the IP goes into the session table. With
 * proxies declared, the chain is read right to left: the first hop that is not ours is the client.
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

describe('clientIp — with no trusted proxy', () => {
  test('ignores X-Forwarded-For and gives back the remote address', () => {
    const request = requestWith({ 'X-Forwarded-For': '1.2.3.4' });

    const ip = clientIp(request, REMOTE_IP, []);

    expect(ip).toBe(REMOTE_IP);
  });

  test('ignores a whole chain forged by the client', () => {
    const request = requestWith({ 'X-Forwarded-For': `${CLIENT_IP}, 1.2.3.4, 5.6.7.8` });

    const ip = clientIp(request, REMOTE_IP, []);

    expect(ip).toBe(REMOTE_IP);
  });

  test('with no header at all it gives back the remote address', () => {
    const request = requestWith({});

    const ip = clientIp(request, REMOTE_IP, []);

    expect(ip).toBe(REMOTE_IP);
  });

  test('an unknown remote address becomes an empty string instead of breaking', () => {
    const request = requestWith({ 'X-Forwarded-For': CLIENT_IP });

    const ip = clientIp(request, undefined, []);

    expect(ip).toBe('');
  });
});

describe('clientIp — with a trusted proxy', () => {
  test('gives back the address to the left of the trusted proxy', () => {
    const request = requestWith({ 'X-Forwarded-For': `${CLIENT_IP}, ${EDGE_PROXY}` });

    const ip = clientIp(request, EDGE_PROXY, [EDGE_PROXY]);

    expect(ip).toBe(CLIENT_IP);
  });

  test('discards every trusted hop, right to left', () => {
    const request = requestWith({
      'X-Forwarded-For': `${CLIENT_IP}, ${INTERNAL_PROXY}, ${EDGE_PROXY}`,
    });

    const ip = clientIp(request, EDGE_PROXY, [EDGE_PROXY, INTERNAL_PROXY]);

    expect(ip).toBe(CLIENT_IP);
  });

  test('stops at the first untrusted hop, even with a forged address further left', () => {
    const request = requestWith({
      'X-Forwarded-For': `1.2.3.4, ${CLIENT_IP}, ${EDGE_PROXY}`,
    });

    const ip = clientIp(request, EDGE_PROXY, [EDGE_PROXY]);

    expect(ip).toBe(CLIENT_IP);
  });

  test('a chain made only of trusted proxies falls back to the remote address', () => {
    const request = requestWith({
      'X-Forwarded-For': `${INTERNAL_PROXY}, ${EDGE_PROXY}`,
    });

    const ip = clientIp(request, EDGE_PROXY, [EDGE_PROXY, INTERNAL_PROXY]);

    expect(ip).toBe(EDGE_PROXY);
  });

  test('without the header it gives back the remote address', () => {
    const request = requestWith({});

    const ip = clientIp(request, REMOTE_IP, [EDGE_PROXY]);

    expect(ip).toBe(REMOTE_IP);
  });

  test('trims the whitespace around each address in the chain', () => {
    const request = requestWith({
      'X-Forwarded-For': `   ${CLIENT_IP}   ,   ${EDGE_PROXY}   `,
    });

    const ip = clientIp(request, EDGE_PROXY, [EDGE_PROXY]);

    expect(ip).toBe(CLIENT_IP);
  });

  test('trims the whitespace in the list of trusted proxies', () => {
    const request = requestWith({ 'X-Forwarded-For': `${CLIENT_IP}, ${EDGE_PROXY}` });

    const ip = clientIp(request, EDGE_PROXY, [`  ${EDGE_PROXY}  `]);

    expect(ip).toBe(CLIENT_IP);
  });

  test('reads the header no matter the case of its name', () => {
    const request = requestWith({ 'x-forwarded-for': `${CLIENT_IP}, ${EDGE_PROXY}` });

    const ip = clientIp(request, EDGE_PROXY, [EDGE_PROXY]);

    expect(ip).toBe(CLIENT_IP);
  });
});

describe('clientIp — an empty header, or one full of junk', () => {
  test('an empty header gives back the remote address', () => {
    const request = requestWith({ 'X-Forwarded-For': '' });

    const ip = clientIp(request, REMOTE_IP, [EDGE_PROXY]);

    expect(ip).toBe(REMOTE_IP);
  });

  test('a header of nothing but commas and spaces gives back the remote address', () => {
    const request = requestWith({ 'X-Forwarded-For': ' , ,, ' });

    const ip = clientIp(request, REMOTE_IP, [EDGE_PROXY]);

    expect(ip).toBe(REMOTE_IP);
  });

  test('a header holding text that is not an address does not break, and comes back as it arrived', () => {
    const request = requestWith({ 'X-Forwarded-For': 'lixo-qualquer' });

    const ip = clientIp(request, REMOTE_IP, [EDGE_PROXY]);

    expect(ip).toBe('lixo-qualquer');
  });

  test('a header full of junk is ignored when there is no trusted proxy', () => {
    const request = requestWith({ 'X-Forwarded-For': 'lixo-qualquer' });

    const ip = clientIp(request, REMOTE_IP, []);

    expect(ip).toBe(REMOTE_IP);
  });
});

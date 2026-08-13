/*
 * I18: configuração faltando derruba o boot, não a requisição. `carregarConfig` é pura de
 * propósito — recebe o mapa de variáveis —, então cada combinação de ambiente é exercida aqui
 * sem mexer no processo.
 */

import { describe, expect, test } from 'bun:test';
import { carregarConfig, config } from '../../src/shared/config';

/** O mínimo que faz a configuração passar: as duas variáveis que não têm default. */
const OBRIGATORIAS = {
  DATABASE_URL: 'postgres://escolaviva:senha@localhost:5442/escolaviva',
  SESSION_SECRET: 'segredo-de-teste-com-mais-de-32-caracteres',
};

const TAMANHO_MINIMO_DO_SEGREDO = 32;

/** Devolve a mensagem da recusa; falha o teste se o ambiente tiver sido aceito. */
function mensagemDeRecusa(ambiente: Record<string, string | undefined>): string {
  try {
    carregarConfig(ambiente);
  } catch (erro) {
    return erro instanceof Error ? erro.message : String(erro);
  }
  throw new Error('carregarConfig aceitou um ambiente que deveria ter recusado');
}

describe('carregarConfig — variáveis obrigatórias', () => {
  test('recusa ambiente vazio: sem configuração o processo não sobe', () => {
    const ambienteVazio = {};

    const carregar = (): unknown => carregarConfig(ambienteVazio);

    expect(carregar).toThrow();
  });

  test('a recusa cita todas as variáveis faltantes de uma vez, não só a primeira', () => {
    const ambienteVazio = {};

    const mensagem = mensagemDeRecusa(ambienteVazio);

    expect(mensagem).toContain('DATABASE_URL');
    expect(mensagem).toContain('SESSION_SECRET');
  });

  test('recusa quando só falta SESSION_SECRET', () => {
    const semSegredo = { DATABASE_URL: OBRIGATORIAS.DATABASE_URL };

    const mensagem = mensagemDeRecusa(semSegredo);

    expect(mensagem).toContain('SESSION_SECRET');
    expect(mensagem).not.toContain('DATABASE_URL');
  });

  test('recusa quando só falta DATABASE_URL', () => {
    const semBanco = { SESSION_SECRET: OBRIGATORIAS.SESSION_SECRET };

    const mensagem = mensagemDeRecusa(semBanco);

    expect(mensagem).toContain('DATABASE_URL');
    expect(mensagem).not.toContain('SESSION_SECRET');
  });

  test('trata variável preenchida com vazio como ausente', () => {
    const vazias = { DATABASE_URL: '', SESSION_SECRET: '' };

    const mensagem = mensagemDeRecusa(vazias);

    expect(mensagem).toContain('DATABASE_URL');
    expect(mensagem).toContain('SESSION_SECRET');
  });
});

describe('carregarConfig — SESSION_SECRET', () => {
  test(`recusa segredo com menos de ${TAMANHO_MINIMO_DO_SEGREDO} caracteres`, () => {
    const curto = { ...OBRIGATORIAS, SESSION_SECRET: 'x'.repeat(TAMANHO_MINIMO_DO_SEGREDO - 1) };

    const mensagem = mensagemDeRecusa(curto);

    expect(mensagem).toContain('SESSION_SECRET');
  });

  test(`aceita segredo com exatamente ${TAMANHO_MINIMO_DO_SEGREDO} caracteres`, () => {
    const noLimite = { ...OBRIGATORIAS, SESSION_SECRET: 'x'.repeat(TAMANHO_MINIMO_DO_SEGREDO) };

    const carregada = carregarConfig(noLimite);

    expect(carregada.sessionSecret).toHaveLength(TAMANHO_MINIMO_DO_SEGREDO);
  });
});

describe('carregarConfig — defaults', () => {
  test('aplica porta 3000, timeout de 25000 ms, 12 horas de sessão e nível info', () => {
    const soObrigatorias = { ...OBRIGATORIAS };

    const carregada = carregarConfig(soObrigatorias);

    expect(carregada.porta).toBe(3000);
    expect(carregada.httpTimeoutMs).toBe(25000);
    expect(carregada.sessaoDuracaoHoras).toBe(12);
    expect(carregada.logLevel).toBe('info');
  });

  test('sem PROXIES_CONFIAVEIS a lista de proxies nasce vazia', () => {
    const soObrigatorias = { ...OBRIGATORIAS };

    const carregada = carregarConfig(soObrigatorias);

    expect(carregada.proxiesConfiaveis).toEqual([]);
  });

  test('sem APP_ENV o ambiente é development', () => {
    const soObrigatorias = { ...OBRIGATORIAS };

    const carregada = carregarConfig(soObrigatorias);

    expect(carregada.ambiente).toBe('development');
  });

  test('converte os números vindos como texto do ambiente', () => {
    const numerosComoTexto = {
      ...OBRIGATORIAS,
      PORT: '8080',
      HTTP_TIMEOUT_MS: '9000',
      SESSAO_DURACAO_HORAS: '4',
    };

    const carregada = carregarConfig(numerosComoTexto);

    expect(carregada.porta).toBe(8080);
    expect(carregada.httpTimeoutMs).toBe(9000);
    expect(carregada.sessaoDuracaoHoras).toBe(4);
  });
});

describe('carregarConfig — cookieSeguro', () => {
  test('deriva cookieSeguro de APP_ENV: verdadeiro em produção', () => {
    const producao = { ...OBRIGATORIAS, APP_ENV: 'production' };

    const carregada = carregarConfig(producao);

    expect(carregada.cookieSeguro).toBe(true);
  });

  test('deriva cookieSeguro de APP_ENV: falso em desenvolvimento e em teste', () => {
    const desenvolvimento = { ...OBRIGATORIAS, APP_ENV: 'development' };
    const teste = { ...OBRIGATORIAS, APP_ENV: 'test' };

    const emDesenvolvimento = carregarConfig(desenvolvimento);
    const emTeste = carregarConfig(teste);

    expect(emDesenvolvimento.cookieSeguro).toBe(false);
    expect(emTeste.cookieSeguro).toBe(false);
  });

  test('COOKIE_SEGURO explícito vence o derivado do ambiente', () => {
    const producaoSemTls = { ...OBRIGATORIAS, APP_ENV: 'production', COOKIE_SEGURO: 'false' };

    const carregada = carregarConfig(producaoSemTls);

    expect(carregada.cookieSeguro).toBe(false);
  });

  test('recusa COOKIE_SEGURO que não é true nem false', () => {
    const invalido = { ...OBRIGATORIAS, COOKIE_SEGURO: 'sim' };

    const mensagem = mensagemDeRecusa(invalido);

    expect(mensagem).toContain('COOKIE_SEGURO');
  });
});

describe('carregarConfig — PROXIES_CONFIAVEIS', () => {
  test('quebra a lista por vírgula, apara espaços e descarta itens vazios', () => {
    const comEspacos = { ...OBRIGATORIAS, PROXIES_CONFIAVEIS: ' 10.0.0.1 , 10.0.0.2 ,,10.0.0.3 ' };

    const carregada = carregarConfig(comEspacos);

    expect(carregada.proxiesConfiaveis).toEqual(['10.0.0.1', '10.0.0.2', '10.0.0.3']);
  });

  test('um único proxie sem vírgula vira lista de um item', () => {
    const umSo = { ...OBRIGATORIAS, PROXIES_CONFIAVEIS: '172.17.0.1' };

    const carregada = carregarConfig(umSo);

    expect(carregada.proxiesConfiaveis).toEqual(['172.17.0.1']);
  });

  test('lista só com vírgulas e espaços resulta em nenhum proxie confiável', () => {
    const soSeparadores = { ...OBRIGATORIAS, PROXIES_CONFIAVEIS: ' , , ' };

    const carregada = carregarConfig(soSeparadores);

    expect(carregada.proxiesConfiaveis).toEqual([]);
  });
});

describe('carregarConfig — valores inválidos', () => {
  test('recusa APP_ENV fora de development, test e production', () => {
    const ambienteInventado = { ...OBRIGATORIAS, APP_ENV: 'producao' };

    const mensagem = mensagemDeRecusa(ambienteInventado);

    expect(mensagem).toContain('APP_ENV');
  });

  test('recusa LOG_LEVEL fora de debug, info, warn e error', () => {
    const nivelInventado = { ...OBRIGATORIAS, LOG_LEVEL: 'verbose' };

    const mensagem = mensagemDeRecusa(nivelInventado);

    expect(mensagem).toContain('LOG_LEVEL');
  });

  test('recusa PORT que não é número', () => {
    const portaTexto = { ...OBRIGATORIAS, PORT: 'oitenta' };

    const mensagem = mensagemDeRecusa(portaTexto);

    expect(mensagem).toContain('PORT');
  });

  test('recusa PORT zero ou negativa', () => {
    const portaZero = { ...OBRIGATORIAS, PORT: '0' };

    const mensagem = mensagemDeRecusa(portaZero);

    expect(mensagem).toContain('PORT');
  });

  test('recusa HTTP_TIMEOUT_MS negativo', () => {
    const prazoNegativo = { ...OBRIGATORIAS, HTTP_TIMEOUT_MS: '-1' };

    const mensagem = mensagemDeRecusa(prazoNegativo);

    expect(mensagem).toContain('HTTP_TIMEOUT_MS');
  });

  test('acusa todos os valores inválidos na mesma mensagem', () => {
    const varios = { ...OBRIGATORIAS, APP_ENV: 'producao', LOG_LEVEL: 'verbose', PORT: 'oitenta' };

    const mensagem = mensagemDeRecusa(varios);

    expect(mensagem).toContain('APP_ENV');
    expect(mensagem).toContain('LOG_LEVEL');
    expect(mensagem).toContain('PORT');
  });
});

describe('config do processo', () => {
  test('a suíte roda com o ambiente de teste já validado no import', () => {
    const carregada = config;

    const ambiente = carregada.ambiente;

    expect(ambiente).toBe('test');
  });

  test('a configuração do processo aponta para o banco descartável da suíte', () => {
    const carregada = config;

    const url = carregada.databaseUrl;

    expect(url).toBe(Bun.env.DATABASE_URL_TESTE?.trim() ?? '');
  });
});

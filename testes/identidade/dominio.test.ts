/*
 * O domínio de identidade não fala com banco nenhum: quem decide se a rede opera, se o papel
 * existe e se a sessão ainda vale são funções puras. É assim que elas são exercidas aqui.
 */

import { describe, expect, test } from 'bun:test';
import { gerarCpf } from '../../src/shared/documento';
import { PAPEIS, papelValido, paraPapel } from '../../src/identidade/dominio/papel';
import {
  paraStatusDeRede,
  redeAtiva,
  STATUS_DE_REDE,
  type Rede,
} from '../../src/identidade/dominio/rede';
import {
  expiracaoDaSessao,
  sessaoExpirou,
  type Sessao,
} from '../../src/identidade/dominio/sessao';
import {
  emailNormalizado,
  TAMANHO_MINIMO_DE_SENHA,
  usuarioAutenticado,
  type Usuario,
} from '../../src/identidade/dominio/usuario';

const HORA_EM_MS = 3_600_000;
const AGORA = new Date('2026-03-10T08:00:00.000Z');

const redeCom = (status: Rede['status']): Rede => ({
  id: 'rede-1',
  nome: 'Rede Municipal Central',
  slug: 'central',
  status,
});

const sessaoQueVenceEm = (expiraEm: Date): Sessao => ({
  id: 'sessao-1',
  redeId: 'rede-1',
  usuarioId: 'usuario-1',
  criadoEm: AGORA,
  expiraEm,
  ip: '203.0.113.7',
});

describe('status da rede', () => {
  test('converte os três status que o esquema aceita', () => {
    const vindosDoBanco = [...STATUS_DE_REDE];

    const convertidos = vindosDoBanco.map(paraStatusDeRede);

    expect(convertidos).toEqual(['ativa', 'suspensa', 'cancelada']);
  });

  test('recusa status fora do domínio em vez de servir a rede com estado desconhecido', () => {
    const forasteiro = 'inadimplente';

    const converter = (): string => paraStatusDeRede(forasteiro);

    expect(converter).toThrow('status de rede fora do domínio: inadimplente');
  });

  test('só a rede ativa opera; suspensa e cancelada não', () => {
    const redes = [redeCom('ativa'), redeCom('suspensa'), redeCom('cancelada')];

    const operando = redes.map(redeAtiva);

    expect(operando).toEqual([true, false, false]);
  });
});

describe('papel do usuário', () => {
  test('reconhece os quatro papéis do produto', () => {
    const conhecidos = [...PAPEIS];

    const validos = conhecidos.map(papelValido);

    expect(validos).toEqual([true, true, true, true]);
  });

  test('não reconhece cargo que o produto não modela', () => {
    const cargo = 'diretor';

    const valido = papelValido(cargo);

    expect(valido).toBe(false);
  });

  test('recusa papel desconhecido em vez de descartá-lo em silêncio', () => {
    const desconhecido = 'coordenador';

    const converter = (): string => paraPapel(desconhecido);

    expect(converter).toThrow('papel fora do domínio: coordenador');
  });
});

describe('validade da sessão', () => {
  test('a expiração é a duração somada ao instante da criação', () => {
    const duracaoHoras = 12;

    const expiraEm = expiracaoDaSessao(AGORA, duracaoHoras);

    expect(expiraEm.getTime()).toBe(AGORA.getTime() + duracaoHoras * HORA_EM_MS);
  });

  test('a sessão dentro do prazo continua valendo', () => {
    const sessao = sessaoQueVenceEm(new Date(AGORA.getTime() + HORA_EM_MS));

    const expirou = sessaoExpirou(sessao, AGORA);

    expect(expirou).toBe(false);
  });

  test('a sessão vencida não vale mais', () => {
    const sessao = sessaoQueVenceEm(new Date(AGORA.getTime() - 1));

    const expirou = sessaoExpirou(sessao, AGORA);

    expect(expirou).toBe(true);
  });

  test('a sessão que vence exatamente agora já não vale', () => {
    const sessao = sessaoQueVenceEm(new Date(AGORA.getTime()));

    const expirou = sessaoExpirou(sessao, AGORA);

    expect(expirou).toBe(true);
  });
});

describe('usuário', () => {
  test('o e-mail perde espaços das pontas e vai para caixa baixa', () => {
    const digitado = '  Ana.Souza@Escola.BR  ';

    const normalizado = emailNormalizado(digitado);

    expect(normalizado).toBe('ana.souza@escola.br');
  });

  test('e-mail já normalizado atravessa sem mudança', () => {
    const digitado = 'ana.souza@escola.br';

    const normalizado = emailNormalizado(digitado);

    expect(normalizado).toBe(digitado);
  });

  test('o usuário autenticado carrega identidade, rede e todos os papéis', () => {
    const usuario: Usuario = {
      id: 'usuario-1',
      redeId: 'rede-1',
      nome: 'Ana Souza',
      email: 'ana.souza@escola.br',
      cpf: gerarCpf(1),
      ativo: true,
      responsavelId: null,
    };
    const papeis = [
      { unidadeId: 'unidade-1', unidadeNome: 'Escola Centro', papel: 'professor' as const },
      { unidadeId: 'unidade-2', unidadeNome: 'Escola Praia', papel: 'secretaria' as const },
    ];

    const autenticado = usuarioAutenticado(usuario, redeCom('ativa'), papeis);

    expect(autenticado).toEqual({
      id: 'usuario-1',
      redeId: 'rede-1',
      redeNome: 'Rede Municipal Central',
      redeSlug: 'central',
      nome: 'Ana Souza',
      email: 'ana.souza@escola.br',
      papeis,
      responsavelId: null,
    });
  });

  test('quem entra como responsável leva o cadastro de responsável junto', () => {
    const usuario: Usuario = {
      id: 'usuario-2',
      redeId: 'rede-1',
      nome: 'Carlos Lima',
      email: 'carlos@familia.br',
      cpf: gerarCpf(2),
      ativo: true,
      responsavelId: 'responsavel-9',
    };

    const autenticado = usuarioAutenticado(usuario, redeCom('ativa'), []);

    expect(autenticado.responsavelId).toBe('responsavel-9');
  });

  test('montar o usuário autenticado não altera o usuário recebido', () => {
    const usuario: Usuario = {
      id: 'usuario-3',
      redeId: 'rede-1',
      nome: 'Bia Nunes',
      email: 'bia@escola.br',
      cpf: gerarCpf(3),
      ativo: true,
      responsavelId: null,
    };
    const copia = { ...usuario };

    usuarioAutenticado(usuario, redeCom('ativa'), []);

    expect(usuario).toEqual(copia);
  });

  test('o produto exige senha de pelo menos dez caracteres', () => {
    const senhaCurta = 'abc123456';

    const cabe = senhaCurta.length >= TAMANHO_MINIMO_DE_SENHA;

    expect(cabe).toBe(false);
  });
});

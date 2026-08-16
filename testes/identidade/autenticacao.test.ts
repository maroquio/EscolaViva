/*
 * Entrar, continuar dentro e sair. Tudo contra PostgreSQL de verdade: a sessão do EscolaViva
 * mora em tabela (I2), e é a linha — com a rede e o usuário ao lado — que decide se ela vale.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { identity } from '../../src/identity';
import { generateCpf } from '../../src/shared/document';
import type { ApplicationError, Result } from '../../src/shared/result';
import { limparBanco, sqlDeTeste } from '../apoio/banco';
import {
  SENHA_PADRAO,
  cenarioCompleto,
  criarRede,
  criarSessao,
  criarUnidade,
  criarUsuario,
} from '../apoio/fabricas';

const HORA_EM_MS = 3_600_000;
const SENHA_NOVA = 'nova-senha-2026';

function valorDe<T>(resultado: Result<T>): T {
  if (!resultado.ok) {
    throw new Error(`esperava sucesso, vieram erros: ${JSON.stringify(resultado.erros)}`);
  }
  return resultado.valor;
}

function errosDe(resultado: Result<unknown>): ApplicationError[] {
  if (resultado.ok) throw new Error('esperava recusa da aplicação, veio sucesso');
  return resultado.erros;
}

async function contarSessoes(userId: string): Promise<number> {
  const linhas = await sqlDeTeste()<{ total: number }[]>`
    SELECT count(*)::int AS total FROM session WHERE user_id = ${userId}`;
  return linhas[0]?.total ?? 0;
}

beforeEach(limparBanco);

describe('autenticar', () => {
  test('com credenciais corretas abre a sessão e devolve o usuário com a rede e os papéis', async () => {
    const rede = await criarRede({ name: 'Rede Municipal Serra', slug: 'serra' });
    const centro = await criarUnidade({ networkId: rede.id, name: 'Escola Centro' });
    const praia = await criarUnidade({ networkId: rede.id, name: 'Escola Praia' });
    const usuario = await criarUsuario({
      networkId: rede.id,
      name: 'Ana Souza',
      email: 'ana.souza@serra.br',
      papeis: [
        { schoolId: praia.id, role: 'registrar' },
        { schoolId: centro.id, role: 'teacher' },
      ],
    });

    const resultado = await identity.authenticate({
      networkSlug: 'serra',
      loginIdentifier: usuario.cpf,
      password: SENHA_PADRAO,
      ip: '203.0.113.7',
    });

    const { sessionId, user: autenticado } = valorDe(resultado);
    expect(autenticado).toEqual({
      id: usuario.id,
      networkId: rede.id,
      networkName: 'Rede Municipal Serra',
      networkSlug: 'serra',
      name: 'Ana Souza',
      email: 'ana.souza@serra.br',
      roles: [
        { schoolId: centro.id, schoolName: 'Escola Centro', role: 'teacher' },
        { schoolId: praia.id, schoolName: 'Escola Praia', role: 'registrar' },
      ],
      guardianId: null,
    });
    const linhas = await sqlDeTeste()<{ user_id: string; expires_at: Date; ip: string | null }[]>`
      SELECT user_id, expires_at, ip FROM session WHERE id = ${sessionId}`;
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.user_id).toBe(usuario.id);
    expect(linhas[0]?.ip).toBe('203.0.113.7');
    expect(linhas[0]?.expires_at.getTime()).toBeGreaterThan(Date.now());
  });

  test('sem IP a sessão nasce sem endereço em vez de com texto vazio', async () => {
    const rede = await criarRede({ slug: 'sem-ip' });
    const usuario = await criarUsuario({ networkId: rede.id, email: 'carlos@escola.br' });

    const resultado = await identity.authenticate({
      networkSlug: 'sem-ip',
      loginIdentifier: usuario.cpf,
      password: SENHA_PADRAO,
      ip: '',
    });

    const { sessionId } = valorDe(resultado);
    const linhas = await sqlDeTeste()<{ ip: string | null }[]>`
      SELECT ip FROM session WHERE id = ${sessionId}`;
    expect(linhas[0]?.ip).toBeNull();
  });

  test('senha errada, CPF inexistente e usuário inativo devolvem a mesma recusa, sem apontar campo', async () => {
    const rede = await criarRede({ slug: 'generica' });
    const ativo = await criarUsuario({ networkId: rede.id, email: 'ativo@escola.br' });
    const inativo = await criarUsuario({ networkId: rede.id, email: 'inativo@escola.br', active: false });

    const [senhaErrada, cpfInexistente, usuarioInativo] = await Promise.all([
      identity.authenticate({
        networkSlug: 'generica', loginIdentifier: ativo.cpf, password: 'senha-errada-1', ip: '',
      }),
      identity.authenticate({
        networkSlug: 'generica', loginIdentifier: generateCpf(999_998), password: SENHA_PADRAO, ip: '',
      }),
      identity.authenticate({
        networkSlug: 'generica', loginIdentifier: inativo.cpf, password: SENHA_PADRAO, ip: '',
      }),
    ]);

    const recusaGenerica = [{ codigo: 'credenciais_invalidas', mensagem: 'CPF ou senha inválidos' }];
    expect(errosDe(senhaErrada)).toEqual(recusaGenerica);
    expect(errosDe(cpfInexistente)).toEqual(recusaGenerica);
    expect(errosDe(usuarioInativo)).toEqual(recusaGenerica);
    // Sem `campo`, a tela não consegue destacar o input do identificador e revelar qual dos três é.
    const apontamCampo = [senhaErrada, cpfInexistente, usuarioInativo]
      .flatMap(errosDe)
      .some((erro) => Object.hasOwn(erro, 'campo'));
    expect(apontamCampo).toBe(false);
  });

  test('nenhuma das três recusas abre sessão', async () => {
    const rede = await criarRede({ slug: 'sem-sessao' });
    const usuario = await criarUsuario({ networkId: rede.id, email: 'ativo@escola.br' });
    const inativo = await criarUsuario({ networkId: rede.id, email: 'inativo@escola.br', active: false });

    await Promise.all([
      identity.authenticate({
        networkSlug: 'sem-sessao', loginIdentifier: usuario.cpf, password: 'senha-errada-1', ip: '',
      }),
      identity.authenticate({
        networkSlug: 'sem-sessao', loginIdentifier: inativo.cpf, password: SENHA_PADRAO, ip: '',
      }),
    ]);

    expect(await contarSessoes(usuario.id)).toBe(0);
    expect(await contarSessoes(inativo.id)).toBe(0);
  });

  test('rede suspensa e rede inexistente recusam pela rede, não pelas credenciais', async () => {
    const suspensa = await criarRede({ slug: 'suspensa', status: 'suspended' });
    const usuario = await criarUsuario({ networkId: suspensa.id, email: 'ana@escola.br' });

    const [redeSuspensa, redeInexistente] = await Promise.all([
      identity.authenticate({
        networkSlug: 'suspensa', loginIdentifier: usuario.cpf, password: SENHA_PADRAO, ip: '',
      }),
      identity.authenticate({
        networkSlug: 'rede-que-nao-existe', loginIdentifier: usuario.cpf, password: SENHA_PADRAO, ip: '',
      }),
    ]);

    // A rede é dita pelo próprio usuário na tela e não é segredo: as duas recusas são iguais
    // entre si e distintas da recusa de credenciais, para não virar chamado de "senha parou".
    const recusaDeRede = [
      {
        campo: 'redeSlug',
        codigo: 'rede_indisponivel',
        mensagem: 'rede não encontrada ou fora de operação',
      },
    ];
    expect(errosDe(redeSuspensa)).toEqual(recusaDeRede);
    expect(errosDe(redeInexistente)).toEqual(recusaDeRede);
  });

  test('rede cancelada também não abre sessão', async () => {
    const cancelada = await criarRede({ slug: 'cancelada', status: 'cancelled' });
    const usuario = await criarUsuario({ networkId: cancelada.id, email: 'ana@escola.br' });

    const resultado = await identity.authenticate({
      networkSlug: 'cancelada', loginIdentifier: usuario.cpf, password: SENHA_PADRAO, ip: '',
    });

    expect(errosDe(resultado)[0]?.codigo).toBe('rede_indisponivel');
    expect(await contarSessoes(usuario.id)).toBe(0);
  });

  test('formulário em branco volta com erro em cada campo obrigatório', async () => {
    const rede = await criarRede({ slug: 'em-branco' });
    await criarUsuario({ networkId: rede.id, email: 'ana@escola.br' });

    const resultado = await identity.authenticate({
      networkSlug: '', loginIdentifier: '', password: '', ip: '',
    });

    const campos = errosDe(resultado).map((erro) => erro.campo);
    expect(campos).toEqual(['redeSlug', 'cpf', 'senha']);
  });

  test('o mesmo CPF em redes diferentes autentica cada um na sua rede', async () => {
    const primeira = await criarRede({ slug: 'primeira' });
    const segunda = await criarRede({ slug: 'segunda' });
    const cpfCompartilhado = generateCpf(700_001);
    const daPrimeira = await criarUsuario({ networkId: primeira.id, cpf: cpfCompartilhado });
    const daSegunda = await criarUsuario({ networkId: segunda.id, cpf: cpfCompartilhado });

    const [naPrimeira, naSegunda] = await Promise.all([
      identity.authenticate({
        networkSlug: 'primeira', loginIdentifier: cpfCompartilhado, password: SENHA_PADRAO, ip: '',
      }),
      identity.authenticate({
        networkSlug: 'segunda', loginIdentifier: cpfCompartilhado, password: SENHA_PADRAO, ip: '',
      }),
    ]);

    expect(valorDe(naPrimeira).user.id).toBe(daPrimeira.id);
    expect(valorDe(naSegunda).user.id).toBe(daSegunda.id);
  });

  test('entra com CPF cru', async () => {
    const cenario = await cenarioCompleto();

    const entrada = await identity.authenticate({
      networkSlug: cenario.rede.slug,
      loginIdentifier: cenario.secretaria.cpf,
      password: cenario.senha,
      ip: '',
    });

    expect(entrada.ok).toBe(true);
  });

  test('entra com CPF pontuado', async () => {
    const cenario = await cenarioCompleto();
    const cpf = cenario.secretaria.cpf;
    const pontuado = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;

    const entrada = await identity.authenticate({
      networkSlug: cenario.rede.slug, loginIdentifier: pontuado, password: cenario.senha, ip: '',
    });

    expect(entrada.ok).toBe(true);
  });

  test('e-mail não entra mais — o identificador é o CPF', async () => {
    const cenario = await cenarioCompleto();

    const entrada = await identity.authenticate({
      networkSlug: cenario.rede.slug, loginIdentifier: cenario.secretaria.email,
      password: cenario.senha, ip: '',
    });

    expect(entrada.ok).toBe(false);
  });

  test('CPF inexistente e senha errada dão a mesma recusa', async () => {
    const cenario = await cenarioCompleto();

    const [inexistente, senhaErrada] = await Promise.all([
      identity.authenticate({
        networkSlug: cenario.rede.slug, loginIdentifier: generateCpf(999_999), password: cenario.senha, ip: '',
      }),
      identity.authenticate({
        networkSlug: cenario.rede.slug, loginIdentifier: cenario.secretaria.cpf, password: 'errada', ip: '',
      }),
    ]);

    expect(inexistente.ok).toBe(false);
    expect(senhaErrada.ok).toBe(false);
    if (!inexistente.ok && !senhaErrada.ok) {
      expect(inexistente.erros).toEqual(senhaErrada.erros);
    }
  });
});

describe('sessaoValida', () => {
  test('devolve o usuário da sessão dentro do prazo', async () => {
    const rede = await criarRede({ name: 'Rede Norte', slug: 'norte' });
    const unidade = await criarUnidade({ networkId: rede.id, name: 'Escola Norte' });
    const usuario = await criarUsuario({
      networkId: rede.id, name: 'Ana Souza', email: 'ana@norte.br',
      papeis: [{ schoolId: unidade.id, role: 'network_admin' }],
    });
    const sessao = await criarSessao({ networkId: rede.id, userId: usuario.id });

    const encontrado = await identity.validSession(sessao.id);

    expect(encontrado).toEqual({
      id: usuario.id,
      networkId: rede.id,
      networkName: 'Rede Norte',
      networkSlug: 'norte',
      name: 'Ana Souza',
      email: 'ana@norte.br',
      roles: [{ schoolId: unidade.id, schoolName: 'Escola Norte', role: 'network_admin' }],
      guardianId: null,
    });
  });

  test('sessão expirada não vale, mesmo com a linha ainda no banco', async () => {
    const rede = await criarRede();
    const usuario = await criarUsuario({ networkId: rede.id });
    const vencida = await criarSessao({
      networkId: rede.id, userId: usuario.id, expiresAt: new Date(Date.now() - HORA_EM_MS),
    });

    const encontrado = await identity.validSession(vencida.id);

    expect(encontrado).toBeNull();
    expect(await contarSessoes(usuario.id)).toBe(1);
  });

  test('id de sessão inexistente devolve nulo', async () => {
    const rede = await criarRede();
    await criarUsuario({ networkId: rede.id });

    const encontrado = await identity.validSession(crypto.randomUUID());

    expect(encontrado).toBeNull();
  });

  test('id fora do formato devolve nulo em vez de estourar erro de conversão', async () => {
    const rede = await criarRede();
    await criarUsuario({ networkId: rede.id });

    const encontrado = await identity.validSession('nao-e-um-uuid');

    expect(encontrado).toBeNull();
  });

  test('suspender a rede derruba na hora as sessões já abertas', async () => {
    const rede = await criarRede({ slug: 'derrubada' });
    const usuario = await criarUsuario({ networkId: rede.id });
    const sessao = await criarSessao({ networkId: rede.id, userId: usuario.id });

    await sqlDeTeste()`UPDATE network SET status = 'suspended' WHERE id = ${rede.id}`;

    expect(await identity.validSession(sessao.id)).toBeNull();
  });

  test('desativar o usuário derruba a sessão dele', async () => {
    const rede = await criarRede();
    const usuario = await criarUsuario({ networkId: rede.id });
    const sessao = await criarSessao({ networkId: rede.id, userId: usuario.id });

    await sqlDeTeste()`UPDATE app_user SET active = false WHERE id = ${usuario.id}`;

    expect(await identity.validSession(sessao.id)).toBeNull();
  });
});

describe('encerrarSessao', () => {
  test('apaga a sessão e ela deixa de valer', async () => {
    const rede = await criarRede();
    const usuario = await criarUsuario({ networkId: rede.id });
    const sessao = await criarSessao({ networkId: rede.id, userId: usuario.id });

    await identity.endSession(sessao.id);

    expect(await identity.validSession(sessao.id)).toBeNull();
    expect(await contarSessoes(usuario.id)).toBe(0);
  });

  test('encerra apenas a sessão pedida e deixa as outras do mesmo usuário de pé', async () => {
    const rede = await criarRede();
    const usuario = await criarUsuario({ networkId: rede.id });
    const doNotebook = await criarSessao({ networkId: rede.id, userId: usuario.id });
    const doCelular = await criarSessao({ networkId: rede.id, userId: usuario.id });

    await identity.endSession(doNotebook.id);

    expect(await identity.validSession(doCelular.id)).not.toBeNull();
    expect(await contarSessoes(usuario.id)).toBe(1);
  });

  test('id forjado não apaga nada nem estoura', async () => {
    const rede = await criarRede();
    const usuario = await criarUsuario({ networkId: rede.id });
    await criarSessao({ networkId: rede.id, userId: usuario.id });

    await identity.endSession('cookie-forjado');

    expect(await contarSessoes(usuario.id)).toBe(1);
  });
});

describe('expurgarSessoesExpiradas', () => {
  test('remove só as vencidas e devolve quantas saíram', async () => {
    const rede = await criarRede();
    const usuario = await criarUsuario({ networkId: rede.id });
    await criarSessao({
      networkId: rede.id, userId: usuario.id, expiresAt: new Date(Date.now() - HORA_EM_MS),
    });
    await criarSessao({
      networkId: rede.id, userId: usuario.id, expiresAt: new Date(Date.now() - 1000),
    });
    const viva = await criarSessao({ networkId: rede.id, userId: usuario.id });

    const removidas = await identity.purgeExpiredSessions();

    expect(removidas).toBe(2);
    expect(await contarSessoes(usuario.id)).toBe(1);
    expect(await identity.validSession(viva.id)).not.toBeNull();
  });

  test('sem sessão vencida não remove nada e devolve zero', async () => {
    const rede = await criarRede();
    const usuario = await criarUsuario({ networkId: rede.id });
    await criarSessao({ networkId: rede.id, userId: usuario.id });

    const removidas = await identity.purgeExpiredSessions();

    expect(removidas).toBe(0);
    expect(await contarSessoes(usuario.id)).toBe(1);
  });
});

describe('trocarSenha', () => {
  test('exige a senha atual', async () => {
    const rede = await criarRede();
    const usuario = await criarUsuario({ networkId: rede.id });

    const resultado = await identity.changePassword({
      userId: usuario.id, currentPassword: 'chute-errado-1', newPassword: SENHA_NOVA,
    });

    expect(errosDe(resultado)).toEqual([
      { campo: 'senhaAtual', codigo: 'senha_incorreta', mensagem: 'a senha atual não confere' },
    ]);
  });

  test('recusa senha nova curta demais', async () => {
    const rede = await criarRede();
    const usuario = await criarUsuario({ networkId: rede.id });

    const resultado = await identity.changePassword({
      userId: usuario.id, currentPassword: SENHA_PADRAO, newPassword: 'curta123',
    });

    expect(errosDe(resultado)[0]?.campo).toBe('senhaNova');
  });

  test('a senha nova passa a autenticar e a antiga deixa de funcionar', async () => {
    const rede = await criarRede({ slug: 'troca' });
    const usuario = await criarUsuario({ networkId: rede.id, email: 'ana@troca.br' });

    const troca = await identity.changePassword({
      userId: usuario.id, currentPassword: SENHA_PADRAO, newPassword: SENHA_NOVA,
    });

    expect(troca.ok).toBe(true);
    const comNova = await identity.authenticate({
      networkSlug: 'troca', loginIdentifier: usuario.cpf, password: SENHA_NOVA, ip: '',
    });
    const comAntiga = await identity.authenticate({
      networkSlug: 'troca', loginIdentifier: usuario.cpf, password: SENHA_PADRAO, ip: '',
    });
    expect(comNova.ok).toBe(true);
    expect(errosDe(comAntiga)[0]?.codigo).toBe('credenciais_invalidas');
  });

  test('trocar a senha de um usuário não mexe na senha de outro da mesma rede', async () => {
    const rede = await criarRede({ slug: 'vizinhos' });
    const ana = await criarUsuario({ networkId: rede.id, email: 'ana@vizinhos.br' });
    const bia = await criarUsuario({ networkId: rede.id, email: 'bia@vizinhos.br' });

    await identity.changePassword({
      userId: ana.id, currentPassword: SENHA_PADRAO, newPassword: SENHA_NOVA,
    });

    const resultado = await identity.authenticate({
      networkSlug: 'vizinhos', loginIdentifier: bia.cpf, password: SENHA_PADRAO, ip: '',
    });
    expect(resultado.ok).toBe(true);
  });

  test('usuário inexistente é recusado sem apontar campo', async () => {
    const rede = await criarRede();
    await criarUsuario({ networkId: rede.id });

    const resultado = await identity.changePassword({
      userId: crypto.randomUUID(), currentPassword: SENHA_PADRAO, newPassword: SENHA_NOVA,
    });

    expect(errosDe(resultado)).toEqual([
      { codigo: 'usuario_inexistente', mensagem: 'usuário não encontrado' },
    ]);
  });

  test('id de usuário fora do formato é recusado pela validação de entrada', async () => {
    const rede = await criarRede();
    await criarUsuario({ networkId: rede.id });

    const resultado = await identity.changePassword({
      userId: 'nao-e-uuid', currentPassword: SENHA_PADRAO, newPassword: SENHA_NOVA,
    });

    expect(errosDe(resultado)[0]?.campo).toBe('userId');
  });
});

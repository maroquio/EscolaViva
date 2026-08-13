/*
 * Entrar, continuar dentro e sair. Tudo contra PostgreSQL de verdade: a sessão do EscolaViva
 * mora em tabela (I2), e é a linha — com a rede e o usuário ao lado — que decide se ela vale.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { identidade } from '../../src/identidade';
import type { ErroDeAplicacao, Resultado } from '../../src/shared/resultado';
import { limparBanco, sqlDeTeste } from '../apoio/banco';
import {
  criarRede,
  criarSessao,
  criarUnidade,
  criarUsuario,
  SENHA_PADRAO,
} from '../apoio/fabricas';

const HORA_EM_MS = 3_600_000;
const SENHA_NOVA = 'nova-senha-2026';

function valorDe<T>(resultado: Resultado<T>): T {
  if (!resultado.ok) {
    throw new Error(`esperava sucesso, vieram erros: ${JSON.stringify(resultado.erros)}`);
  }
  return resultado.valor;
}

function errosDe(resultado: Resultado<unknown>): ErroDeAplicacao[] {
  if (resultado.ok) throw new Error('esperava recusa da aplicação, veio sucesso');
  return resultado.erros;
}

async function contarSessoes(usuarioId: string): Promise<number> {
  const linhas = await sqlDeTeste()<{ total: number }[]>`
    SELECT count(*)::int AS total FROM sessao WHERE usuario_id = ${usuarioId}`;
  return linhas[0]?.total ?? 0;
}

beforeEach(limparBanco);

describe('autenticar', () => {
  test('com credenciais corretas abre a sessão e devolve o usuário com a rede e os papéis', async () => {
    const rede = await criarRede({ nome: 'Rede Municipal Serra', slug: 'serra' });
    const centro = await criarUnidade({ redeId: rede.id, nome: 'Escola Centro' });
    const praia = await criarUnidade({ redeId: rede.id, nome: 'Escola Praia' });
    const usuario = await criarUsuario({
      redeId: rede.id,
      nome: 'Ana Souza',
      email: 'ana.souza@serra.br',
      papeis: [
        { unidadeId: praia.id, papel: 'secretaria' },
        { unidadeId: centro.id, papel: 'professor' },
      ],
    });

    const resultado = await identidade.autenticar({
      redeSlug: 'serra',
      email: 'ana.souza@serra.br',
      senha: SENHA_PADRAO,
      ip: '203.0.113.7',
    });

    const { sessaoId, usuario: autenticado } = valorDe(resultado);
    expect(autenticado).toEqual({
      id: usuario.id,
      redeId: rede.id,
      redeNome: 'Rede Municipal Serra',
      redeSlug: 'serra',
      nome: 'Ana Souza',
      email: 'ana.souza@serra.br',
      papeis: [
        { unidadeId: centro.id, unidadeNome: 'Escola Centro', papel: 'professor' },
        { unidadeId: praia.id, unidadeNome: 'Escola Praia', papel: 'secretaria' },
      ],
      responsavelId: null,
    });
    const linhas = await sqlDeTeste()<{ usuario_id: string; expira_em: Date; ip: string | null }[]>`
      SELECT usuario_id, expira_em, ip FROM sessao WHERE id = ${sessaoId}`;
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.usuario_id).toBe(usuario.id);
    expect(linhas[0]?.ip).toBe('203.0.113.7');
    expect(linhas[0]?.expira_em.getTime()).toBeGreaterThan(Date.now());
  });

  test('aceita o e-mail digitado em caixa alta e com espaços sobrando', async () => {
    const rede = await criarRede({ slug: 'caixa-alta' });
    await criarUsuario({ redeId: rede.id, email: 'bia@escola.br' });

    const resultado = await identidade.autenticar({
      redeSlug: 'caixa-alta',
      email: '  BIA@Escola.BR ',
      senha: SENHA_PADRAO,
      ip: '',
    });

    expect(resultado.ok).toBe(true);
  });

  test('sem IP a sessão nasce sem endereço em vez de com texto vazio', async () => {
    const rede = await criarRede({ slug: 'sem-ip' });
    await criarUsuario({ redeId: rede.id, email: 'carlos@escola.br' });

    const resultado = await identidade.autenticar({
      redeSlug: 'sem-ip',
      email: 'carlos@escola.br',
      senha: SENHA_PADRAO,
      ip: '',
    });

    const { sessaoId } = valorDe(resultado);
    const linhas = await sqlDeTeste()<{ ip: string | null }[]>`
      SELECT ip FROM sessao WHERE id = ${sessaoId}`;
    expect(linhas[0]?.ip).toBeNull();
  });

  test('senha errada, e-mail inexistente e usuário inativo devolvem a mesma recusa, sem apontar campo', async () => {
    const rede = await criarRede({ slug: 'generica' });
    await criarUsuario({ redeId: rede.id, email: 'ativo@escola.br' });
    await criarUsuario({ redeId: rede.id, email: 'inativo@escola.br', ativo: false });

    const [senhaErrada, emailInexistente, usuarioInativo] = await Promise.all([
      identidade.autenticar({
        redeSlug: 'generica', email: 'ativo@escola.br', senha: 'senha-errada-1', ip: '',
      }),
      identidade.autenticar({
        redeSlug: 'generica', email: 'ninguem@escola.br', senha: SENHA_PADRAO, ip: '',
      }),
      identidade.autenticar({
        redeSlug: 'generica', email: 'inativo@escola.br', senha: SENHA_PADRAO, ip: '',
      }),
    ]);

    const recusaGenerica = [{ codigo: 'credenciais_invalidas', mensagem: 'e-mail ou senha inválidos' }];
    expect(errosDe(senhaErrada)).toEqual(recusaGenerica);
    expect(errosDe(emailInexistente)).toEqual(recusaGenerica);
    expect(errosDe(usuarioInativo)).toEqual(recusaGenerica);
    // Sem `campo`, a tela não consegue destacar o input do e-mail e revelar qual dos três é.
    const apontamCampo = [senhaErrada, emailInexistente, usuarioInativo]
      .flatMap(errosDe)
      .some((erro) => Object.hasOwn(erro, 'campo'));
    expect(apontamCampo).toBe(false);
  });

  test('nenhuma das três recusas abre sessão', async () => {
    const rede = await criarRede({ slug: 'sem-sessao' });
    const usuario = await criarUsuario({ redeId: rede.id, email: 'ativo@escola.br' });
    const inativo = await criarUsuario({ redeId: rede.id, email: 'inativo@escola.br', ativo: false });

    await Promise.all([
      identidade.autenticar({
        redeSlug: 'sem-sessao', email: 'ativo@escola.br', senha: 'senha-errada-1', ip: '',
      }),
      identidade.autenticar({
        redeSlug: 'sem-sessao', email: 'inativo@escola.br', senha: SENHA_PADRAO, ip: '',
      }),
    ]);

    expect(await contarSessoes(usuario.id)).toBe(0);
    expect(await contarSessoes(inativo.id)).toBe(0);
  });

  test('rede suspensa e rede inexistente recusam pela rede, não pelas credenciais', async () => {
    const suspensa = await criarRede({ slug: 'suspensa', status: 'suspensa' });
    await criarUsuario({ redeId: suspensa.id, email: 'ana@escola.br' });

    const [redeSuspensa, redeInexistente] = await Promise.all([
      identidade.autenticar({
        redeSlug: 'suspensa', email: 'ana@escola.br', senha: SENHA_PADRAO, ip: '',
      }),
      identidade.autenticar({
        redeSlug: 'rede-que-nao-existe', email: 'ana@escola.br', senha: SENHA_PADRAO, ip: '',
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
    const cancelada = await criarRede({ slug: 'cancelada', status: 'cancelada' });
    const usuario = await criarUsuario({ redeId: cancelada.id, email: 'ana@escola.br' });

    const resultado = await identidade.autenticar({
      redeSlug: 'cancelada', email: 'ana@escola.br', senha: SENHA_PADRAO, ip: '',
    });

    expect(errosDe(resultado)[0]?.codigo).toBe('rede_indisponivel');
    expect(await contarSessoes(usuario.id)).toBe(0);
  });

  test('formulário em branco volta com erro em cada campo obrigatório', async () => {
    const rede = await criarRede({ slug: 'em-branco' });
    await criarUsuario({ redeId: rede.id, email: 'ana@escola.br' });

    const resultado = await identidade.autenticar({
      redeSlug: '', email: '', senha: '', ip: '',
    });

    const campos = errosDe(resultado).map((erro) => erro.campo);
    expect(campos).toEqual(['redeSlug', 'email', 'senha']);
  });

  test('o mesmo e-mail em redes diferentes autentica cada um na sua rede', async () => {
    const primeira = await criarRede({ slug: 'primeira' });
    const segunda = await criarRede({ slug: 'segunda' });
    const daPrimeira = await criarUsuario({ redeId: primeira.id, email: 'diretor@escola.br' });
    const daSegunda = await criarUsuario({ redeId: segunda.id, email: 'diretor@escola.br' });

    const [naPrimeira, naSegunda] = await Promise.all([
      identidade.autenticar({
        redeSlug: 'primeira', email: 'diretor@escola.br', senha: SENHA_PADRAO, ip: '',
      }),
      identidade.autenticar({
        redeSlug: 'segunda', email: 'diretor@escola.br', senha: SENHA_PADRAO, ip: '',
      }),
    ]);

    expect(valorDe(naPrimeira).usuario.id).toBe(daPrimeira.id);
    expect(valorDe(naSegunda).usuario.id).toBe(daSegunda.id);
  });
});

describe('sessaoValida', () => {
  test('devolve o usuário da sessão dentro do prazo', async () => {
    const rede = await criarRede({ nome: 'Rede Norte', slug: 'norte' });
    const unidade = await criarUnidade({ redeId: rede.id, nome: 'Escola Norte' });
    const usuario = await criarUsuario({
      redeId: rede.id, nome: 'Ana Souza', email: 'ana@norte.br',
      papeis: [{ unidadeId: unidade.id, papel: 'admin_rede' }],
    });
    const sessao = await criarSessao({ redeId: rede.id, usuarioId: usuario.id });

    const encontrado = await identidade.sessaoValida(sessao.id);

    expect(encontrado).toEqual({
      id: usuario.id,
      redeId: rede.id,
      redeNome: 'Rede Norte',
      redeSlug: 'norte',
      nome: 'Ana Souza',
      email: 'ana@norte.br',
      papeis: [{ unidadeId: unidade.id, unidadeNome: 'Escola Norte', papel: 'admin_rede' }],
      responsavelId: null,
    });
  });

  test('sessão expirada não vale, mesmo com a linha ainda no banco', async () => {
    const rede = await criarRede();
    const usuario = await criarUsuario({ redeId: rede.id });
    const vencida = await criarSessao({
      redeId: rede.id, usuarioId: usuario.id, expiraEm: new Date(Date.now() - HORA_EM_MS),
    });

    const encontrado = await identidade.sessaoValida(vencida.id);

    expect(encontrado).toBeNull();
    expect(await contarSessoes(usuario.id)).toBe(1);
  });

  test('id de sessão inexistente devolve nulo', async () => {
    const rede = await criarRede();
    await criarUsuario({ redeId: rede.id });

    const encontrado = await identidade.sessaoValida(crypto.randomUUID());

    expect(encontrado).toBeNull();
  });

  test('id fora do formato devolve nulo em vez de estourar erro de conversão', async () => {
    const rede = await criarRede();
    await criarUsuario({ redeId: rede.id });

    const encontrado = await identidade.sessaoValida('nao-e-um-uuid');

    expect(encontrado).toBeNull();
  });

  test('suspender a rede derruba na hora as sessões já abertas', async () => {
    const rede = await criarRede({ slug: 'derrubada' });
    const usuario = await criarUsuario({ redeId: rede.id });
    const sessao = await criarSessao({ redeId: rede.id, usuarioId: usuario.id });

    await sqlDeTeste()`UPDATE rede SET status = 'suspensa' WHERE id = ${rede.id}`;

    expect(await identidade.sessaoValida(sessao.id)).toBeNull();
  });

  test('desativar o usuário derruba a sessão dele', async () => {
    const rede = await criarRede();
    const usuario = await criarUsuario({ redeId: rede.id });
    const sessao = await criarSessao({ redeId: rede.id, usuarioId: usuario.id });

    await sqlDeTeste()`UPDATE usuario SET ativo = false WHERE id = ${usuario.id}`;

    expect(await identidade.sessaoValida(sessao.id)).toBeNull();
  });
});

describe('encerrarSessao', () => {
  test('apaga a sessão e ela deixa de valer', async () => {
    const rede = await criarRede();
    const usuario = await criarUsuario({ redeId: rede.id });
    const sessao = await criarSessao({ redeId: rede.id, usuarioId: usuario.id });

    await identidade.encerrarSessao(sessao.id);

    expect(await identidade.sessaoValida(sessao.id)).toBeNull();
    expect(await contarSessoes(usuario.id)).toBe(0);
  });

  test('encerra apenas a sessão pedida e deixa as outras do mesmo usuário de pé', async () => {
    const rede = await criarRede();
    const usuario = await criarUsuario({ redeId: rede.id });
    const doNotebook = await criarSessao({ redeId: rede.id, usuarioId: usuario.id });
    const doCelular = await criarSessao({ redeId: rede.id, usuarioId: usuario.id });

    await identidade.encerrarSessao(doNotebook.id);

    expect(await identidade.sessaoValida(doCelular.id)).not.toBeNull();
    expect(await contarSessoes(usuario.id)).toBe(1);
  });

  test('id forjado não apaga nada nem estoura', async () => {
    const rede = await criarRede();
    const usuario = await criarUsuario({ redeId: rede.id });
    await criarSessao({ redeId: rede.id, usuarioId: usuario.id });

    await identidade.encerrarSessao('cookie-forjado');

    expect(await contarSessoes(usuario.id)).toBe(1);
  });
});

describe('expurgarSessoesExpiradas', () => {
  test('remove só as vencidas e devolve quantas saíram', async () => {
    const rede = await criarRede();
    const usuario = await criarUsuario({ redeId: rede.id });
    await criarSessao({
      redeId: rede.id, usuarioId: usuario.id, expiraEm: new Date(Date.now() - HORA_EM_MS),
    });
    await criarSessao({
      redeId: rede.id, usuarioId: usuario.id, expiraEm: new Date(Date.now() - 1000),
    });
    const viva = await criarSessao({ redeId: rede.id, usuarioId: usuario.id });

    const removidas = await identidade.expurgarSessoesExpiradas();

    expect(removidas).toBe(2);
    expect(await contarSessoes(usuario.id)).toBe(1);
    expect(await identidade.sessaoValida(viva.id)).not.toBeNull();
  });

  test('sem sessão vencida não remove nada e devolve zero', async () => {
    const rede = await criarRede();
    const usuario = await criarUsuario({ redeId: rede.id });
    await criarSessao({ redeId: rede.id, usuarioId: usuario.id });

    const removidas = await identidade.expurgarSessoesExpiradas();

    expect(removidas).toBe(0);
    expect(await contarSessoes(usuario.id)).toBe(1);
  });
});

describe('trocarSenha', () => {
  test('exige a senha atual', async () => {
    const rede = await criarRede();
    const usuario = await criarUsuario({ redeId: rede.id });

    const resultado = await identidade.trocarSenha({
      usuarioId: usuario.id, senhaAtual: 'chute-errado-1', senhaNova: SENHA_NOVA,
    });

    expect(errosDe(resultado)).toEqual([
      { campo: 'senhaAtual', codigo: 'senha_incorreta', mensagem: 'a senha atual não confere' },
    ]);
  });

  test('recusa senha nova curta demais', async () => {
    const rede = await criarRede();
    const usuario = await criarUsuario({ redeId: rede.id });

    const resultado = await identidade.trocarSenha({
      usuarioId: usuario.id, senhaAtual: SENHA_PADRAO, senhaNova: 'curta123',
    });

    expect(errosDe(resultado)[0]?.campo).toBe('senhaNova');
  });

  test('a senha nova passa a autenticar e a antiga deixa de funcionar', async () => {
    const rede = await criarRede({ slug: 'troca' });
    const usuario = await criarUsuario({ redeId: rede.id, email: 'ana@troca.br' });

    const troca = await identidade.trocarSenha({
      usuarioId: usuario.id, senhaAtual: SENHA_PADRAO, senhaNova: SENHA_NOVA,
    });

    expect(troca.ok).toBe(true);
    const comNova = await identidade.autenticar({
      redeSlug: 'troca', email: 'ana@troca.br', senha: SENHA_NOVA, ip: '',
    });
    const comAntiga = await identidade.autenticar({
      redeSlug: 'troca', email: 'ana@troca.br', senha: SENHA_PADRAO, ip: '',
    });
    expect(comNova.ok).toBe(true);
    expect(errosDe(comAntiga)[0]?.codigo).toBe('credenciais_invalidas');
  });

  test('trocar a senha de um usuário não mexe na senha de outro da mesma rede', async () => {
    const rede = await criarRede({ slug: 'vizinhos' });
    const ana = await criarUsuario({ redeId: rede.id, email: 'ana@vizinhos.br' });
    await criarUsuario({ redeId: rede.id, email: 'bia@vizinhos.br' });

    await identidade.trocarSenha({
      usuarioId: ana.id, senhaAtual: SENHA_PADRAO, senhaNova: SENHA_NOVA,
    });

    const bia = await identidade.autenticar({
      redeSlug: 'vizinhos', email: 'bia@vizinhos.br', senha: SENHA_PADRAO, ip: '',
    });
    expect(bia.ok).toBe(true);
  });

  test('usuário inexistente é recusado sem apontar campo', async () => {
    const rede = await criarRede();
    await criarUsuario({ redeId: rede.id });

    const resultado = await identidade.trocarSenha({
      usuarioId: crypto.randomUUID(), senhaAtual: SENHA_PADRAO, senhaNova: SENHA_NOVA,
    });

    expect(errosDe(resultado)).toEqual([
      { codigo: 'usuario_inexistente', mensagem: 'usuário não encontrado' },
    ]);
  });

  test('id de usuário fora do formato é recusado pela validação de entrada', async () => {
    const rede = await criarRede();
    await criarUsuario({ redeId: rede.id });

    const resultado = await identidade.trocarSenha({
      usuarioId: 'nao-e-uuid', senhaAtual: SENHA_PADRAO, senhaNova: SENHA_NOVA,
    });

    expect(errosDe(resultado)[0]?.campo).toBe('usuarioId');
  });
});

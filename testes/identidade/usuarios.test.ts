/*
 * Quem existe na rede e o que cada um pode. O convite, a unidade e as consultas que o restante
 * do produto faz a identidade — inclusive a pergunta "esta pessoa é professora nesta unidade?",
 * que é a fronteira pela qual o acadêmico entra aqui.
 *
 * A unicidade de e-mail é POR REDE, não global: duas prefeituras podem ter a mesma secretária
 * cadastrada, e é isso que permite vender a mesma pessoa para duas contas.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { identidade } from '../../src/identidade';
import { gerarCpf } from '../../src/shared/documento';
import type { ErroDeAplicacao, Resultado } from '../../src/shared/resultado';
import { limparBanco, sqlDeTeste } from '../apoio/banco';
import {
  cenarioCompleto,
  criarRede,
  criarResponsavel,
  criarUnidade as criarUnidadeDeTeste,
  criarUsuario,
  duasRedes,
} from '../apoio/fabricas';

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

beforeEach(limparBanco);

describe('convidarUsuario', () => {
  test('cria o usuário com os papéis pedidos e devolve a senha provisória', async () => {
    const rede = await criarRede({ slug: 'convite' });
    const centro = await criarUnidadeDeTeste({ redeId: rede.id, nome: 'Escola Centro' });
    const praia = await criarUnidadeDeTeste({ redeId: rede.id, nome: 'Escola Praia' });

    const resultado = await identidade.convidarUsuario({
      redeId: rede.id,
      nome: 'Ana Souza',
      email: 'ana.souza@convite.br',
      cpf: gerarCpf(3),
      atribuicoes: [
        { unidadeId: centro.id, papel: 'professor' },
        { unidadeId: praia.id, papel: 'secretaria' },
      ],
    });

    const { usuarioId, senhaProvisoria } = valorDe(resultado);
    expect(senhaProvisoria).toHaveLength(12);
    const usuarios = await identidade.listarUsuarios(rede.id);
    expect(usuarios).toEqual([
      {
        id: usuarioId,
        nome: 'Ana Souza',
        email: 'ana.souza@convite.br',
        cpf: gerarCpf(3),
        ativo: true,
        papeis: [
          { unidadeId: centro.id, unidadeNome: 'Escola Centro', papel: 'professor' },
          { unidadeId: praia.id, unidadeNome: 'Escola Praia', papel: 'secretaria' },
        ],
      },
    ]);
  });

  test('a senha provisória devolvida realmente autentica', async () => {
    const rede = await criarRede({ slug: 'provisoria' });
    const unidade = await criarUnidadeDeTeste({ redeId: rede.id });
    const convite = await identidade.convidarUsuario({
      redeId: rede.id,
      nome: 'Bia Nunes',
      email: 'bia@provisoria.br',
      cpf: gerarCpf(4),
      atribuicoes: [{ unidadeId: unidade.id, papel: 'secretaria' }],
    });

    const entrada = await identidade.autenticar({
      redeSlug: 'provisoria',
      identificador: gerarCpf(4),
      senha: valorDe(convite).senhaProvisoria,
      ip: '',
    });

    expect(valorDe(entrada).usuario.id).toBe(valorDe(convite).usuarioId);
  });

  test('o e-mail é guardado normalizado e autentica em qualquer caixa', async () => {
    const rede = await criarRede({ slug: 'normalizado' });
    const unidade = await criarUnidadeDeTeste({ redeId: rede.id });

    const convite = await identidade.convidarUsuario({
      redeId: rede.id,
      nome: 'Carlos Lima',
      email: '  Carlos.LIMA@Escola.BR  ',
      cpf: gerarCpf(5),
      atribuicoes: [{ unidadeId: unidade.id, papel: 'professor' }],
    });

    const usuarios = await identidade.listarUsuarios(rede.id);
    expect(usuarios[0]?.email).toBe('carlos.lima@escola.br');
    const entrada = await identidade.autenticar({
      redeSlug: 'normalizado',
      identificador: gerarCpf(5),
      senha: valorDe(convite).senhaProvisoria,
      ip: '',
    });
    expect(entrada.ok).toBe(true);
  });

  test('recusa e-mail já usado na mesma rede', async () => {
    const rede = await criarRede();
    const unidade = await criarUnidadeDeTeste({ redeId: rede.id });
    await criarUsuario({ redeId: rede.id, email: 'ocupado@escola.br' });

    const resultado = await identidade.convidarUsuario({
      redeId: rede.id,
      nome: 'Outra Pessoa',
      email: 'ocupado@escola.br',
      cpf: gerarCpf(6),
      atribuicoes: [{ unidadeId: unidade.id, papel: 'professor' }],
    });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'email',
        codigo: 'email_em_uso',
        mensagem: 'já existe usuário com este e-mail na rede',
      },
    ]);
    expect(await identidade.listarUsuarios(rede.id)).toHaveLength(1);
  });

  test('a checagem de e-mail duplicado enxerga a diferença de caixa', async () => {
    const rede = await criarRede();
    const unidade = await criarUnidadeDeTeste({ redeId: rede.id });
    await criarUsuario({ redeId: rede.id, email: 'ocupado@escola.br' });

    const resultado = await identidade.convidarUsuario({
      redeId: rede.id,
      nome: 'Outra Pessoa',
      email: 'OCUPADO@Escola.BR',
      cpf: gerarCpf(7),
      atribuicoes: [{ unidadeId: unidade.id, papel: 'professor' }],
    });

    expect(errosDe(resultado)[0]?.codigo).toBe('email_em_uso');
  });

  test('aceita o mesmo e-mail em rede diferente: a unicidade é por rede', async () => {
    const prefeitura = await criarRede({ slug: 'prefeitura' });
    const colegio = await criarRede({ slug: 'colegio' });
    const daPrefeitura = await criarUnidadeDeTeste({ redeId: prefeitura.id });
    const doColegio = await criarUnidadeDeTeste({ redeId: colegio.id });
    await criarUsuario({ redeId: prefeitura.id, email: 'ana.souza@escola.br' });

    const resultado = await identidade.convidarUsuario({
      redeId: colegio.id,
      nome: 'Ana Souza',
      email: 'ana.souza@escola.br',
      cpf: gerarCpf(8),
      atribuicoes: [{ unidadeId: doColegio.id, papel: 'secretaria' }],
    });

    expect(resultado.ok).toBe(true);
    expect(await identidade.listarUsuarios(prefeitura.id)).toHaveLength(1);
    expect(await identidade.listarUsuarios(colegio.id)).toHaveLength(1);
    expect(daPrefeitura.redeId).not.toBe(doColegio.redeId);
  });

  test('papel de responsável sem cadastro de responsável é recusado', async () => {
    const rede = await criarRede();
    const unidade = await criarUnidadeDeTeste({ redeId: rede.id });

    const resultado = await identidade.convidarUsuario({
      redeId: rede.id,
      nome: 'Mãe da Ana',
      email: 'mae.da.ana@familia.br',
      cpf: gerarCpf(9),
      atribuicoes: [{ unidadeId: unidade.id, papel: 'responsavel' }],
    });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'responsavelId',
        codigo: 'responsavel_obrigatorio',
        mensagem:
          'quem entra como responsável precisa estar ligado a um cadastro de responsável',
      },
    ]);
    expect(await identidade.listarUsuarios(rede.id)).toHaveLength(0);
  });

  test('papel de responsável com cadastro ligado entra e carrega o vínculo na sessão', async () => {
    const rede = await criarRede({ slug: 'portal' });
    const unidade = await criarUnidadeDeTeste({ redeId: rede.id });
    const responsavel = await criarResponsavel({ redeId: rede.id });

    const convite = await identidade.convidarUsuario({
      redeId: rede.id,
      nome: 'Mãe da Ana',
      email: 'mae.da.ana@familia.br',
      cpf: gerarCpf(10),
      atribuicoes: [{ unidadeId: unidade.id, papel: 'responsavel' }],
      responsavelId: responsavel.id,
    });

    const entrada = await identidade.autenticar({
      redeSlug: 'portal',
      identificador: gerarCpf(10),
      senha: valorDe(convite).senhaProvisoria,
      ip: '',
    });
    expect(valorDe(entrada).usuario.responsavelId).toBe(responsavel.id);
  });

  test('recusa unidade de outra rede sem criar o usuário', async () => {
    const nossa = await criarRede();
    const alheia = await criarRede();
    const unidadeAlheia = await criarUnidadeDeTeste({ redeId: alheia.id });

    const resultado = await identidade.convidarUsuario({
      redeId: nossa.id,
      nome: 'Intrusa',
      email: 'intrusa@escola.br',
      cpf: gerarCpf(11),
      atribuicoes: [{ unidadeId: unidadeAlheia.id, papel: 'admin_rede' }],
    });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'atribuicoes',
        codigo: 'unidade_de_outra_rede',
        mensagem: 'unidade não pertence a esta rede',
      },
    ]);
    expect(await identidade.listarUsuarios(nossa.id)).toHaveLength(0);
  });

  test('convite sem nenhuma atribuição é recusado', async () => {
    const rede = await criarRede();

    const resultado = await identidade.convidarUsuario({
      redeId: rede.id,
      nome: 'Sem Papel',
      email: 'sem.papel@escola.br',
      cpf: gerarCpf(12),
      atribuicoes: [],
    });

    expect(errosDe(resultado)[0]?.campo).toBe('atribuicoes');
  });

  test('e-mail inválido é recusado antes de tocar no banco', async () => {
    const rede = await criarRede();
    const unidade = await criarUnidadeDeTeste({ redeId: rede.id });

    const resultado = await identidade.convidarUsuario({
      redeId: rede.id,
      nome: 'Ana Souza',
      email: 'ana-arroba-nada',
      cpf: gerarCpf(13),
      atribuicoes: [{ unidadeId: unidade.id, papel: 'professor' }],
    });

    expect(errosDe(resultado)[0]?.campo).toBe('email');
    expect(await identidade.listarUsuarios(rede.id)).toHaveLength(0);
  });

  test('o mesmo par unidade e papel repetido no formulário vira uma única linha', async () => {
    const rede = await criarRede();
    const unidade = await criarUnidadeDeTeste({ redeId: rede.id, nome: 'Escola Única' });

    const resultado = await identidade.convidarUsuario({
      redeId: rede.id,
      nome: 'Ana Souza',
      email: 'ana@escola.br',
      cpf: gerarCpf(14),
      atribuicoes: [
        { unidadeId: unidade.id, papel: 'professor' },
        { unidadeId: unidade.id, papel: 'professor' },
      ],
    });

    expect(resultado.ok).toBe(true);
    const usuarios = await identidade.listarUsuarios(rede.id);
    expect(usuarios[0]?.papeis).toEqual([
      { unidadeId: unidade.id, unidadeNome: 'Escola Única', papel: 'professor' },
    ]);
  });

  test('recusa convite com CPF inválido', async () => {
    const rede = await criarRede({});
    const unidade = await criarUnidadeDeTeste({ redeId: rede.id });

    const convite = await identidade.convidarUsuario({
      redeId: rede.id,
      nome: 'Rui Barbosa Neto',
      email: 'rui@escolaviva.test',
      cpf: '11111111111',
      atribuicoes: [{ unidadeId: unidade.id, papel: 'secretaria' }],
    });

    expect(convite.ok).toBe(false);
    if (!convite.ok) expect(convite.erros[0]?.campo).toBe('cpf');
  });

  test('recusa CPF já usado por outro usuário da mesma rede', async () => {
    const rede = await criarRede({});
    const unidade = await criarUnidadeDeTeste({ redeId: rede.id });
    await criarUsuario({ redeId: rede.id, cpf: '52998224725', papeis: [] });

    const convite = await identidade.convidarUsuario({
      redeId: rede.id,
      nome: 'Outra Pessoa',
      email: 'outra@escolaviva.test',
      cpf: '52998224725',
      atribuicoes: [{ unidadeId: unidade.id, papel: 'secretaria' }],
    });

    expect(convite.ok).toBe(false);
    if (!convite.ok) expect(convite.erros[0]?.campo).toBe('cpf');
  });

  test('o mesmo CPF em outra rede é aceito — a unicidade é por tenant', async () => {
    const a = await criarRede({});
    const b = await criarRede({});
    const unidadeB = await criarUnidadeDeTeste({ redeId: b.id });
    await criarUsuario({ redeId: a.id, cpf: '52998224725', papeis: [] });

    const convite = await identidade.convidarUsuario({
      redeId: b.id,
      nome: 'Homônimo de Outra Rede',
      email: 'homonimo@escolaviva.test',
      cpf: '52998224725',
      atribuicoes: [{ unidadeId: unidadeB.id, papel: 'secretaria' }],
    });

    expect(convite.ok).toBe(true);
  });

  test('recusa quando o CPF digitado diverge do cadastro do responsável', async () => {
    const rede = await criarRede({});
    const unidade = await criarUnidadeDeTeste({ redeId: rede.id });
    const responsavel = await criarResponsavel({ redeId: rede.id, cpf: '52998224725' });

    const convite = await identidade.convidarUsuario({
      redeId: rede.id,
      nome: 'Mãe do Aluno',
      email: 'mae@escolaviva.test',
      cpf: gerarCpf(1),
      responsavelId: responsavel.id,
      cpfDoCadastro: responsavel.cpf,
      nomeDoCadastro: responsavel.nome,
      atribuicoes: [{ unidadeId: unidade.id, papel: 'responsavel' }],
    });

    expect(convite.ok).toBe(false);
    if (!convite.ok) {
      expect(convite.erros[0]?.campo).toBe('cpf');
      expect(convite.erros[0]?.mensagem).toContain(responsavel.nome);
      expect(convite.erros[0]?.mensagem).not.toContain(responsavel.cpf);
    }
  });

  /* Durante a janela os cadastros antigos ainda não têm CPF; exigi-lo bloquearia um fluxo que
     funcionava, que é o oposto do que a compatibilidade promete. */
  test('aceita quando o cadastro do responsável ainda não tem CPF', async () => {
    const rede = await criarRede({});
    const unidade = await criarUnidadeDeTeste({ redeId: rede.id });
    const responsavel = await criarResponsavel({ redeId: rede.id, cpf: null });

    const convite = await identidade.convidarUsuario({
      redeId: rede.id,
      nome: 'Pai do Aluno',
      email: 'pai@escolaviva.test',
      cpf: gerarCpf(2),
      responsavelId: responsavel.id,
      cpfDoCadastro: null,
      nomeDoCadastro: responsavel.nome,
      atribuicoes: [{ unidadeId: unidade.id, papel: 'responsavel' }],
    });

    expect(convite.ok).toBe(true);
  });

  test('o CPF gravado no convite volta na leitura do usuário', async () => {
    const rede = await criarRede({});
    const unidade = await criarUnidadeDeTeste({ redeId: rede.id });

    const convite = await identidade.convidarUsuario({
      redeId: rede.id,
      nome: 'Marina Alves Correia',
      email: 'marina@escolaviva.test',
      cpf: '52998224725',
      atribuicoes: [{ unidadeId: unidade.id, papel: 'secretaria' }],
    });
    if (!convite.ok) throw new Error('convite recusado no cenário');
    // `identidade` não expõe consulta de usuário por id, e criar uma porta pública só para
    // satisfazer um teste seria escopo que ninguém pediu. `checklist.test.ts` já afirma "a linha
    // caiu no banco" exatamente assim.
    const linhas = await sqlDeTeste()<{ cpf: string }[]>`
      SELECT cpf FROM usuario WHERE id = ${convite.valor.usuarioId}`;

    expect(linhas[0]?.cpf).toBe('52998224725');
  });
});

describe('unidades da rede', () => {
  test('criarUnidade grava a unidade ativa e ela aparece na listagem', async () => {
    const rede = await criarRede();

    const resultado = await identidade.criarUnidade({
      redeId: rede.id,
      nome: 'Escola Municipal Aurora',
      codigoInep: '32012345',
    });

    const unidade = valorDe(resultado);
    expect(unidade).toEqual({
      id: unidade.id,
      redeId: rede.id,
      nome: 'Escola Municipal Aurora',
      codigoInep: '32012345',
      ativa: true,
    });
    expect(await identidade.listarUnidades(rede.id)).toEqual([unidade]);
  });

  test('código INEP em branco vira ausência de código', async () => {
    const rede = await criarRede();

    const resultado = await identidade.criarUnidade({
      redeId: rede.id,
      nome: 'Escola Sem INEP',
      codigoInep: '',
    });

    expect(valorDe(resultado).codigoInep).toBeNull();
  });

  test('recusa unidade com nome já usado na rede', async () => {
    const rede = await criarRede();
    await criarUnidadeDeTeste({ redeId: rede.id, nome: 'Escola Centro' });

    const resultado = await identidade.criarUnidade({ redeId: rede.id, nome: 'Escola Centro' });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'nome',
        codigo: 'nome_em_uso',
        mensagem: 'já existe unidade com este nome na rede',
      },
    ]);
    expect(await identidade.listarUnidades(rede.id)).toHaveLength(1);
  });

  test('o mesmo nome de unidade é aceito em outra rede', async () => {
    const primeira = await criarRede();
    const segunda = await criarRede();
    await criarUnidadeDeTeste({ redeId: primeira.id, nome: 'Escola Centro' });

    const resultado = await identidade.criarUnidade({ redeId: segunda.id, nome: 'Escola Centro' });

    expect(resultado.ok).toBe(true);
  });

  test('unidade sem nome é recusada', async () => {
    const rede = await criarRede();

    const resultado = await identidade.criarUnidade({ redeId: rede.id, nome: '   ' });

    expect(errosDe(resultado)[0]?.campo).toBe('nome');
  });

  test('unidadePorId devolve a unidade da rede e nulo para id desconhecido', async () => {
    const rede = await criarRede();
    const unidade = await criarUnidadeDeTeste({ redeId: rede.id, nome: 'Escola Centro' });

    const encontrada = await identidade.unidadePorId(rede.id, unidade.id);

    expect(encontrada?.nome).toBe('Escola Centro');
    expect(await identidade.unidadePorId(rede.id, crypto.randomUUID())).toBeNull();
  });

  test('id fora do formato devolve nulo e lista vazia em vez de erro de conversão', async () => {
    const rede = await criarRede();
    await criarUnidadeDeTeste({ redeId: rede.id });

    const encontrada = await identidade.unidadePorId(rede.id, 'nao-e-uuid');

    expect(encontrada).toBeNull();
    expect(await identidade.listarUnidades('nao-e-uuid')).toEqual([]);
    expect(await identidade.listarUsuarios('nao-e-uuid')).toEqual([]);
  });
});

describe('professores da unidade', () => {
  test('ehProfessorNaUnidade só confirma quem tem o papel naquela unidade', async () => {
    const cenario = await cenarioCompleto();
    const [centro, praia] = cenario.unidades;

    const naUnidadeCerta = await identidade.ehProfessorNaUnidade(
      cenario.rede.id, cenario.professor.id, centro.id,
    );

    expect(naUnidadeCerta).toBe(true);
    expect(
      await identidade.ehProfessorNaUnidade(cenario.rede.id, cenario.professor.id, praia.id),
    ).toBe(false);
  });

  test('quem tem outro papel na unidade não é professor ali', async () => {
    const cenario = await cenarioCompleto();
    const [centro] = cenario.unidades;

    const secretariaEhProfessora = await identidade.ehProfessorNaUnidade(
      cenario.rede.id, cenario.secretaria.id, centro.id,
    );

    expect(secretariaEhProfessora).toBe(false);
  });

  test('professoresDaUnidade traz só os professores daquela unidade, em ordem de nome', async () => {
    const rede = await criarRede();
    const centro = await criarUnidadeDeTeste({ redeId: rede.id, nome: 'Escola Centro' });
    const praia = await criarUnidadeDeTeste({ redeId: rede.id, nome: 'Escola Praia' });
    const bruna = await criarUsuario({
      redeId: rede.id, nome: 'Bruna Alves', papeis: [{ unidadeId: centro.id, papel: 'professor' }],
    });
    const alice = await criarUsuario({
      redeId: rede.id, nome: 'Alice Reis', papeis: [{ unidadeId: centro.id, papel: 'professor' }],
    });
    await criarUsuario({
      redeId: rede.id, nome: 'Carla Dias', papeis: [{ unidadeId: praia.id, papel: 'professor' }],
    });
    await criarUsuario({
      redeId: rede.id, nome: 'Dina Melo', papeis: [{ unidadeId: centro.id, papel: 'secretaria' }],
    });

    const professores = await identidade.professoresDaUnidade(rede.id, centro.id);

    expect(professores).toEqual([
      { id: alice.id, nome: 'Alice Reis' },
      { id: bruna.id, nome: 'Bruna Alves' },
    ]);
  });

  test('professor desativado sai da lista da unidade', async () => {
    const rede = await criarRede();
    const centro = await criarUnidadeDeTeste({ redeId: rede.id });
    await criarUsuario({
      redeId: rede.id, nome: 'Fora Daqui', ativo: false,
      papeis: [{ unidadeId: centro.id, papel: 'professor' }],
    });

    const professores = await identidade.professoresDaUnidade(rede.id, centro.id);

    expect(professores).toEqual([]);
  });
});

describe('consultas de apoio', () => {
  test('redePorSlug devolve a rede da tela de login e nulo para slug desconhecido', async () => {
    const rede = await criarRede({ nome: 'Rede Serra', slug: 'serra' });

    const encontrada = await identidade.redePorSlug('serra');

    expect(encontrada).toEqual({ id: rede.id, nome: 'Rede Serra', slug: 'serra', status: 'ativa' });
    expect(await identidade.redePorSlug('nao-existe')).toBeNull();
  });

  test('nomesDeUsuarios resolve os nomes pedidos em um mapa', async () => {
    const rede = await criarRede();
    const ana = await criarUsuario({ redeId: rede.id, nome: 'Ana Souza' });
    const bia = await criarUsuario({ redeId: rede.id, nome: 'Bia Nunes' });

    const nomes = await identidade.nomesDeUsuarios(rede.id, [ana.id, bia.id, ana.id]);

    expect(nomes).toEqual(new Map([[ana.id, 'Ana Souza'], [bia.id, 'Bia Nunes']]));
  });

  test('nomesDeUsuarios ignora id fora do formato e lista vazia', async () => {
    const rede = await criarRede();
    const ana = await criarUsuario({ redeId: rede.id, nome: 'Ana Souza' });

    const nomes = await identidade.nomesDeUsuarios(rede.id, ['lixo', ana.id]);

    expect(nomes).toEqual(new Map([[ana.id, 'Ana Souza']]));
    expect(await identidade.nomesDeUsuarios(rede.id, [])).toEqual(new Map());
  });

  test('listarUsuarios traz também quem está desativado, marcado como tal', async () => {
    const rede = await criarRede();
    await criarUsuario({ redeId: rede.id, nome: 'Ana Souza' });
    await criarUsuario({ redeId: rede.id, nome: 'Zeca Paz', ativo: false });

    const usuarios = await identidade.listarUsuarios(rede.id);

    expect(usuarios.map((u) => [u.nome, u.ativo])).toEqual([
      ['Ana Souza', true],
      ['Zeca Paz', false],
    ]);
  });
});

describe('isolamento de tenant', () => {
  test('nenhuma consulta de identidade da rede A devolve linha da rede B', async () => {
    const { a, b } = await duasRedes();
    const idsDeB = [b.admin.id, b.secretaria.id, b.professor.id];

    const unidades = await identidade.listarUnidades(a.rede.id);
    const usuarios = await identidade.listarUsuarios(a.rede.id);
    const nomes = await identidade.nomesDeUsuarios(a.rede.id, idsDeB);

    expect(unidades.every((unidade) => unidade.redeId === a.rede.id)).toBe(true);
    expect(unidades.map((unidade) => unidade.id)).not.toContain(b.unidades[0].id);
    expect(usuarios.map((usuario) => usuario.id)).not.toContain(b.admin.id);
    expect(usuarios.every((usuario) => !usuario.email.includes(b.admin.email))).toBe(true);
    expect(nomes.size).toBe(0);
  });

  test('unidade e papel de outra rede não são alcançáveis pelo id', async () => {
    const { a, b } = await duasRedes();

    const unidadeAlheia = await identidade.unidadePorId(a.rede.id, b.unidades[0].id);

    expect(unidadeAlheia).toBeNull();
    expect(
      await identidade.ehProfessorNaUnidade(a.rede.id, b.professor.id, b.unidades[0].id),
    ).toBe(false);
    expect(await identidade.professoresDaUnidade(a.rede.id, b.unidades[0].id)).toEqual([]);
  });

  test('os papéis carregados na sessão são apenas os da rede do usuário', async () => {
    const { a, b } = await duasRedes();

    const entrada = await identidade.autenticar({
      redeSlug: a.rede.slug, identificador: a.admin.cpf, senha: a.senha, ip: '',
    });

    const papeis = valorDe(entrada).usuario.papeis;
    const unidadesDeB = [b.unidades[0].id, b.unidades[1].id];
    expect(papeis.every((papel) => !unidadesDeB.includes(papel.unidadeId))).toBe(true);
    expect(papeis).toHaveLength(2);
  });
});

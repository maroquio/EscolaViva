/*
 * Quem existe na rede e o que cada um pode. O convite, a unidade e as consultas que o restante
 * do produto faz a identidade — inclusive a pergunta "esta pessoa é professora nesta unidade?",
 * que é a fronteira pela qual o acadêmico entra aqui.
 *
 * A unicidade de e-mail é POR REDE, não global: duas prefeituras podem ter a mesma secretária
 * cadastrada, e é isso que permite vender a mesma pessoa para duas contas.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { identity } from '../../src/identity';
import { generateCpf } from '../../src/shared/document';
import type { ApplicationError, Result } from '../../src/shared/result';
import { limparBanco, sqlDeTeste } from '../apoio/banco';
import {
  cenarioCompleto,
  criarRede,
  criarResponsavel,
  criarUnidade as criarUnidadeDeTeste,
  criarUsuario,
  duasRedes,
} from '../apoio/fabricas';

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

beforeEach(limparBanco);

describe('convidarUsuario', () => {
  test('cria o usuário com os papéis pedidos e devolve a senha provisória', async () => {
    const rede = await criarRede({ slug: 'convite' });
    const centro = await criarUnidadeDeTeste({ networkId: rede.id, name: 'Escola Centro' });
    const praia = await criarUnidadeDeTeste({ networkId: rede.id, name: 'Escola Praia' });

    const resultado = await identity.inviteUser({
      networkId: rede.id,
      name: 'Ana Souza',
      email: 'ana.souza@convite.br',
      cpf: generateCpf(3),
      roleAssignments: [
        { schoolId: centro.id, role: 'teacher' },
        { schoolId: praia.id, role: 'registrar' },
      ],
    });

    const { userId, temporaryPassword } = valorDe(resultado);
    expect(temporaryPassword).toHaveLength(12);
    const usuarios = await identity.listUsers(rede.id);
    expect(usuarios).toEqual([
      {
        id: userId,
        name: 'Ana Souza',
        email: 'ana.souza@convite.br',
        cpf: generateCpf(3),
        active: true,
        roles: [
          { schoolId: centro.id, schoolName: 'Escola Centro', role: 'teacher' },
          { schoolId: praia.id, schoolName: 'Escola Praia', role: 'registrar' },
        ],
      },
    ]);
  });

  test('a senha provisória devolvida realmente autentica', async () => {
    const rede = await criarRede({ slug: 'provisoria' });
    const unidade = await criarUnidadeDeTeste({ networkId: rede.id });
    const convite = await identity.inviteUser({
      networkId: rede.id,
      name: 'Bia Nunes',
      email: 'bia@provisoria.br',
      cpf: generateCpf(4),
      roleAssignments: [{ schoolId: unidade.id, role: 'registrar' }],
    });

    const entrada = await identity.authenticate({
      networkSlug: 'provisoria',
      loginIdentifier: generateCpf(4),
      password: valorDe(convite).temporaryPassword,
      ip: '',
    });

    expect(valorDe(entrada).user.id).toBe(valorDe(convite).userId);
  });

  test('o e-mail é guardado normalizado e autentica em qualquer caixa', async () => {
    const rede = await criarRede({ slug: 'normalizado' });
    const unidade = await criarUnidadeDeTeste({ networkId: rede.id });

    const convite = await identity.inviteUser({
      networkId: rede.id,
      name: 'Carlos Lima',
      email: '  Carlos.LIMA@Escola.BR  ',
      cpf: generateCpf(5),
      roleAssignments: [{ schoolId: unidade.id, role: 'teacher' }],
    });

    const usuarios = await identity.listUsers(rede.id);
    expect(usuarios[0]?.email).toBe('carlos.lima@escola.br');
    const entrada = await identity.authenticate({
      networkSlug: 'normalizado',
      loginIdentifier: generateCpf(5),
      password: valorDe(convite).temporaryPassword,
      ip: '',
    });
    expect(entrada.ok).toBe(true);
  });

  test('recusa e-mail já usado na mesma rede', async () => {
    const rede = await criarRede();
    const unidade = await criarUnidadeDeTeste({ networkId: rede.id });
    await criarUsuario({ networkId: rede.id, email: 'ocupado@escola.br' });

    const resultado = await identity.inviteUser({
      networkId: rede.id,
      name: 'Outra Pessoa',
      email: 'ocupado@escola.br',
      cpf: generateCpf(6),
      roleAssignments: [{ schoolId: unidade.id, role: 'teacher' }],
    });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'email',
        codigo: 'email_em_uso',
        mensagem: 'já existe usuário com este e-mail na rede',
      },
    ]);
    expect(await identity.listUsers(rede.id)).toHaveLength(1);
  });

  test('a checagem de e-mail duplicado enxerga a diferença de caixa', async () => {
    const rede = await criarRede();
    const unidade = await criarUnidadeDeTeste({ networkId: rede.id });
    await criarUsuario({ networkId: rede.id, email: 'ocupado@escola.br' });

    const resultado = await identity.inviteUser({
      networkId: rede.id,
      name: 'Outra Pessoa',
      email: 'OCUPADO@Escola.BR',
      cpf: generateCpf(7),
      roleAssignments: [{ schoolId: unidade.id, role: 'teacher' }],
    });

    expect(errosDe(resultado)[0]?.codigo).toBe('email_em_uso');
  });

  test('aceita o mesmo e-mail em rede diferente: a unicidade é por rede', async () => {
    const prefeitura = await criarRede({ slug: 'prefeitura' });
    const colegio = await criarRede({ slug: 'colegio' });
    const daPrefeitura = await criarUnidadeDeTeste({ networkId: prefeitura.id });
    const doColegio = await criarUnidadeDeTeste({ networkId: colegio.id });
    await criarUsuario({ networkId: prefeitura.id, email: 'ana.souza@escola.br' });

    const resultado = await identity.inviteUser({
      networkId: colegio.id,
      name: 'Ana Souza',
      email: 'ana.souza@escola.br',
      cpf: generateCpf(8),
      roleAssignments: [{ schoolId: doColegio.id, role: 'registrar' }],
    });

    expect(resultado.ok).toBe(true);
    expect(await identity.listUsers(prefeitura.id)).toHaveLength(1);
    expect(await identity.listUsers(colegio.id)).toHaveLength(1);
    expect(daPrefeitura.networkId).not.toBe(doColegio.networkId);
  });

  test('papel de responsável sem cadastro de responsável é recusado', async () => {
    const rede = await criarRede();
    const unidade = await criarUnidadeDeTeste({ networkId: rede.id });

    const resultado = await identity.inviteUser({
      networkId: rede.id,
      name: 'Mãe da Ana',
      email: 'mae.da.ana@familia.br',
      cpf: generateCpf(9),
      roleAssignments: [{ schoolId: unidade.id, role: 'guardian' }],
    });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'responsavelId',
        codigo: 'responsavel_obrigatorio',
        mensagem:
          'quem entra como responsável precisa estar ligado a um cadastro de responsável',
      },
    ]);
    expect(await identity.listUsers(rede.id)).toHaveLength(0);
  });

  test('papel de responsável com cadastro ligado entra e carrega o vínculo na sessão', async () => {
    const rede = await criarRede({ slug: 'portal' });
    const unidade = await criarUnidadeDeTeste({ networkId: rede.id });
    const responsavel = await criarResponsavel({ networkId: rede.id });

    const convite = await identity.inviteUser({
      networkId: rede.id,
      name: 'Mãe da Ana',
      email: 'mae.da.ana@familia.br',
      cpf: generateCpf(10),
      roleAssignments: [{ schoolId: unidade.id, role: 'guardian' }],
      guardianId: responsavel.id,
    });

    const entrada = await identity.authenticate({
      networkSlug: 'portal',
      loginIdentifier: generateCpf(10),
      password: valorDe(convite).temporaryPassword,
      ip: '',
    });
    expect(valorDe(entrada).user.guardianId).toBe(responsavel.id);
  });

  test('recusa unidade de outra rede sem criar o usuário', async () => {
    const nossa = await criarRede();
    const alheia = await criarRede();
    const unidadeAlheia = await criarUnidadeDeTeste({ networkId: alheia.id });

    const resultado = await identity.inviteUser({
      networkId: nossa.id,
      name: 'Intrusa',
      email: 'intrusa@escola.br',
      cpf: generateCpf(11),
      roleAssignments: [{ schoolId: unidadeAlheia.id, role: 'network_admin' }],
    });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'atribuicoes',
        codigo: 'unidade_de_outra_rede',
        mensagem: 'unidade não pertence a esta rede',
      },
    ]);
    expect(await identity.listUsers(nossa.id)).toHaveLength(0);
  });

  test('convite sem nenhuma atribuição é recusado', async () => {
    const rede = await criarRede();

    const resultado = await identity.inviteUser({
      networkId: rede.id,
      name: 'Sem Papel',
      email: 'sem.papel@escola.br',
      cpf: generateCpf(12),
      roleAssignments: [],
    });

    expect(errosDe(resultado)[0]?.campo).toBe('atribuicoes');
  });

  test('e-mail inválido é recusado antes de tocar no banco', async () => {
    const rede = await criarRede();
    const unidade = await criarUnidadeDeTeste({ networkId: rede.id });

    const resultado = await identity.inviteUser({
      networkId: rede.id,
      name: 'Ana Souza',
      email: 'ana-arroba-nada',
      cpf: generateCpf(13),
      roleAssignments: [{ schoolId: unidade.id, role: 'teacher' }],
    });

    expect(errosDe(resultado)[0]?.campo).toBe('email');
    expect(await identity.listUsers(rede.id)).toHaveLength(0);
  });

  test('o mesmo par unidade e papel repetido no formulário vira uma única linha', async () => {
    const rede = await criarRede();
    const unidade = await criarUnidadeDeTeste({ networkId: rede.id, name: 'Escola Única' });

    const resultado = await identity.inviteUser({
      networkId: rede.id,
      name: 'Ana Souza',
      email: 'ana@escola.br',
      cpf: generateCpf(14),
      roleAssignments: [
        { schoolId: unidade.id, role: 'teacher' },
        { schoolId: unidade.id, role: 'teacher' },
      ],
    });

    expect(resultado.ok).toBe(true);
    const usuarios = await identity.listUsers(rede.id);
    expect(usuarios[0]?.roles).toEqual([
      { schoolId: unidade.id, schoolName: 'Escola Única', role: 'teacher' },
    ]);
  });

  test('recusa convite com CPF inválido', async () => {
    const rede = await criarRede({});
    const unidade = await criarUnidadeDeTeste({ networkId: rede.id });

    const convite = await identity.inviteUser({
      networkId: rede.id,
      name: 'Rui Barbosa Neto',
      email: 'rui@escolaviva.test',
      cpf: '11111111111',
      roleAssignments: [{ schoolId: unidade.id, role: 'registrar' }],
    });

    expect(convite.ok).toBe(false);
    if (!convite.ok) expect(convite.erros[0]?.campo).toBe('cpf');
  });

  test('recusa CPF já usado por outro usuário da mesma rede', async () => {
    const rede = await criarRede({});
    const unidade = await criarUnidadeDeTeste({ networkId: rede.id });
    await criarUsuario({ networkId: rede.id, cpf: '52998224725', papeis: [] });

    const convite = await identity.inviteUser({
      networkId: rede.id,
      name: 'Outra Pessoa',
      email: 'outra@escolaviva.test',
      cpf: '52998224725',
      roleAssignments: [{ schoolId: unidade.id, role: 'registrar' }],
    });

    expect(convite.ok).toBe(false);
    if (!convite.ok) expect(convite.erros[0]?.campo).toBe('cpf');
  });

  test('o mesmo CPF em outra rede é aceito — a unicidade é por tenant', async () => {
    const a = await criarRede({});
    const b = await criarRede({});
    const unidadeB = await criarUnidadeDeTeste({ networkId: b.id });
    await criarUsuario({ networkId: a.id, cpf: '52998224725', papeis: [] });

    const convite = await identity.inviteUser({
      networkId: b.id,
      name: 'Homônimo de Outra Rede',
      email: 'homonimo@escolaviva.test',
      cpf: '52998224725',
      roleAssignments: [{ schoolId: unidadeB.id, role: 'registrar' }],
    });

    expect(convite.ok).toBe(true);
  });

  test('recusa quando o CPF digitado diverge do cadastro do responsável', async () => {
    const rede = await criarRede({});
    const unidade = await criarUnidadeDeTeste({ networkId: rede.id });
    const responsavel = await criarResponsavel({ networkId: rede.id, cpf: '52998224725' });

    const convite = await identity.inviteUser({
      networkId: rede.id,
      name: 'Mãe do Aluno',
      email: 'mae@escolaviva.test',
      cpf: generateCpf(1),
      guardianId: responsavel.id,
      registeredCpf: responsavel.cpf,
      registeredName: responsavel.name,
      roleAssignments: [{ schoolId: unidade.id, role: 'guardian' }],
    });

    expect(convite.ok).toBe(false);
    if (!convite.ok) {
      expect(convite.erros[0]?.campo).toBe('cpf');
      expect(convite.erros[0]?.mensagem).toContain(responsavel.name);
      expect(convite.erros[0]?.mensagem).not.toContain(responsavel.cpf);
    }
  });

  /* Durante a janela os cadastros antigos ainda não têm CPF; exigi-lo bloquearia um fluxo que
     funcionava, que é o oposto do que a compatibilidade promete. */
  test('aceita quando o cadastro do responsável ainda não tem CPF', async () => {
    const rede = await criarRede({});
    const unidade = await criarUnidadeDeTeste({ networkId: rede.id });
    const responsavel = await criarResponsavel({ networkId: rede.id, cpf: null });

    const convite = await identity.inviteUser({
      networkId: rede.id,
      name: 'Pai do Aluno',
      email: 'pai@escolaviva.test',
      cpf: generateCpf(2),
      guardianId: responsavel.id,
      registeredCpf: null,
      registeredName: responsavel.name,
      roleAssignments: [{ schoolId: unidade.id, role: 'guardian' }],
    });

    expect(convite.ok).toBe(true);
  });

  test('o CPF gravado no convite volta na leitura do usuário', async () => {
    const rede = await criarRede({});
    const unidade = await criarUnidadeDeTeste({ networkId: rede.id });

    const convite = await identity.inviteUser({
      networkId: rede.id,
      name: 'Marina Alves Correia',
      email: 'marina@escolaviva.test',
      cpf: '52998224725',
      roleAssignments: [{ schoolId: unidade.id, role: 'registrar' }],
    });
    if (!convite.ok) throw new Error('convite recusado no cenário');
    // `identity` não expõe consulta de usuário por id, e criar uma porta pública só para
    // satisfazer um teste seria escopo que ninguém pediu. `checklist.test.ts` já afirma "a linha
    // caiu no banco" exatamente assim.
    const linhas = await sqlDeTeste()<{ cpf: string }[]>`
      SELECT cpf FROM app_user WHERE id = ${convite.valor.userId}`;

    expect(linhas[0]?.cpf).toBe('52998224725');
  });
});

describe('unidades da rede', () => {
  test('criarUnidade grava a unidade ativa e ela aparece na listagem', async () => {
    const rede = await criarRede();

    const resultado = await identity.createSchool({
      networkId: rede.id,
      name: 'Escola Municipal Aurora',
      inepCode: '32012345',
    });

    const unidade = valorDe(resultado);
    expect(unidade).toEqual({
      id: unidade.id,
      networkId: rede.id,
      name: 'Escola Municipal Aurora',
      inepCode: '32012345',
      active: true,
    });
    expect(await identity.listSchools(rede.id)).toEqual([unidade]);
  });

  test('código INEP em branco vira ausência de código', async () => {
    const rede = await criarRede();

    const resultado = await identity.createSchool({
      networkId: rede.id,
      name: 'Escola Sem INEP',
      inepCode: '',
    });

    expect(valorDe(resultado).inepCode).toBeNull();
  });

  test('recusa unidade com nome já usado na rede', async () => {
    const rede = await criarRede();
    await criarUnidadeDeTeste({ networkId: rede.id, name: 'Escola Centro' });

    const resultado = await identity.createSchool({ networkId: rede.id, name: 'Escola Centro' });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'nome',
        codigo: 'nome_em_uso',
        mensagem: 'já existe unidade com este nome na rede',
      },
    ]);
    expect(await identity.listSchools(rede.id)).toHaveLength(1);
  });

  test('o mesmo nome de unidade é aceito em outra rede', async () => {
    const primeira = await criarRede();
    const segunda = await criarRede();
    await criarUnidadeDeTeste({ networkId: primeira.id, name: 'Escola Centro' });

    const resultado = await identity.createSchool({ networkId: segunda.id, name: 'Escola Centro' });

    expect(resultado.ok).toBe(true);
  });

  test('unidade sem nome é recusada', async () => {
    const rede = await criarRede();

    const resultado = await identity.createSchool({ networkId: rede.id, name: '   ' });

    expect(errosDe(resultado)[0]?.campo).toBe('nome');
  });

  test('unidadePorId devolve a unidade da rede e nulo para id desconhecido', async () => {
    const rede = await criarRede();
    const unidade = await criarUnidadeDeTeste({ networkId: rede.id, name: 'Escola Centro' });

    const encontrada = await identity.schoolById(rede.id, unidade.id);

    expect(encontrada?.name).toBe('Escola Centro');
    expect(await identity.schoolById(rede.id, crypto.randomUUID())).toBeNull();
  });

  test('id fora do formato devolve nulo e lista vazia em vez de erro de conversão', async () => {
    const rede = await criarRede();
    await criarUnidadeDeTeste({ networkId: rede.id });

    const encontrada = await identity.schoolById(rede.id, 'nao-e-uuid');

    expect(encontrada).toBeNull();
    expect(await identity.listSchools('nao-e-uuid')).toEqual([]);
    expect(await identity.listUsers('nao-e-uuid')).toEqual([]);
  });
});

describe('professores da unidade', () => {
  test('ehProfessorNaUnidade só confirma quem tem o papel naquela unidade', async () => {
    const cenario = await cenarioCompleto();
    const [centro, praia] = cenario.unidades;

    const naUnidadeCerta = await identity.isTeacherAtSchool(
      cenario.rede.id, cenario.professor.id, centro.id,
    );

    expect(naUnidadeCerta).toBe(true);
    expect(
      await identity.isTeacherAtSchool(cenario.rede.id, cenario.professor.id, praia.id),
    ).toBe(false);
  });

  test('quem tem outro papel na unidade não é professor ali', async () => {
    const cenario = await cenarioCompleto();
    const [centro] = cenario.unidades;

    const secretariaEhProfessora = await identity.isTeacherAtSchool(
      cenario.rede.id, cenario.secretaria.id, centro.id,
    );

    expect(secretariaEhProfessora).toBe(false);
  });

  test('professoresDaUnidade traz só os professores daquela unidade, em ordem de nome', async () => {
    const rede = await criarRede();
    const centro = await criarUnidadeDeTeste({ networkId: rede.id, name: 'Escola Centro' });
    const praia = await criarUnidadeDeTeste({ networkId: rede.id, name: 'Escola Praia' });
    const bruna = await criarUsuario({
      networkId: rede.id, name: 'Bruna Alves', papeis: [{ schoolId: centro.id, role: 'teacher' }],
    });
    const alice = await criarUsuario({
      networkId: rede.id, name: 'Alice Reis', papeis: [{ schoolId: centro.id, role: 'teacher' }],
    });
    await criarUsuario({
      networkId: rede.id, name: 'Carla Dias', papeis: [{ schoolId: praia.id, role: 'teacher' }],
    });
    await criarUsuario({
      networkId: rede.id, name: 'Dina Melo', papeis: [{ schoolId: centro.id, role: 'registrar' }],
    });

    const professores = await identity.schoolTeachers(rede.id, centro.id);

    expect(professores).toEqual([
      { id: alice.id, name: 'Alice Reis' },
      { id: bruna.id, name: 'Bruna Alves' },
    ]);
  });

  test('professor desativado sai da lista da unidade', async () => {
    const rede = await criarRede();
    const centro = await criarUnidadeDeTeste({ networkId: rede.id });
    await criarUsuario({
      networkId: rede.id, name: 'Fora Daqui', active: false,
      papeis: [{ schoolId: centro.id, role: 'teacher' }],
    });

    const professores = await identity.schoolTeachers(rede.id, centro.id);

    expect(professores).toEqual([]);
  });
});

describe('consultas de apoio', () => {
  test('redePorSlug devolve a rede da tela de login e nulo para slug desconhecido', async () => {
    const rede = await criarRede({ name: 'Rede Serra', slug: 'serra' });

    const encontrada = await identity.networkBySlug('serra');

    expect(encontrada).toEqual({ id: rede.id, name: 'Rede Serra', slug: 'serra', status: 'active' });
    expect(await identity.networkBySlug('nao-existe')).toBeNull();
  });

  test('nomesDeUsuarios resolve os nomes pedidos em um mapa', async () => {
    const rede = await criarRede();
    const ana = await criarUsuario({ networkId: rede.id, name: 'Ana Souza' });
    const bia = await criarUsuario({ networkId: rede.id, name: 'Bia Nunes' });

    const nomes = await identity.userNames(rede.id, [ana.id, bia.id, ana.id]);

    expect(nomes).toEqual(new Map([[ana.id, 'Ana Souza'], [bia.id, 'Bia Nunes']]));
  });

  test('nomesDeUsuarios ignora id fora do formato e lista vazia', async () => {
    const rede = await criarRede();
    const ana = await criarUsuario({ networkId: rede.id, name: 'Ana Souza' });

    const nomes = await identity.userNames(rede.id, ['lixo', ana.id]);

    expect(nomes).toEqual(new Map([[ana.id, 'Ana Souza']]));
    expect(await identity.userNames(rede.id, [])).toEqual(new Map());
  });

  test('listarUsuarios traz também quem está desativado, marcado como tal', async () => {
    const rede = await criarRede();
    await criarUsuario({ networkId: rede.id, name: 'Ana Souza' });
    await criarUsuario({ networkId: rede.id, name: 'Zeca Paz', active: false });

    const usuarios = await identity.listUsers(rede.id);

    expect(usuarios.map((u) => [u.name, u.active])).toEqual([
      ['Ana Souza', true],
      ['Zeca Paz', false],
    ]);
  });
});

describe('isolamento de tenant', () => {
  test('nenhuma consulta de identidade da rede A devolve linha da rede B', async () => {
    const { a, b } = await duasRedes();
    const idsDeB = [b.admin.id, b.secretaria.id, b.professor.id];

    const unidades = await identity.listSchools(a.rede.id);
    const usuarios = await identity.listUsers(a.rede.id);
    const nomes = await identity.userNames(a.rede.id, idsDeB);

    expect(unidades.every((unidade) => unidade.networkId === a.rede.id)).toBe(true);
    expect(unidades.map((unidade) => unidade.id)).not.toContain(b.unidades[0].id);
    expect(usuarios.map((usuario) => usuario.id)).not.toContain(b.admin.id);
    expect(usuarios.every((usuario) => !usuario.email.includes(b.admin.email))).toBe(true);
    expect(nomes.size).toBe(0);
  });

  test('unidade e papel de outra rede não são alcançáveis pelo id', async () => {
    const { a, b } = await duasRedes();

    const unidadeAlheia = await identity.schoolById(a.rede.id, b.unidades[0].id);

    expect(unidadeAlheia).toBeNull();
    expect(
      await identity.isTeacherAtSchool(a.rede.id, b.professor.id, b.unidades[0].id),
    ).toBe(false);
    expect(await identity.schoolTeachers(a.rede.id, b.unidades[0].id)).toEqual([]);
  });

  test('os papéis carregados na sessão são apenas os da rede do usuário', async () => {
    const { a, b } = await duasRedes();

    const entrada = await identity.authenticate({
      networkSlug: a.rede.slug, loginIdentifier: a.admin.cpf, password: a.senha, ip: '',
    });

    const papeis = valorDe(entrada).user.roles;
    const unidadesDeB = [b.unidades[0].id, b.unidades[1].id];
    expect(papeis.every((papel) => !unidadesDeB.includes(papel.schoolId))).toBe(true);
    expect(papeis).toHaveLength(2);
  });
});

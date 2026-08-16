/*
 * Quem pode o quê, e por que a resposta muda de código.
 *
 * A regra tem duas metades. A primeira é o papel: uma conta sem o papel da área recebe 403, e o
 * acesso negado fica registrado. A segunda é o alcance dentro do papel — a turma que não é do
 * professor, o boletim que não é do responsável, a rede que não é a da sessão — e essa metade
 * responde 404, nunca 403: dizer "existe, mas não é seu" já é contar que o registro existe, e a
 * existência de um aluno é informação.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { limparBanco } from '../support/database';
import {
  cenarioCompleto,
  criarDisciplina,
  criarTurmaDisciplina,
  criarUsuario,
  type Cenario,
} from '../support/factories';
import { abrir, entrar } from './support';

const entrarComo = (
  cenario: Cenario,
  quem: 'admin' | 'secretaria' | 'professor' | 'responsavel',
): Promise<string> =>
  entrar({ redeSlug: cenario.rede.slug, cpf: cenario[quem].cpf, senha: cenario.senha });

const statusDe = async (caminho: string, cookie: string): Promise<number> =>
  (await abrir(caminho, cookie)).status;

describe('autorização por papel', () => {
  beforeEach(async () => {
    await limparBanco();
  });

  test('cada papel chega ao painel do seu próprio papel', async () => {
    const cenario = await cenarioCompleto();

    const destinos = await Promise.all(
      (['admin', 'secretaria', 'professor', 'responsavel'] as const).map(async (quem) => {
        const resposta = await abrir('/painel', await entrarComo(cenario, quem));
        return resposta.headers.get('Location');
      }),
    );

    expect(destinos).toEqual(['/rede', '/secretaria', '/professor', '/responsavel']);
  });

  test('cada papel abre a sua própria área', async () => {
    const cenario = await cenarioCompleto();

    const status = await Promise.all([
      statusDe('/rede', await entrarComo(cenario, 'admin')),
      statusDe('/secretaria', await entrarComo(cenario, 'secretaria')),
      statusDe('/professor', await entrarComo(cenario, 'professor')),
      statusDe('/responsavel', await entrarComo(cenario, 'responsavel')),
    ]);

    expect(status).toEqual([200, 200, 200, 200]);
  });

  test('professor não entra na secretaria nem na administração da rede', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'professor');

    const status = await Promise.all([
      statusDe('/secretaria', cookie),
      statusDe('/secretaria/turmas', cookie),
      statusDe('/rede/usuarios', cookie),
    ]);

    expect(status).toEqual([403, 403, 403]);
  });

  test('responsável não entra na área do professor nem na da secretaria', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'responsavel');

    const status = await Promise.all([
      statusDe('/professor', cookie),
      statusDe('/secretaria/alunos', cookie),
      statusDe('/comunicados', cookie),
    ]);

    expect(status).toEqual([403, 403, 403]);
  });

  test('secretaria não administra a rede, e administração da rede não dá aula', async () => {
    const cenario = await cenarioCompleto();

    const secretariaNaRede = await statusDe('/rede/unidades', await entrarComo(cenario, 'secretaria'));
    const adminNoProfessor = await statusDe('/professor', await entrarComo(cenario, 'admin'));

    expect([secretariaNaRede, adminNoProfessor]).toEqual([403, 403]);
  });

  test('secretaria e administração da rede publicam comunicados; o professor não', async () => {
    const cenario = await cenarioCompleto();

    const status = await Promise.all([
      statusDe('/comunicados', await entrarComo(cenario, 'secretaria')),
      statusDe('/comunicados', await entrarComo(cenario, 'admin')),
      statusDe('/comunicados', await entrarComo(cenario, 'professor')),
    ]);

    expect(status).toEqual([200, 200, 403]);
  });

  test('trocar a própria senha é de qualquer autenticado', async () => {
    const cenario = await cenarioCompleto();

    const status = await Promise.all([
      statusDe('/conta/senha', await entrarComo(cenario, 'professor')),
      statusDe('/conta/senha', await entrarComo(cenario, 'responsavel')),
    ]);

    expect(status).toEqual([200, 200]);
  });
});

describe('alcance dentro do papel', () => {
  beforeEach(async () => {
    await limparBanco();
  });

  test('professor não abre as notas de turma-disciplina de outro professor', async () => {
    const cenario = await cenarioCompleto();
    const outroProfessor = await criarUsuario({
      networkId: cenario.rede.id,
      senha: cenario.senha,
      papeis: [{ schoolId: cenario.unidades[0].id, role: 'teacher' }],
    });
    const disciplina = await criarDisciplina({ networkId: cenario.rede.id });
    const alheia = await criarTurmaDisciplina({
      networkId: cenario.rede.id,
      classGroupId: cenario.turmas[1].id,
      subjectId: disciplina.id,
      teacherUserId: outroProfessor.id,
    });
    const cookie = await entrarComo(cenario, 'professor');

    const propria = await statusDe(
      `/professor/disciplinas/${cenario.turmaDisciplinas[0].id}/notas`,
      cookie,
    );
    const deOutro = await statusDe(`/professor/disciplinas/${alheia.id}/notas`, cookie);

    expect(propria).toBe(200);
    expect(deOutro).toBe(404);
  });

  test('professor não abre chamada nem fechamento de turma que não leciona', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'professor');
    const semAlocacao = cenario.turmas[1].id;

    const status = await Promise.all([
      statusDe(`/professor/turmas/${semAlocacao}/chamada`, cookie),
      statusDe(`/professor/turmas/${semAlocacao}/fechamento`, cookie),
    ]);

    expect(status).toEqual([404, 404]);
  });

  test('responsável não abre boletim de aluno que não é dele', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'responsavel');

    const doSeuAluno = await statusDe(
      `/responsavel/matriculas/${cenario.matriculas[0].id}/boletim`,
      cookie,
    );
    const deOutraFamilia = await statusDe(
      `/responsavel/matriculas/${cenario.matriculas[1].id}/boletim`,
      cookie,
    );

    expect(doSeuAluno).toBe(200);
    expect(deOutraFamilia).toBe(404);
  });

  test('responsável não abre frequência de aluno que não é dele', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'responsavel');

    const status = await statusDe(
      `/responsavel/matriculas/${cenario.matriculas[2].id}/frequencia`,
      cookie,
    );

    expect(status).toBe(404);
  });

  test('registro de outra rede não existe para quem pergunta', async () => {
    const [redeA, redeB] = await Promise.all([cenarioCompleto(), cenarioCompleto()]);
    const cookie = await entrarComo(redeA, 'secretaria');

    const daPropriaRede = await statusDe(`/secretaria/turmas/${redeA.turmas[0].id}`, cookie);
    const daOutraRede = await statusDe(`/secretaria/turmas/${redeB.turmas[0].id}`, cookie);

    expect(daPropriaRede).toBe(200);
    expect(daOutraRede).toBe(404);
  });

  test('professor de uma rede não alcança a turma-disciplina de outra rede', async () => {
    const [redeA, redeB] = await Promise.all([cenarioCompleto(), cenarioCompleto()]);
    const cookie = await entrarComo(redeA, 'professor');

    const status = await statusDe(
      `/professor/disciplinas/${redeB.turmaDisciplinas[0].id}/notas`,
      cookie,
    );

    expect(status).toBe(404);
  });

  test('identificador que não é uuid responde 404 em vez de estourar', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'secretaria');

    const status = await Promise.all([
      statusDe('/secretaria/turmas/nao-e-um-uuid', cookie),
      statusDe('/secretaria/alunos/nao-e-um-uuid', cookie),
    ]);

    expect(status).toEqual([404, 404]);
  });
});

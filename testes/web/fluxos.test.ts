/*
 * Os dois caminhos que atravessam o Estágio 01 inteiro pelo HTTP.
 *
 * Nada aqui chama caso de uso direto: cada passo é uma requisição como o navegador a faria, com
 * formulário urlencoded, chave de idempotência e POST-Redirect-GET. O que se verifica ao final não
 * é o retorno de uma função, é o que a próxima tela mostra — porque é isso que a secretaria e o
 * responsável de fato veem.
 *
 * (a) A secretaria cadastra um aluno, cadastra um responsável, liga os dois, matricula, e a
 *     matrícula aparece na turma.
 * (b) O professor lança as notas dos quatro bimestres, registra a chamada, fecha os quatro
 *     bimestres — e só então o boletim do responsável deixa de dizer "em curso" e dá a situação
 *     final. É o caminho que amarra `academico`, `avaliacao` e a regra pedagógica.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { limparBanco, sqlDeTeste } from '../apoio/banco';
import { cenarioCompleto, type Cenario } from '../apoio/fabricas';
import { abrir, entrar, enviar } from './apoio';

const PRAZO_DO_FLUXO_MS = 60_000;

const BIMESTRES = [1, 2, 3, 4] as const;
const DIAS_DE_CHAMADA = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05'] as const;
const NOTA_DE_APROVACAO = '8';

const identificadorDoDestino = (resposta: Response): string => {
  const destino = resposta.headers.get('Location') ?? '';
  const caminho = destino.split('?')[0] ?? '';
  return caminho.slice(caminho.lastIndexOf('/') + 1);
};

const responsavelPorEmail = async (redeId: string, email: string): Promise<string> => {
  const linhas = await sqlDeTeste()<{ id: string }[]>`
    SELECT id::text FROM guardian WHERE network_id = ${redeId} AND email = ${email}`;
  const id = linhas[0]?.id;
  if (id === undefined) throw new Error(`responsável ${email} não foi gravado`);
  return id;
};

const entrarComo = (
  cenario: Cenario,
  quem: 'secretaria' | 'professor' | 'responsavel',
): Promise<string> =>
  entrar({ redeSlug: cenario.rede.slug, cpf: cenario[quem].cpf, senha: cenario.senha });

describe('a secretaria matricula um aluno novo, do cadastro à turma', () => {
  beforeEach(async () => {
    await limparBanco();
  });

  test('cadastrar, vincular e matricular deixa o aluno na turma escolhida', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'secretaria');
    const turmaDestino = cenario.turmas[1];
    const nomeDoAluno = 'Marina Aparecida do Vale';
    const nomeDaResponsavel = 'Cleuza do Vale';
    const emailDaResponsavel = 'cleuza.do.vale@escolaviva.test';

    const cadastro = await enviar(
      '/secretaria/alunos',
      { nome: nomeDoAluno, dataNascimento: '2014-07-21' },
      cookie,
    );
    const alunoId = identificadorDoDestino(cadastro);

    const responsavel = await enviar(
      '/secretaria/responsaveis',
      { nome: nomeDaResponsavel, email: emailDaResponsavel, telefone: '(27) 99999-0000' },
      cookie,
    );
    const responsavelId = await responsavelPorEmail(cenario.rede.id, emailDaResponsavel);

    const vinculo = await enviar(
      `/secretaria/alunos/${alunoId}/responsaveis`,
      { responsavelId, parentesco: 'mãe', financeiro: 'on' },
      cookie,
    );

    const matricula = await enviar(
      '/secretaria/matriculas',
      {
        alunoId,
        turmaId: turmaDestino.id,
        anoLetivoId: cenario.anoLetivo.id,
        dataMatricula: '2026-02-10',
      },
      cookie,
    );

    const turma = await abrir(`/secretaria/turmas/${turmaDestino.id}`, cookie);
    const paginaDaTurma = await turma.text();

    expect([cadastro.status, responsavel.status, vinculo.status, matricula.status]).toEqual([
      303, 303, 303, 303,
    ]);
    expect(matricula.headers.get('Location')).toContain(`/secretaria/alunos/${alunoId}`);
    expect(turma.status).toBe(200);
    expect(paginaDaTurma).toContain(nomeDoAluno);
  }, PRAZO_DO_FLUXO_MS);

  test('a ficha do aluno mostra o responsável vinculado e a matrícula ativa', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'secretaria');
    const nomeDoAluno = 'Ivo Sampaio Rezende';
    const emailDaResponsavel = 'tia.de.ivo@escolaviva.test';

    const cadastro = await enviar(
      '/secretaria/alunos',
      { nome: nomeDoAluno, dataNascimento: '2013-01-30' },
      cookie,
    );
    const alunoId = identificadorDoDestino(cadastro);
    await enviar(
      '/secretaria/responsaveis',
      { nome: 'Regina Sampaio', email: emailDaResponsavel, telefone: '' },
      cookie,
    );
    const responsavelId = await responsavelPorEmail(cenario.rede.id, emailDaResponsavel);
    await enviar(
      `/secretaria/alunos/${alunoId}/responsaveis`,
      { responsavelId, parentesco: 'tia', financeiro: 'on' },
      cookie,
    );
    await enviar(
      '/secretaria/matriculas',
      {
        alunoId,
        turmaId: cenario.turmas[1].id,
        anoLetivoId: cenario.anoLetivo.id,
        dataMatricula: '2026-02-10',
      },
      cookie,
    );

    const ficha = await (await abrir(`/secretaria/alunos/${alunoId}`, cookie)).text();

    expect(ficha).toContain('Regina Sampaio');
    expect(ficha).toContain('tia');
    expect(ficha).toContain(cenario.turmas[1].name);
    expect(ficha).toContain('Ativa');
  }, PRAZO_DO_FLUXO_MS);
});

describe('o professor fecha o ano e o responsável lê o boletim', () => {
  beforeEach(async () => {
    await limparBanco();
  });

  const lancarTodasAsNotas = async (cenario: Cenario, cookie: string): Promise<Response[]> => {
    const envios: Response[] = [];
    for (const alocacao of cenario.turmaDisciplinas) {
      for (const bimestre of BIMESTRES) {
        const campos: Record<string, string> = { bimestre: String(bimestre) };
        for (const matricula of cenario.matriculas) {
          campos[`nota_${matricula.id}`] = NOTA_DE_APROVACAO;
        }
        envios.push(await enviar(`/professor/disciplinas/${alocacao.id}/notas`, campos, cookie));
      }
    }
    return envios;
  };

  const registrarChamadaCompleta = async (
    cenario: Cenario,
    cookie: string,
  ): Promise<Response[]> => {
    const envios: Response[] = [];
    for (const data of DIAS_DE_CHAMADA) {
      const campos: Record<string, string> = { data };
      for (const matricula of cenario.matriculas) campos[`presenca_${matricula.id}`] = 'on';
      envios.push(
        await enviar(`/professor/turmas/${cenario.turmas[0].id}/chamada`, campos, cookie),
      );
    }
    return envios;
  };

  const fecharBimestre = (cenario: Cenario, cookie: string, bimestre: number): Promise<Response> =>
    enviar(
      `/professor/turmas/${cenario.turmas[0].id}/fechamento`,
      { bimestre: String(bimestre) },
      cookie,
    );

  test('quatro bimestres lançados, chamada registrada e ano fechado dão a situação final', async () => {
    const cenario = await cenarioCompleto();
    const doProfessor = await entrarComo(cenario, 'professor');
    const doResponsavel = await entrarComo(cenario, 'responsavel');
    const boletimDe = (): Promise<Response> =>
      abrir(`/responsavel/matriculas/${cenario.matriculas[0].id}/boletim`, doResponsavel);

    const notas = await lancarTodasAsNotas(cenario, doProfessor);
    const chamadas = await registrarChamadaCompleta(cenario, doProfessor);

    const antesDoFechamento = await (await boletimDe()).text();
    const fechamentos: Response[] = [];
    for (const bimestre of BIMESTRES) {
      fechamentos.push(await fecharBimestre(cenario, doProfessor, bimestre));
    }
    const depoisDoFechamento = await boletimDe();
    const boletim = await depoisDoFechamento.text();

    expect(notas.every((resposta) => resposta.status === 303)).toBe(true);
    expect(chamadas.every((resposta) => resposta.status === 303)).toBe(true);
    expect(fechamentos.every((resposta) => resposta.status === 303)).toBe(true);
    expect(antesDoFechamento).toContain('Em curso');
    expect(depoisDoFechamento.status).toBe(200);
    expect(boletim).toContain('Aprovado');
    expect(boletim).not.toContain('Em curso');
  }, PRAZO_DO_FLUXO_MS);

  test('o boletim mostra a média e a frequência que decidiram a situação', async () => {
    const cenario = await cenarioCompleto();
    const doProfessor = await entrarComo(cenario, 'professor');
    const doResponsavel = await entrarComo(cenario, 'responsavel');

    await lancarTodasAsNotas(cenario, doProfessor);
    await registrarChamadaCompleta(cenario, doProfessor);
    for (const bimestre of BIMESTRES) await fecharBimestre(cenario, doProfessor, bimestre);
    const boletim = await (
      await abrir(`/responsavel/matriculas/${cenario.matriculas[0].id}/boletim`, doResponsavel)
    ).text();

    expect(boletim).toContain('8,0');
    expect(boletim).toContain('100,0 %');
    expect(boletim).toContain(cenario.alunos[0].name);
    for (const disciplina of cenario.disciplinas) expect(boletim).toContain(disciplina.name);
  }, PRAZO_DO_FLUXO_MS);

  test('a frequência dia a dia mostra as quatro chamadas registradas', async () => {
    const cenario = await cenarioCompleto();
    const doProfessor = await entrarComo(cenario, 'professor');
    const doResponsavel = await entrarComo(cenario, 'responsavel');

    await registrarChamadaCompleta(cenario, doProfessor);
    const pagina = await abrir(
      `/responsavel/matriculas/${cenario.matriculas[0].id}/frequencia`,
      doResponsavel,
    );
    const frequencia = await pagina.text();

    expect(pagina.status).toBe(200);
    expect(frequencia).toContain('02/03/2026');
    expect(frequencia).toContain('05/03/2026');
  }, PRAZO_DO_FLUXO_MS);

  test('o fechamento é recusado enquanto falta nota, e o boletim segue em curso', async () => {
    const cenario = await cenarioCompleto();
    const doProfessor = await entrarComo(cenario, 'professor');
    const doResponsavel = await entrarComo(cenario, 'responsavel');

    const recusa = await fecharBimestre(cenario, doProfessor, 1);
    const corpoDaRecusa = await recusa.text();
    const boletim = await (
      await abrir(`/responsavel/matriculas/${cenario.matriculas[0].id}/boletim`, doResponsavel)
    ).text();

    // Cinco matrículas ativas em três disciplinas alocadas, nenhuma nota lançada: faltam quinze.
    expect(recusa.status).toBe(200);
    expect(corpoDaRecusa).toContain('Faltam 15 notas para fechar o bimestre');
    expect(boletim).toContain('Em curso');
  }, PRAZO_DO_FLUXO_MS);
});

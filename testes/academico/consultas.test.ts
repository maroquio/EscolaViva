/*
 * As leituras do acadêmico. Duas coisas se provam aqui em cada consulta: que ela responde o que
 * a tela precisa e que ela nunca atravessa a fronteira da rede — o `rede_id` de todo filtro é o
 * que separa duas prefeituras que compartilham o mesmo banco.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { academico } from '../../src/academico';
import { limparBanco } from '../apoio/banco';
import {
  ANO_PADRAO,
  cenarioCompleto,
  criarAluno,
  criarAnoLetivo,
  criarDisciplina,
  criarMatricula,
  criarRede,
  criarResponsavel,
  criarTurma,
  criarTurmaDisciplina,
  criarUnidade,
  criarUsuario,
  duasRedes,
  vincularAlunoResponsavel,
} from '../apoio/fabricas';

beforeEach(limparBanco);

describe('buscarAlunos', () => {
  test('acha o aluno por um trecho do nome', async () => {
    const rede = await criarRede();
    await criarAluno({ redeId: rede.id, nome: 'Ana Carolina Souza' });
    await criarAluno({ redeId: rede.id, nome: 'Bruno Teixeira' });

    const encontrados = await academico.buscarAlunos(rede.id, 'Carolina');

    expect(encontrados.map((aluno) => aluno.nome)).toEqual(['Ana Carolina Souza']);
  });

  test('a busca é insensível a maiúsculas e minúsculas', async () => {
    const rede = await criarRede();
    await criarAluno({ redeId: rede.id, nome: 'Ana Carolina Souza' });

    const encontrados = await academico.buscarAlunos(rede.id, 'cArOLiNa');

    expect(encontrados.map((aluno) => aluno.nome)).toEqual(['Ana Carolina Souza']);
  });

  test('devolve os achados em ordem de nome', async () => {
    const rede = await criarRede();
    await criarAluno({ redeId: rede.id, nome: 'Carlos Silva' });
    await criarAluno({ redeId: rede.id, nome: 'Ana Silva' });
    await criarAluno({ redeId: rede.id, nome: 'Bruno Silva' });

    const encontrados = await academico.buscarAlunos(rede.id, 'silva');

    expect(encontrados.map((aluno) => aluno.nome)).toEqual([
      'Ana Silva', 'Bruno Silva', 'Carlos Silva',
    ]);
  });

  test('nunca devolve aluno de outra rede', async () => {
    const nossa = await criarRede();
    const alheia = await criarRede();
    await criarAluno({ redeId: nossa.id, nome: 'Ana Silva' });
    await criarAluno({ redeId: alheia.id, nome: 'Ana Silva' });

    const encontrados = await academico.buscarAlunos(nossa.id, 'Ana Silva');

    expect(encontrados).toHaveLength(1);
    expect(encontrados[0]?.redeId).toBe(nossa.id);
  });

  test('trecho que ninguém tem devolve lista vazia', async () => {
    const rede = await criarRede();
    await criarAluno({ redeId: rede.id, nome: 'Ana Silva' });

    const encontrados = await academico.buscarAlunos(rede.id, 'Wagner');

    expect(encontrados).toEqual([]);
  });

  test('os curingas do LIKE são procurados como texto comum', async () => {
    const rede = await criarRede();
    await criarAluno({ redeId: rede.id, nome: 'Ana 100% Silva' });
    await criarAluno({ redeId: rede.id, nome: 'Bruno Teixeira' });

    const encontrados = await academico.buscarAlunos(rede.id, '100%');

    expect(encontrados.map((aluno) => aluno.nome)).toEqual(['Ana 100% Silva']);
  });

  test('a data de nascimento volta no formato canônico da aplicação', async () => {
    const rede = await criarRede();
    await criarAluno({ redeId: rede.id, nome: 'Ana Silva', dataNascimento: '2014-05-10' });

    const encontrados = await academico.buscarAlunos(rede.id, 'Ana');

    expect(encontrados[0]?.dataNascimento).toBe('2014-05-10');
  });
});

describe('alunoPorId', () => {
  test('devolve o aluno da rede', async () => {
    const rede = await criarRede();
    const aluno = await criarAluno({ redeId: rede.id, nome: 'Ana Silva' });

    const encontrado = await academico.alunoPorId(rede.id, aluno.id);

    expect(encontrado).toEqual({
      id: aluno.id, redeId: rede.id, nome: 'Ana Silva', dataNascimento: aluno.dataNascimento,
    });
  });

  test('aluno de outra rede não é alcançável pelo id', async () => {
    const { a, b } = await duasRedes();

    const encontrado = await academico.alunoPorId(a.rede.id, b.alunos[0].id);

    expect(encontrado).toBeNull();
  });
});

describe('turmas', () => {
  test('listarTurmas sem filtro traz as turmas da rede em ordem de série e nome', async () => {
    const rede = await criarRede();
    const unidade = await criarUnidade({ redeId: rede.id });
    const anoLetivo = await criarAnoLetivo({ redeId: rede.id });
    await criarTurma({
      redeId: rede.id, unidadeId: unidade.id, anoLetivoId: anoLetivo.id,
      nome: '7º B', serie: '7º ano',
    });
    await criarTurma({
      redeId: rede.id, unidadeId: unidade.id, anoLetivoId: anoLetivo.id,
      nome: '6º A', serie: '6º ano',
    });
    await criarTurma({
      redeId: rede.id, unidadeId: unidade.id, anoLetivoId: anoLetivo.id,
      nome: '7º A', serie: '7º ano',
    });

    const turmas = await academico.listarTurmas(rede.id);

    expect(turmas.map((turma) => turma.nome)).toEqual(['6º A', '7º A', '7º B']);
  });

  test('listarTurmas filtra por unidade', async () => {
    const rede = await criarRede();
    const centro = await criarUnidade({ redeId: rede.id });
    const praia = await criarUnidade({ redeId: rede.id });
    const anoLetivo = await criarAnoLetivo({ redeId: rede.id });
    await criarTurma({
      redeId: rede.id, unidadeId: centro.id, anoLetivoId: anoLetivo.id, nome: 'Centro 6º A',
    });
    await criarTurma({
      redeId: rede.id, unidadeId: praia.id, anoLetivoId: anoLetivo.id, nome: 'Praia 6º A',
    });

    const turmas = await academico.listarTurmas(rede.id, { unidadeId: centro.id });

    expect(turmas.map((turma) => turma.nome)).toEqual(['Centro 6º A']);
  });

  test('listarTurmas filtra por ano letivo', async () => {
    const rede = await criarRede();
    const unidade = await criarUnidade({ redeId: rede.id });
    const esteAno = await criarAnoLetivo({ redeId: rede.id, ano: ANO_PADRAO });
    const proximoAno = await criarAnoLetivo({ redeId: rede.id, ano: ANO_PADRAO + 1 });
    await criarTurma({
      redeId: rede.id, unidadeId: unidade.id, anoLetivoId: esteAno.id, nome: 'Turma de agora',
    });
    await criarTurma({
      redeId: rede.id, unidadeId: unidade.id, anoLetivoId: proximoAno.id, nome: 'Turma do ano que vem',
    });

    const turmas = await academico.listarTurmas(rede.id, { anoLetivoId: proximoAno.id });

    expect(turmas.map((turma) => turma.nome)).toEqual(['Turma do ano que vem']);
  });

  test('listarTurmas nunca traz turma de outra rede', async () => {
    const { a, b } = await duasRedes();

    const turmas = await academico.listarTurmas(a.rede.id);

    expect(turmas.every((turma) => turma.redeId === a.rede.id)).toBe(true);
    expect(turmas.map((turma) => turma.id)).not.toContain(b.turmas[0].id);
  });

  test('turmaPorId não alcança turma de outra rede', async () => {
    const { a, b } = await duasRedes();

    const encontrada = await academico.turmaPorId(a.rede.id, b.turmas[0].id);

    expect(encontrada).toBeNull();
    expect(await academico.turmaPorId(a.rede.id, a.turmas[0].id)).not.toBeNull();
  });
});

describe('disciplinas da turma e do professor', () => {
  test('listarDisciplinas traz as disciplinas da rede em ordem de nome', async () => {
    const rede = await criarRede();
    await criarDisciplina({ redeId: rede.id, nome: 'Matemática' });
    await criarDisciplina({ redeId: rede.id, nome: 'Artes' });
    await criarDisciplina({ redeId: rede.id, nome: 'História' });

    const disciplinas = await academico.listarDisciplinas(rede.id);

    expect(disciplinas.map((disciplina) => disciplina.nome)).toEqual([
      'Artes', 'História', 'Matemática',
    ]);
  });

  test('listarTurmaDisciplinas traz as alocações da turma com o nome da disciplina', async () => {
    const cenario = await cenarioCompleto();
    const [turma] = cenario.turmas;

    const alocacoes = await academico.listarTurmaDisciplinas(cenario.rede.id, turma.id);

    expect(alocacoes).toHaveLength(3);
    expect(alocacoes.every((alocacao) => alocacao.turmaId === turma.id)).toBe(true);
    expect(alocacoes.every((alocacao) => alocacao.disciplinaNome.length > 0)).toBe(true);
    expect(alocacoes.every((alocacao) => alocacao.professorUsuarioId === cenario.professor.id)).toBe(true);
  });

  test('turmaDisciplinaPorId devolve a alocação e não alcança a de outra rede', async () => {
    const { a, b } = await duasRedes();
    const alvo = a.turmaDisciplinas[0];

    const encontrada = await academico.turmaDisciplinaPorId(a.rede.id, alvo.id);

    expect(encontrada?.id).toBe(alvo.id);
    expect(await academico.turmaDisciplinaPorId(a.rede.id, b.turmaDisciplinas[0].id)).toBeNull();
  });

  test('turmaDisciplinasDoProfessor traz turma e série junto da disciplina', async () => {
    const cenario = await cenarioCompleto();
    const [turma] = cenario.turmas;

    const doProfessor = await academico.turmaDisciplinasDoProfessor(
      cenario.rede.id, cenario.professor.id,
    );

    expect(doProfessor).toHaveLength(3);
    expect(doProfessor.every((linha) => linha.turmaNome === turma.nome)).toBe(true);
    expect(doProfessor.every((linha) => linha.unidadeId === turma.unidadeId)).toBe(true);
    expect(doProfessor.every((linha) => linha.turno === turma.turno)).toBe(true);
  });

  test('professor sem alocação nenhuma abre o painel vazio', async () => {
    const cenario = await cenarioCompleto();
    const outroProfessor = await criarUsuario({
      redeId: cenario.rede.id,
      papeis: [{ unidadeId: cenario.unidades[0].id, papel: 'professor' }],
    });

    const doProfessor = await academico.turmaDisciplinasDoProfessor(
      cenario.rede.id, outroProfessor.id,
    );

    expect(doProfessor).toEqual([]);
  });

  test('turmasDoProfessor traz cada turma uma vez, mesmo com várias disciplinas nela', async () => {
    const cenario = await cenarioCompleto();
    const [turma] = cenario.turmas;

    const turmas = await academico.turmasDoProfessor(cenario.rede.id, cenario.professor.id);

    expect(turmas.map((linha) => linha.id)).toEqual([turma.id]);
  });

  test('turmasDoProfessor conta as duas turmas quando ele leciona nas duas', async () => {
    const cenario = await cenarioCompleto();
    const [primeira, segunda] = cenario.turmas;
    const geografia = await criarDisciplina({ redeId: cenario.rede.id, nome: 'Geografia' });
    await criarTurmaDisciplina({
      redeId: cenario.rede.id, turmaId: segunda.id,
      disciplinaId: geografia.id, professorUsuarioId: cenario.professor.id,
    });

    const turmas = await academico.turmasDoProfessor(cenario.rede.id, cenario.professor.id);

    expect(turmas.map((linha) => linha.id).sort()).toEqual([primeira.id, segunda.id].sort());
  });

  test('as alocações do professor de outra rede não vazam', async () => {
    const { a, b } = await duasRedes();

    const doProfessorAlheio = await academico.turmaDisciplinasDoProfessor(
      a.rede.id, b.professor.id,
    );

    expect(doProfessorAlheio).toEqual([]);
    expect(await academico.turmasDoProfessor(a.rede.id, b.professor.id)).toEqual([]);
  });
});

describe('responsáveis', () => {
  test('listarResponsaveis traz os da rede em ordem de nome', async () => {
    const rede = await criarRede();
    await criarResponsavel({ redeId: rede.id, nome: 'Carla Dias' });
    await criarResponsavel({ redeId: rede.id, nome: 'Ana Souza' });

    const responsaveis = await academico.listarResponsaveis(rede.id);

    expect(responsaveis.map((responsavel) => responsavel.nome)).toEqual(['Ana Souza', 'Carla Dias']);
  });

  test('listarResponsaveis não traz responsável de outra rede', async () => {
    const { a, b } = await duasRedes();

    const responsaveis = await academico.listarResponsaveis(a.rede.id);

    expect(responsaveis.every((responsavel) => responsavel.redeId === a.rede.id)).toBe(true);
    expect(responsaveis.map((responsavel) => responsavel.id)).not.toContain(b.responsaveis[0].id);
  });

  test('responsaveisDoAluno traz o vínculo com parentesco e marca de financeiro', async () => {
    const rede = await criarRede();
    const aluno = await criarAluno({ redeId: rede.id });
    const mae = await criarResponsavel({
      redeId: rede.id, nome: 'Ana Souza', email: 'ana@familia.br',
    });
    const pai = await criarResponsavel({
      redeId: rede.id, nome: 'Bruno Souza', email: 'bruno@familia.br',
    });
    await vincularAlunoResponsavel({
      redeId: rede.id, alunoId: aluno.id, responsavelId: mae.id,
      parentesco: 'mãe', financeiro: true,
    });
    await vincularAlunoResponsavel({
      redeId: rede.id, alunoId: aluno.id, responsavelId: pai.id,
      parentesco: 'pai', financeiro: false,
    });

    const vinculos = await academico.responsaveisDoAluno(rede.id, aluno.id);

    expect(vinculos).toEqual([
      {
        responsavelId: mae.id, nome: 'Ana Souza', email: 'ana@familia.br',
        parentesco: 'mãe', financeiro: true,
      },
      {
        responsavelId: pai.id, nome: 'Bruno Souza', email: 'bruno@familia.br',
        parentesco: 'pai', financeiro: false,
      },
    ]);
  });

  test('responsaveisDaUnidade traz quem responde por aluno com matrícula ativa ali', async () => {
    const cenario = await cenarioCompleto();
    const [unidadeComAlunos, unidadeVazia] = cenario.unidades;

    const daUnidade = await academico.responsaveisDaUnidade(cenario.rede.id, unidadeComAlunos.id);

    expect(daUnidade).toHaveLength(5);
    expect(await academico.responsaveisDaUnidade(cenario.rede.id, unidadeVazia.id)).toEqual([]);
  });

  test('responsável de aluno sem matrícula ativa não recebe comunicado da unidade', async () => {
    const cenario = await cenarioCompleto();
    const [unidade] = cenario.unidades;
    const semMatricula = await criarResponsavel({
      redeId: cenario.rede.id, nome: 'Zulmira Sem Turma',
    });
    const alunoSaido = await criarAluno({ redeId: cenario.rede.id });
    await vincularAlunoResponsavel({
      redeId: cenario.rede.id, alunoId: alunoSaido.id, responsavelId: semMatricula.id,
    });
    await criarMatricula({
      redeId: cenario.rede.id, alunoId: alunoSaido.id, turmaId: cenario.turmas[0].id,
      anoLetivoId: cenario.anoLetivo.id, situacao: 'transferida',
    });

    const daUnidade = await academico.responsaveisDaUnidade(cenario.rede.id, unidade.id);

    expect(daUnidade.map((responsavel) => responsavel.id)).not.toContain(semMatricula.id);
  });
});

describe('matrículas', () => {
  test('matriculaPorId traz nome do aluno, nome da turma e ano', async () => {
    const cenario = await cenarioCompleto();
    const [matricula] = cenario.matriculas;
    const [aluno] = cenario.alunos;
    const [turma] = cenario.turmas;

    const encontrada = await academico.matriculaPorId(cenario.rede.id, matricula.id);

    expect(encontrada).toEqual({
      id: matricula.id,
      redeId: cenario.rede.id,
      alunoId: aluno.id,
      alunoNome: aluno.nome,
      turmaId: turma.id,
      turmaNome: turma.nome,
      unidadeId: turma.unidadeId,
      anoLetivoId: cenario.anoLetivo.id,
      ano: ANO_PADRAO,
      dataMatricula: matricula.dataMatricula,
      situacao: 'ativa',
    });
  });

  test('matrícula de outra rede não é alcançável pelo id', async () => {
    const { a, b } = await duasRedes();

    const encontrada = await academico.matriculaPorId(a.rede.id, b.matriculas[0].id);

    expect(encontrada).toBeNull();
  });

  test('matriculasAtivasDaTurma lista os ativos em ordem de nome do aluno', async () => {
    const cenario = await cenarioCompleto();
    const [turma] = cenario.turmas;

    const ativas = await academico.matriculasAtivasDaTurma(cenario.rede.id, turma.id);

    const nomes = ativas.map((matricula) => matricula.alunoNome);
    expect(ativas).toHaveLength(5);
    expect(nomes).toEqual([...nomes].sort());
  });

  test('matriculasAtivasDaTurma ignora quem saiu da turma', async () => {
    const cenario = await cenarioCompleto();
    const [turma] = cenario.turmas;
    const [saiu] = cenario.matriculas;
    await academico.transferir({
      redeId: cenario.rede.id, matriculaId: saiu.id,
      turmaDestinoId: cenario.turmas[1].id, data: `${ANO_PADRAO}-06-01`,
    });

    const ativas = await academico.matriculasAtivasDaTurma(cenario.rede.id, turma.id);

    expect(ativas).toHaveLength(4);
    expect(ativas.map((matricula) => matricula.id)).not.toContain(saiu.id);
  });

  test('matriculasDoResponsavel devolve só os alunos vinculados àquele responsável', async () => {
    const cenario = await cenarioCompleto();
    const [primeiro, segundo] = cenario.responsaveis;
    const [alunoDoPrimeiro] = cenario.alunos;

    const doPrimeiro = await academico.matriculasDoResponsavel(cenario.rede.id, primeiro.id);

    expect(doPrimeiro.map((matricula) => matricula.alunoId)).toEqual([alunoDoPrimeiro.id]);
    const doSegundo = await academico.matriculasDoResponsavel(cenario.rede.id, segundo.id);
    expect(doSegundo.map((matricula) => matricula.alunoId)).not.toContain(alunoDoPrimeiro.id);
  });

  test('matriculasDoResponsavel traz os dois filhos de quem responde por dois', async () => {
    const cenario = await cenarioCompleto();
    const [responsavel] = cenario.responsaveis;
    const irmao = await criarAluno({ redeId: cenario.rede.id, nome: 'Irmão Caçula' });
    await vincularAlunoResponsavel({
      redeId: cenario.rede.id, alunoId: irmao.id, responsavelId: responsavel.id,
    });
    await criarMatricula({
      redeId: cenario.rede.id, alunoId: irmao.id, turmaId: cenario.turmas[1].id,
      anoLetivoId: cenario.anoLetivo.id,
    });

    const doResponsavel = await academico.matriculasDoResponsavel(cenario.rede.id, responsavel.id);

    expect(doResponsavel).toHaveLength(2);
    expect(doResponsavel.map((matricula) => matricula.alunoNome)).toContain('Irmão Caçula');
  });

  test('matriculasDoResponsavel mostra o histórico, com o ano mais recente primeiro', async () => {
    const cenario = await cenarioCompleto();
    const [responsavel] = cenario.responsaveis;
    const [aluno] = cenario.alunos;
    const proximoAno = await criarAnoLetivo({ redeId: cenario.rede.id, ano: ANO_PADRAO + 1 });
    const turmaFutura = await criarTurma({
      redeId: cenario.rede.id, unidadeId: cenario.unidades[0].id, anoLetivoId: proximoAno.id,
    });
    await criarMatricula({
      redeId: cenario.rede.id, alunoId: aluno.id, turmaId: turmaFutura.id,
      anoLetivoId: proximoAno.id, dataMatricula: `${ANO_PADRAO + 1}-02-05`,
    });

    const doResponsavel = await academico.matriculasDoResponsavel(cenario.rede.id, responsavel.id);

    expect(doResponsavel.map((matricula) => matricula.ano)).toEqual([ANO_PADRAO + 1, ANO_PADRAO]);
  });

  test('matriculasDoResponsavel de outra rede não devolve nada', async () => {
    const { a, b } = await duasRedes();

    const alheias = await academico.matriculasDoResponsavel(a.rede.id, b.responsaveis[0].id);

    expect(alheias).toEqual([]);
  });
});

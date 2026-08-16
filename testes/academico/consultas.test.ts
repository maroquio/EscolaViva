/*
 * As leituras do acadêmico. Duas coisas se provam aqui em cada consulta: que ela responde o que
 * a tela precisa e que ela nunca atravessa a fronteira da rede — o `rede_id` de todo filtro é o
 * que separa duas prefeituras que compartilham o mesmo banco.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { academico } from '../../src/academics';
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
    await criarAluno({ networkId: rede.id, name: 'Ana Carolina Souza' });
    await criarAluno({ networkId: rede.id, name: 'Bruno Teixeira' });

    const encontrados = await academico.buscarAlunos(rede.id, 'Carolina');

    expect(encontrados.map((aluno) => aluno.nome)).toEqual(['Ana Carolina Souza']);
  });

  test('a busca é insensível a maiúsculas e minúsculas', async () => {
    const rede = await criarRede();
    await criarAluno({ networkId: rede.id, name: 'Ana Carolina Souza' });

    const encontrados = await academico.buscarAlunos(rede.id, 'cArOLiNa');

    expect(encontrados.map((aluno) => aluno.nome)).toEqual(['Ana Carolina Souza']);
  });

  test('devolve os achados em ordem de nome', async () => {
    const rede = await criarRede();
    await criarAluno({ networkId: rede.id, name: 'Carlos Silva' });
    await criarAluno({ networkId: rede.id, name: 'Ana Silva' });
    await criarAluno({ networkId: rede.id, name: 'Bruno Silva' });

    const encontrados = await academico.buscarAlunos(rede.id, 'silva');

    expect(encontrados.map((aluno) => aluno.nome)).toEqual([
      'Ana Silva', 'Bruno Silva', 'Carlos Silva',
    ]);
  });

  test('nunca devolve aluno de outra rede', async () => {
    const nossa = await criarRede();
    const alheia = await criarRede();
    await criarAluno({ networkId: nossa.id, name: 'Ana Silva' });
    await criarAluno({ networkId: alheia.id, name: 'Ana Silva' });

    const encontrados = await academico.buscarAlunos(nossa.id, 'Ana Silva');

    expect(encontrados).toHaveLength(1);
    expect(encontrados[0]?.redeId).toBe(nossa.id);
  });

  test('trecho que ninguém tem devolve lista vazia', async () => {
    const rede = await criarRede();
    await criarAluno({ networkId: rede.id, name: 'Ana Silva' });

    const encontrados = await academico.buscarAlunos(rede.id, 'Wagner');

    expect(encontrados).toEqual([]);
  });

  test('os curingas do LIKE são procurados como texto comum', async () => {
    const rede = await criarRede();
    await criarAluno({ networkId: rede.id, name: 'Ana 100% Silva' });
    await criarAluno({ networkId: rede.id, name: 'Bruno Teixeira' });

    const encontrados = await academico.buscarAlunos(rede.id, '100%');

    expect(encontrados.map((aluno) => aluno.nome)).toEqual(['Ana 100% Silva']);
  });

  test('a data de nascimento volta no formato canônico da aplicação', async () => {
    const rede = await criarRede();
    await criarAluno({ networkId: rede.id, name: 'Ana Silva', birthDate: '2014-05-10' });

    const encontrados = await academico.buscarAlunos(rede.id, 'Ana');

    expect(encontrados[0]?.dataNascimento).toBe('2014-05-10');
  });
});

describe('alunoPorId', () => {
  test('devolve o aluno da rede', async () => {
    const rede = await criarRede();
    const aluno = await criarAluno({ networkId: rede.id, name: 'Ana Silva' });

    const encontrado = await academico.alunoPorId(rede.id, aluno.id);

    expect(encontrado).toEqual({
      id: aluno.id, redeId: rede.id, nome: 'Ana Silva', dataNascimento: aluno.birthDate,
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
    const unidade = await criarUnidade({ networkId: rede.id });
    const anoLetivo = await criarAnoLetivo({ networkId: rede.id });
    await criarTurma({
      networkId: rede.id, schoolId: unidade.id, academicYearId: anoLetivo.id,
      name: '7º B', gradeLevel: '7º ano',
    });
    await criarTurma({
      networkId: rede.id, schoolId: unidade.id, academicYearId: anoLetivo.id,
      name: '6º A', gradeLevel: '6º ano',
    });
    await criarTurma({
      networkId: rede.id, schoolId: unidade.id, academicYearId: anoLetivo.id,
      name: '7º A', gradeLevel: '7º ano',
    });

    const turmas = await academico.listarTurmas(rede.id);

    expect(turmas.map((turma) => turma.nome)).toEqual(['6º A', '7º A', '7º B']);
  });

  test('listarTurmas filtra por unidade', async () => {
    const rede = await criarRede();
    const centro = await criarUnidade({ networkId: rede.id });
    const praia = await criarUnidade({ networkId: rede.id });
    const anoLetivo = await criarAnoLetivo({ networkId: rede.id });
    await criarTurma({
      networkId: rede.id, schoolId: centro.id, academicYearId: anoLetivo.id, name: 'Centro 6º A',
    });
    await criarTurma({
      networkId: rede.id, schoolId: praia.id, academicYearId: anoLetivo.id, name: 'Praia 6º A',
    });

    const turmas = await academico.listarTurmas(rede.id, { unidadeId: centro.id });

    expect(turmas.map((turma) => turma.nome)).toEqual(['Centro 6º A']);
  });

  test('listarTurmas filtra por ano letivo', async () => {
    const rede = await criarRede();
    const unidade = await criarUnidade({ networkId: rede.id });
    const esteAno = await criarAnoLetivo({ networkId: rede.id, year: ANO_PADRAO });
    const proximoAno = await criarAnoLetivo({ networkId: rede.id, year: ANO_PADRAO + 1 });
    await criarTurma({
      networkId: rede.id, schoolId: unidade.id, academicYearId: esteAno.id, name: 'Turma de agora',
    });
    await criarTurma({
      networkId: rede.id, schoolId: unidade.id, academicYearId: proximoAno.id, name: 'Turma do ano que vem',
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
    await criarDisciplina({ networkId: rede.id, name: 'Matemática' });
    await criarDisciplina({ networkId: rede.id, name: 'Artes' });
    await criarDisciplina({ networkId: rede.id, name: 'História' });

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
    expect(doProfessor.every((linha) => linha.turmaNome === turma.name)).toBe(true);
    expect(doProfessor.every((linha) => linha.unidadeId === turma.schoolId)).toBe(true);
    expect(doProfessor.every((linha) => linha.turno === turma.shift)).toBe(true);
  });

  test('professor sem alocação nenhuma abre o painel vazio', async () => {
    const cenario = await cenarioCompleto();
    const outroProfessor = await criarUsuario({
      networkId: cenario.rede.id,
      papeis: [{ schoolId: cenario.unidades[0].id, role: 'teacher' }],
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
    const geografia = await criarDisciplina({ networkId: cenario.rede.id, name: 'Geografia' });
    await criarTurmaDisciplina({
      networkId: cenario.rede.id, classGroupId: segunda.id,
      subjectId: geografia.id, teacherUserId: cenario.professor.id,
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
    await criarResponsavel({ networkId: rede.id, name: 'Carla Dias' });
    await criarResponsavel({ networkId: rede.id, name: 'Ana Souza' });

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
    const aluno = await criarAluno({ networkId: rede.id });
    const mae = await criarResponsavel({
      networkId: rede.id, name: 'Ana Souza', email: 'ana@familia.br',
    });
    const pai = await criarResponsavel({
      networkId: rede.id, name: 'Bruno Souza', email: 'bruno@familia.br',
    });
    await vincularAlunoResponsavel({
      networkId: rede.id, studentId: aluno.id, guardianId: mae.id,
      relationship: 'mãe', financiallyResponsible: true,
    });
    await vincularAlunoResponsavel({
      networkId: rede.id, studentId: aluno.id, guardianId: pai.id,
      relationship: 'pai', financiallyResponsible: false,
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
      networkId: cenario.rede.id, name: 'Zulmira Sem Turma',
    });
    const alunoSaido = await criarAluno({ networkId: cenario.rede.id });
    await vincularAlunoResponsavel({
      networkId: cenario.rede.id, studentId: alunoSaido.id, guardianId: semMatricula.id,
    });
    await criarMatricula({
      networkId: cenario.rede.id, studentId: alunoSaido.id, classGroupId: cenario.turmas[0].id,
      academicYearId: cenario.anoLetivo.id, status: 'transferred',
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
      alunoNome: aluno.name,
      turmaId: turma.id,
      turmaNome: turma.name,
      unidadeId: turma.schoolId,
      anoLetivoId: cenario.anoLetivo.id,
      ano: ANO_PADRAO,
      dataMatricula: matricula.enrollmentDate,
      situacao: 'active',
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
    const irmao = await criarAluno({ networkId: cenario.rede.id, name: 'Irmão Caçula' });
    await vincularAlunoResponsavel({
      networkId: cenario.rede.id, studentId: irmao.id, guardianId: responsavel.id,
    });
    await criarMatricula({
      networkId: cenario.rede.id, studentId: irmao.id, classGroupId: cenario.turmas[1].id,
      academicYearId: cenario.anoLetivo.id,
    });

    const doResponsavel = await academico.matriculasDoResponsavel(cenario.rede.id, responsavel.id);

    expect(doResponsavel).toHaveLength(2);
    expect(doResponsavel.map((matricula) => matricula.alunoNome)).toContain('Irmão Caçula');
  });

  test('matriculasDoResponsavel mostra o histórico, com o ano mais recente primeiro', async () => {
    const cenario = await cenarioCompleto();
    const [responsavel] = cenario.responsaveis;
    const [aluno] = cenario.alunos;
    const proximoAno = await criarAnoLetivo({ networkId: cenario.rede.id, year: ANO_PADRAO + 1 });
    const turmaFutura = await criarTurma({
      networkId: cenario.rede.id, schoolId: cenario.unidades[0].id, academicYearId: proximoAno.id,
    });
    await criarMatricula({
      networkId: cenario.rede.id, studentId: aluno.id, classGroupId: turmaFutura.id,
      academicYearId: proximoAno.id, enrollmentDate: `${ANO_PADRAO + 1}-02-05`,
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

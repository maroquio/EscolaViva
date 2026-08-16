/*
 * As leituras do acadêmico. Duas coisas se provam aqui em cada consulta: que ela responde o que
 * a tela precisa e que ela nunca atravessa a fronteira da rede — o `rede_id` de todo filtro é o
 * que separa duas prefeituras que compartilham o mesmo banco.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { academics } from '../../src/academics';
import { limparBanco } from '../support/database';
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
} from '../support/factories';

beforeEach(limparBanco);

describe('buscarAlunos', () => {
  test('acha o aluno por um trecho do nome', async () => {
    const rede = await criarRede();
    await criarAluno({ networkId: rede.id, name: 'Ana Carolina Souza' });
    await criarAluno({ networkId: rede.id, name: 'Bruno Teixeira' });

    const encontrados = await academics.searchStudents(rede.id, 'Carolina');

    expect(encontrados.map((aluno) => aluno.name)).toEqual(['Ana Carolina Souza']);
  });

  test('a busca é insensível a maiúsculas e minúsculas', async () => {
    const rede = await criarRede();
    await criarAluno({ networkId: rede.id, name: 'Ana Carolina Souza' });

    const encontrados = await academics.searchStudents(rede.id, 'cArOLiNa');

    expect(encontrados.map((aluno) => aluno.name)).toEqual(['Ana Carolina Souza']);
  });

  test('devolve os achados em ordem de nome', async () => {
    const rede = await criarRede();
    await criarAluno({ networkId: rede.id, name: 'Carlos Silva' });
    await criarAluno({ networkId: rede.id, name: 'Ana Silva' });
    await criarAluno({ networkId: rede.id, name: 'Bruno Silva' });

    const encontrados = await academics.searchStudents(rede.id, 'silva');

    expect(encontrados.map((aluno) => aluno.name)).toEqual([
      'Ana Silva', 'Bruno Silva', 'Carlos Silva',
    ]);
  });

  test('nunca devolve aluno de outra rede', async () => {
    const nossa = await criarRede();
    const alheia = await criarRede();
    await criarAluno({ networkId: nossa.id, name: 'Ana Silva' });
    await criarAluno({ networkId: alheia.id, name: 'Ana Silva' });

    const encontrados = await academics.searchStudents(nossa.id, 'Ana Silva');

    expect(encontrados).toHaveLength(1);
    expect(encontrados[0]?.networkId).toBe(nossa.id);
  });

  test('trecho que ninguém tem devolve lista vazia', async () => {
    const rede = await criarRede();
    await criarAluno({ networkId: rede.id, name: 'Ana Silva' });

    const encontrados = await academics.searchStudents(rede.id, 'Wagner');

    expect(encontrados).toEqual([]);
  });

  test('os curingas do LIKE são procurados como texto comum', async () => {
    const rede = await criarRede();
    await criarAluno({ networkId: rede.id, name: 'Ana 100% Silva' });
    await criarAluno({ networkId: rede.id, name: 'Bruno Teixeira' });

    const encontrados = await academics.searchStudents(rede.id, '100%');

    expect(encontrados.map((aluno) => aluno.name)).toEqual(['Ana 100% Silva']);
  });

  test('a data de nascimento volta no formato canônico da aplicação', async () => {
    const rede = await criarRede();
    await criarAluno({ networkId: rede.id, name: 'Ana Silva', birthDate: '2014-05-10' });

    const encontrados = await academics.searchStudents(rede.id, 'Ana');

    expect(encontrados[0]?.birthDate).toBe('2014-05-10');
  });
});

describe('alunoPorId', () => {
  test('devolve o aluno da rede', async () => {
    const rede = await criarRede();
    const aluno = await criarAluno({ networkId: rede.id, name: 'Ana Silva' });

    const encontrado = await academics.studentById(rede.id, aluno.id);

    expect(encontrado).toEqual({
      id: aluno.id, networkId: rede.id, name: 'Ana Silva', birthDate: aluno.birthDate,
    });
  });

  test('aluno de outra rede não é alcançável pelo id', async () => {
    const { a, b } = await duasRedes();

    const encontrado = await academics.studentById(a.rede.id, b.alunos[0].id);

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

    const turmas = await academics.listClassGroups(rede.id);

    expect(turmas.map((turma) => turma.name)).toEqual(['6º A', '7º A', '7º B']);
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

    const turmas = await academics.listClassGroups(rede.id, { schoolId: centro.id });

    expect(turmas.map((turma) => turma.name)).toEqual(['Centro 6º A']);
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

    const turmas = await academics.listClassGroups(rede.id, { academicYearId: proximoAno.id });

    expect(turmas.map((turma) => turma.name)).toEqual(['Turma do ano que vem']);
  });

  test('listarTurmas nunca traz turma de outra rede', async () => {
    const { a, b } = await duasRedes();

    const turmas = await academics.listClassGroups(a.rede.id);

    expect(turmas.every((turma) => turma.networkId === a.rede.id)).toBe(true);
    expect(turmas.map((turma) => turma.id)).not.toContain(b.turmas[0].id);
  });

  test('turmaPorId não alcança turma de outra rede', async () => {
    const { a, b } = await duasRedes();

    const encontrada = await academics.classGroupById(a.rede.id, b.turmas[0].id);

    expect(encontrada).toBeNull();
    expect(await academics.classGroupById(a.rede.id, a.turmas[0].id)).not.toBeNull();
  });
});

describe('disciplinas da turma e do professor', () => {
  test('listarDisciplinas traz as disciplinas da rede em ordem de nome', async () => {
    const rede = await criarRede();
    await criarDisciplina({ networkId: rede.id, name: 'Matemática' });
    await criarDisciplina({ networkId: rede.id, name: 'Artes' });
    await criarDisciplina({ networkId: rede.id, name: 'História' });

    const disciplinas = await academics.listSubjects(rede.id);

    expect(disciplinas.map((disciplina) => disciplina.name)).toEqual([
      'Artes', 'História', 'Matemática',
    ]);
  });

  test('listarTurmaDisciplinas traz as alocações da turma com o nome da disciplina', async () => {
    const cenario = await cenarioCompleto();
    const [turma] = cenario.turmas;

    const alocacoes = await academics.listClassGroupSubjects(cenario.rede.id, turma.id);

    expect(alocacoes).toHaveLength(3);
    expect(alocacoes.every((alocacao) => alocacao.classGroupId === turma.id)).toBe(true);
    expect(alocacoes.every((alocacao) => alocacao.subjectName.length > 0)).toBe(true);
    expect(alocacoes.every((alocacao) => alocacao.teacherUserId === cenario.professor.id)).toBe(true);
  });

  test('turmaDisciplinaPorId devolve a alocação e não alcança a de outra rede', async () => {
    const { a, b } = await duasRedes();
    const alvo = a.turmaDisciplinas[0];

    const encontrada = await academics.classGroupSubjectById(a.rede.id, alvo.id);

    expect(encontrada?.id).toBe(alvo.id);
    expect(await academics.classGroupSubjectById(a.rede.id, b.turmaDisciplinas[0].id)).toBeNull();
  });

  test('turmaDisciplinasDoProfessor traz turma e série junto da disciplina', async () => {
    const cenario = await cenarioCompleto();
    const [turma] = cenario.turmas;

    const doProfessor = await academics.teacherClassGroupSubjects(
      cenario.rede.id, cenario.professor.id,
    );

    expect(doProfessor).toHaveLength(3);
    expect(doProfessor.every((linha) => linha.classGroupName === turma.name)).toBe(true);
    expect(doProfessor.every((linha) => linha.schoolId === turma.schoolId)).toBe(true);
    expect(doProfessor.every((linha) => linha.shift === turma.shift)).toBe(true);
  });

  test('professor sem alocação nenhuma abre o painel vazio', async () => {
    const cenario = await cenarioCompleto();
    const outroProfessor = await criarUsuario({
      networkId: cenario.rede.id,
      papeis: [{ schoolId: cenario.unidades[0].id, role: 'teacher' }],
    });

    const doProfessor = await academics.teacherClassGroupSubjects(
      cenario.rede.id, outroProfessor.id,
    );

    expect(doProfessor).toEqual([]);
  });

  test('turmasDoProfessor traz cada turma uma vez, mesmo com várias disciplinas nela', async () => {
    const cenario = await cenarioCompleto();
    const [turma] = cenario.turmas;

    const turmas = await academics.teacherClassGroups(cenario.rede.id, cenario.professor.id);

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

    const turmas = await academics.teacherClassGroups(cenario.rede.id, cenario.professor.id);

    expect(turmas.map((linha) => linha.id).sort()).toEqual([primeira.id, segunda.id].sort());
  });

  test('as alocações do professor de outra rede não vazam', async () => {
    const { a, b } = await duasRedes();

    const doProfessorAlheio = await academics.teacherClassGroupSubjects(
      a.rede.id, b.professor.id,
    );

    expect(doProfessorAlheio).toEqual([]);
    expect(await academics.teacherClassGroups(a.rede.id, b.professor.id)).toEqual([]);
  });
});

describe('responsáveis', () => {
  test('listarResponsaveis traz os da rede em ordem de nome', async () => {
    const rede = await criarRede();
    await criarResponsavel({ networkId: rede.id, name: 'Carla Dias' });
    await criarResponsavel({ networkId: rede.id, name: 'Ana Souza' });

    const responsaveis = await academics.listGuardians(rede.id);

    expect(responsaveis.map((responsavel) => responsavel.name)).toEqual(['Ana Souza', 'Carla Dias']);
  });

  test('listarResponsaveis não traz responsável de outra rede', async () => {
    const { a, b } = await duasRedes();

    const responsaveis = await academics.listGuardians(a.rede.id);

    expect(responsaveis.every((responsavel) => responsavel.networkId === a.rede.id)).toBe(true);
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

    const vinculos = await academics.studentGuardians(rede.id, aluno.id);

    expect(vinculos).toEqual([
      {
        guardianId: mae.id, name: 'Ana Souza', email: 'ana@familia.br',
        relationship: 'mãe', financiallyResponsible: true,
      },
      {
        guardianId: pai.id, name: 'Bruno Souza', email: 'bruno@familia.br',
        relationship: 'pai', financiallyResponsible: false,
      },
    ]);
  });

  test('responsaveisDaUnidade traz quem responde por aluno com matrícula ativa ali', async () => {
    const cenario = await cenarioCompleto();
    const [unidadeComAlunos, unidadeVazia] = cenario.unidades;

    const daUnidade = await academics.schoolGuardians(cenario.rede.id, unidadeComAlunos.id);

    expect(daUnidade).toHaveLength(5);
    expect(await academics.schoolGuardians(cenario.rede.id, unidadeVazia.id)).toEqual([]);
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

    const daUnidade = await academics.schoolGuardians(cenario.rede.id, unidade.id);

    expect(daUnidade.map((responsavel) => responsavel.id)).not.toContain(semMatricula.id);
  });
});

describe('matrículas', () => {
  test('matriculaPorId traz nome do aluno, nome da turma e ano', async () => {
    const cenario = await cenarioCompleto();
    const [matricula] = cenario.matriculas;
    const [aluno] = cenario.alunos;
    const [turma] = cenario.turmas;

    const encontrada = await academics.enrollmentById(cenario.rede.id, matricula.id);

    expect(encontrada).toEqual({
      id: matricula.id,
      networkId: cenario.rede.id,
      studentId: aluno.id,
      studentName: aluno.name,
      classGroupId: turma.id,
      classGroupName: turma.name,
      schoolId: turma.schoolId,
      academicYearId: cenario.anoLetivo.id,
      year: ANO_PADRAO,
      enrollmentDate: matricula.enrollmentDate,
      status: 'active',
    });
  });

  test('matrícula de outra rede não é alcançável pelo id', async () => {
    const { a, b } = await duasRedes();

    const encontrada = await academics.enrollmentById(a.rede.id, b.matriculas[0].id);

    expect(encontrada).toBeNull();
  });

  test('matriculasAtivasDaTurma lista os ativos em ordem de nome do aluno', async () => {
    const cenario = await cenarioCompleto();
    const [turma] = cenario.turmas;

    const ativas = await academics.activeEnrollmentsOfClassGroup(cenario.rede.id, turma.id);

    const nomes = ativas.map((matricula) => matricula.studentName);
    expect(ativas).toHaveLength(5);
    expect(nomes).toEqual([...nomes].sort());
  });

  test('matriculasAtivasDaTurma ignora quem saiu da turma', async () => {
    const cenario = await cenarioCompleto();
    const [turma] = cenario.turmas;
    const [saiu] = cenario.matriculas;
    await academics.transfer({
      networkId: cenario.rede.id, enrollmentId: saiu.id,
      targetClassGroupId: cenario.turmas[1].id, date: `${ANO_PADRAO}-06-01`,
    });

    const ativas = await academics.activeEnrollmentsOfClassGroup(cenario.rede.id, turma.id);

    expect(ativas).toHaveLength(4);
    expect(ativas.map((matricula) => matricula.id)).not.toContain(saiu.id);
  });

  test('matriculasDoResponsavel devolve só os alunos vinculados àquele responsável', async () => {
    const cenario = await cenarioCompleto();
    const [primeiro, segundo] = cenario.responsaveis;
    const [alunoDoPrimeiro] = cenario.alunos;

    const doPrimeiro = await academics.guardianEnrollments(cenario.rede.id, primeiro.id);

    expect(doPrimeiro.map((matricula) => matricula.studentId)).toEqual([alunoDoPrimeiro.id]);
    const doSegundo = await academics.guardianEnrollments(cenario.rede.id, segundo.id);
    expect(doSegundo.map((matricula) => matricula.studentId)).not.toContain(alunoDoPrimeiro.id);
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

    const doResponsavel = await academics.guardianEnrollments(cenario.rede.id, responsavel.id);

    expect(doResponsavel).toHaveLength(2);
    expect(doResponsavel.map((matricula) => matricula.studentName)).toContain('Irmão Caçula');
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

    const doResponsavel = await academics.guardianEnrollments(cenario.rede.id, responsavel.id);

    expect(doResponsavel.map((matricula) => matricula.year)).toEqual([ANO_PADRAO + 1, ANO_PADRAO]);
  });

  test('matriculasDoResponsavel de outra rede não devolve nada', async () => {
    const { a, b } = await duasRedes();

    const alheias = await academics.guardianEnrollments(a.rede.id, b.responsaveis[0].id);

    expect(alheias).toEqual([]);
  });
});

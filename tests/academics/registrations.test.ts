/*
 * Os cadastros que a secretaria alimenta antes de qualquer matrícula. Cada unicidade aqui é uma
 * constraint do banco (I8) traduzida em erro de campo pelo caso de uso — e cada uma delas vale
 * DENTRO da rede: duas prefeituras podem ter a mesma disciplina, a mesma turma e o mesmo e-mail
 * de responsável sem se atropelarem.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { academics } from '../../src/academics';
import type { ApplicationError, Result } from '../../src/shared/result';
import { clearDatabase } from '../support/database';
import {
  DEFAULT_YEAR,
  fullScenario,
  createStudent,
  createAcademicYear,
  createSubject,
  createNetwork,
  createGuardian,
  createClassGroup,
  createSchool,
  createUser,
  twoNetworks,
  linkStudentGuardian,
} from '../support/factories';

function valueOfResult<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`esperava sucesso, vieram erros: ${JSON.stringify(result.erros)}`);
  }
  return result.valor;
}

function errorsOf(result: Result<unknown>): ApplicationError[] {
  if (result.ok) throw new Error('esperava recusa da aplicação, veio sucesso');
  return result.erros;
}

beforeEach(clearDatabase);

describe('definirAnoLetivo', () => {
  test('grava o ano letivo da rede com o período informado', async () => {
    const network = await createNetwork();

    const result = await academics.defineAcademicYear({
      networkId: network.id, year: 2027, startDate: '2027-02-01', endDate: '2027-12-15',
    });

    const academicYear = valueOfResult(result);
    expect(academicYear).toEqual({
      id: academicYear.id, networkId: network.id, year: 2027,
      startDate: '2027-02-01', endDate: '2027-12-15',
    });
    expect(await academics.listAcademicYears(network.id)).toEqual([academicYear]);
  });

  test('recusa o mesmo ano duas vezes na rede', async () => {
    const network = await createNetwork();
    await createAcademicYear({ networkId: network.id, year: 2027 });

    const result = await academics.defineAcademicYear({
      networkId: network.id, year: 2027, startDate: '2027-02-01', endDate: '2027-12-15',
    });

    expect(errorsOf(result)).toEqual([
      { campo: 'ano', codigo: 'ano_duplicado', mensagem: 'Esta rede já tem o ano letivo 2027 definido.' },
    ]);
    expect(await academics.listAcademicYears(network.id)).toHaveLength(1);
  });

  test('aceita o mesmo ano em outra rede', async () => {
    const first = await createNetwork();
    const second = await createNetwork();
    await createAcademicYear({ networkId: first.id, year: 2027 });

    const result = await academics.defineAcademicYear({
      networkId: second.id, year: 2027, startDate: '2027-02-01', endDate: '2027-12-15',
    });

    expect(result.ok).toBe(true);
    expect(await academics.listAcademicYears(first.id)).toHaveLength(1);
  });

  test('recusa período com término anterior ao início', async () => {
    const network = await createNetwork();

    const result = await academics.defineAcademicYear({
      networkId: network.id, year: 2027, startDate: '2027-12-15', endDate: '2027-02-01',
    });

    expect(errorsOf(result)).toEqual([
      {
        campo: 'dataFim',
        codigo: 'periodo_incoerente',
        mensagem: 'A data de término precisa ser posterior à data de início.',
      },
    ]);
  });

  test('recusa ano fora da faixa que o produto atende', async () => {
    const network = await createNetwork();

    const result = await academics.defineAcademicYear({
      networkId: network.id, year: 1998, startDate: '1998-02-01', endDate: '1998-12-15',
    });

    expect(errorsOf(result)[0]?.campo).toBe('ano');
  });

  test('lista os anos letivos do mais recente para o mais antigo', async () => {
    const network = await createNetwork();
    await createAcademicYear({ networkId: network.id, year: 2025 });
    await createAcademicYear({ networkId: network.id, year: 2027 });
    await createAcademicYear({ networkId: network.id, year: 2026 });

    const years = await academics.listAcademicYears(network.id);

    expect(years.map((academicYear) => academicYear.year)).toEqual([2027, 2026, 2025]);
  });
});

describe('cadastrarDisciplina', () => {
  test('grava a disciplina da rede', async () => {
    const network = await createNetwork();

    const result = await academics.registerSubject({ networkId: network.id, name: 'Matemática' });

    const subject = valueOfResult(result);
    expect(subject).toEqual({ id: subject.id, networkId: network.id, name: 'Matemática' });
    expect(await academics.listSubjects(network.id)).toEqual([subject]);
  });

  test('recusa disciplina com nome repetido na rede', async () => {
    const network = await createNetwork();
    await createSubject({ networkId: network.id, name: 'Matemática' });

    const result = await academics.registerSubject({ networkId: network.id, name: 'Matemática' });

    expect(errorsOf(result)).toEqual([
      {
        campo: 'nome',
        codigo: 'disciplina_duplicada',
        mensagem: 'Esta rede já tem uma disciplina com este nome.',
      },
    ]);
    expect(await academics.listSubjects(network.id)).toHaveLength(1);
  });

  test('aceita a mesma disciplina em outra rede', async () => {
    const first = await createNetwork();
    const second = await createNetwork();
    await createSubject({ networkId: first.id, name: 'Matemática' });

    const result = await academics.registerSubject({ networkId: second.id, name: 'Matemática' });

    expect(result.ok).toBe(true);
  });

  test('recusa disciplina sem nome', async () => {
    const network = await createNetwork();

    const result = await academics.registerSubject({ networkId: network.id, name: '   ' });

    expect(errorsOf(result)[0]?.campo).toBe('nome');
  });
});

describe('cadastrarTurma', () => {
  test('grava a turma da unidade no ano letivo', async () => {
    const network = await createNetwork();
    const school = await createSchool({ networkId: network.id });
    const academicYear = await createAcademicYear({ networkId: network.id });

    const result = await academics.registerClassGroup({
      networkId: network.id, schoolId: school.id, academicYearId: academicYear.id,
      name: '6º A', gradeLevel: '6º ano', shift: 'morning',
    });

    const classGroup = valueOfResult(result);
    expect(classGroup).toEqual({
      id: classGroup.id, networkId: network.id, schoolId: school.id, academicYearId: academicYear.id,
      name: '6º A', gradeLevel: '6º ano', shift: 'morning',
    });
    expect(await academics.classGroupById(network.id, classGroup.id)).toEqual(classGroup);
  });

  test('recusa turma com o mesmo nome na mesma unidade e ano letivo', async () => {
    const network = await createNetwork();
    const school = await createSchool({ networkId: network.id });
    const academicYear = await createAcademicYear({ networkId: network.id });
    await createClassGroup({
      networkId: network.id, schoolId: school.id, academicYearId: academicYear.id, name: '6º A',
    });

    const result = await academics.registerClassGroup({
      networkId: network.id, schoolId: school.id, academicYearId: academicYear.id,
      name: '6º A', gradeLevel: '6º ano', shift: 'afternoon',
    });

    expect(errorsOf(result)).toEqual([
      {
        campo: 'nome',
        codigo: 'turma_duplicada',
        mensagem: 'Esta unidade já tem uma turma com este nome neste ano letivo.',
      },
    ]);
    expect(await academics.listClassGroups(network.id)).toHaveLength(1);
  });

  test('aceita o mesmo nome de turma em outra unidade da mesma rede', async () => {
    const network = await createNetwork();
    const center = await createSchool({ networkId: network.id });
    const beach = await createSchool({ networkId: network.id });
    const academicYear = await createAcademicYear({ networkId: network.id });
    await createClassGroup({
      networkId: network.id, schoolId: center.id, academicYearId: academicYear.id, name: '6º A',
    });

    const result = await academics.registerClassGroup({
      networkId: network.id, schoolId: beach.id, academicYearId: academicYear.id,
      name: '6º A', gradeLevel: '6º ano', shift: 'morning',
    });

    expect(result.ok).toBe(true);
  });

  test('aceita o mesmo nome de turma na mesma unidade em outro ano letivo', async () => {
    const network = await createNetwork();
    const school = await createSchool({ networkId: network.id });
    const thisYear = await createAcademicYear({ networkId: network.id, year: DEFAULT_YEAR });
    const nextYear = await createAcademicYear({ networkId: network.id, year: DEFAULT_YEAR + 1 });
    await createClassGroup({
      networkId: network.id, schoolId: school.id, academicYearId: thisYear.id, name: '6º A',
    });

    const result = await academics.registerClassGroup({
      networkId: network.id, schoolId: school.id, academicYearId: nextYear.id,
      name: '6º A', gradeLevel: '6º ano', shift: 'morning',
    });

    expect(result.ok).toBe(true);
  });

  test('recusa turno que o domínio não conhece', async () => {
    const network = await createNetwork();
    const school = await createSchool({ networkId: network.id });
    const academicYear = await createAcademicYear({ networkId: network.id });

    const result = await academics.registerClassGroup({
      networkId: network.id, schoolId: school.id, academicYearId: academicYear.id,
      name: '6º A', gradeLevel: '6º ano', shift: 'madrugada',
    });

    expect(errorsOf(result)[0]?.campo).toBe('turno');
  });

  test('recusa unidade de outra rede', async () => {
    const ours = await createNetwork();
    const foreign = await createNetwork();
    const otherSchool = await createSchool({ networkId: foreign.id });
    const academicYear = await createAcademicYear({ networkId: ours.id });

    const result = await academics.registerClassGroup({
      networkId: ours.id, schoolId: otherSchool.id, academicYearId: academicYear.id,
      name: '6º A', gradeLevel: '6º ano', shift: 'morning',
    });

    expect(errorsOf(result)).toEqual([
      {
        campo: 'unidadeId',
        codigo: 'unidade_nao_encontrada',
        mensagem: 'Unidade não encontrada nesta rede.',
      },
    ]);
  });

  test('recusa ano letivo de outra rede', async () => {
    const ours = await createNetwork();
    const foreign = await createNetwork();
    const school = await createSchool({ networkId: ours.id });
    const foreignAcademicYear = await createAcademicYear({ networkId: foreign.id });

    const result = await academics.registerClassGroup({
      networkId: ours.id, schoolId: school.id, academicYearId: foreignAcademicYear.id,
      name: '6º A', gradeLevel: '6º ano', shift: 'morning',
    });

    expect(errorsOf(result)[0]?.codigo).toBe('ano_letivo_nao_encontrado');
  });
});

describe('cadastrarAluno', () => {
  test('grava o aluno da rede', async () => {
    const network = await createNetwork();

    const result = await academics.registerStudent({
      networkId: network.id, name: '  Ana Souza  ', birthDate: '2014-05-10',
    });

    const student = valueOfResult(result);
    expect(student).toEqual({
      id: student.id, networkId: network.id, name: 'Ana Souza', birthDate: '2014-05-10',
    });
    expect(await academics.studentById(network.id, student.id)).toEqual(student);
  });

  test('recusa data de nascimento no futuro', async () => {
    const network = await createNetwork();

    const result = await academics.registerStudent({
      networkId: network.id, name: 'Ana Souza', birthDate: '2099-01-01',
    });

    expect(errorsOf(result)).toEqual([
      {
        campo: 'dataNascimento',
        codigo: 'data_no_futuro',
        mensagem: 'A data de nascimento não pode estar no futuro.',
      },
    ]);
    expect(await academics.searchStudents(network.id, 'Ana')).toHaveLength(0);
  });

  test('recusa data de nascimento fora do formato', async () => {
    const network = await createNetwork();

    const result = await academics.registerStudent({
      networkId: network.id, name: 'Ana Souza', birthDate: '10/05/2014',
    });

    expect(errorsOf(result)[0]?.campo).toBe('dataNascimento');
  });

  test('recusa aluno sem nome', async () => {
    const network = await createNetwork();

    const result = await academics.registerStudent({
      networkId: network.id, name: '', birthDate: '2014-05-10',
    });

    expect(errorsOf(result)[0]?.campo).toBe('nome');
  });

  test('dois alunos podem ter o mesmo nome: homônimo não é duplicidade', async () => {
    const network = await createNetwork();
    await academics.registerStudent({
      networkId: network.id, name: 'Ana Souza', birthDate: '2014-05-10',
    });

    const result = await academics.registerStudent({
      networkId: network.id, name: 'Ana Souza', birthDate: '2015-09-22',
    });

    expect(result.ok).toBe(true);
    expect(await academics.searchStudents(network.id, 'Ana Souza')).toHaveLength(2);
  });
});

describe('cadastrarResponsavel', () => {
  test('grava o responsável com e-mail normalizado', async () => {
    const network = await createNetwork();

    const result = await academics.registerGuardian({
      networkId: network.id, name: 'Carla Dias', email: '  Carla.DIAS@Familia.BR ', phone: '27999990000',
    });

    const guardian = valueOfResult(result);
    expect(guardian).toEqual({
      id: guardian.id, networkId: network.id, name: 'Carla Dias', cpf: null,
      email: 'carla.dias@familia.br', phone: '27999990000',
    });
  });

  test('telefone em branco vira ausência de telefone', async () => {
    const network = await createNetwork();

    const result = await academics.registerGuardian({
      networkId: network.id, name: 'Carla Dias', email: 'carla@familia.br', phone: '',
    });

    expect(valueOfResult(result).phone).toBeNull();
  });

  test('recusa e-mail já cadastrado na rede', async () => {
    const network = await createNetwork();
    await createGuardian({ networkId: network.id, email: 'carla@familia.br' });

    const result = await academics.registerGuardian({
      networkId: network.id, name: 'Outra Carla', email: 'carla@familia.br',
    });

    expect(errorsOf(result)).toEqual([
      {
        campo: 'email',
        codigo: 'email_duplicado',
        mensagem: 'Esta rede já tem um responsável com este e-mail.',
      },
    ]);
    expect(await academics.listGuardians(network.id)).toHaveLength(1);
  });

  test('aceita o mesmo e-mail de responsável em outra rede', async () => {
    const first = await createNetwork();
    const second = await createNetwork();
    await createGuardian({ networkId: first.id, email: 'carla@familia.br' });

    const result = await academics.registerGuardian({
      networkId: second.id, name: 'Carla Dias', email: 'carla@familia.br',
    });

    expect(result.ok).toBe(true);
    expect(await academics.listGuardians(first.id)).toHaveLength(1);
    expect(await academics.listGuardians(second.id)).toHaveLength(1);
  });

  test('recusa e-mail inválido', async () => {
    const network = await createNetwork();

    const result = await academics.registerGuardian({
      networkId: network.id, name: 'Carla Dias', email: 'carla-arroba-nada',
    });

    expect(errorsOf(result)[0]?.campo).toBe('email');
  });

  test('cadastra responsável sem CPF — o estrangeiro existe como contato', async () => {
    const network = await createNetwork({});

    const created = await academics.registerGuardian({
      networkId: network.id,
      name: 'Aiko Tanaka',
      email: 'aiko@escolaviva.test',
      cpf: '',
    });

    expect(created.ok).toBe(true);
    if (created.ok) expect(created.valor.cpf).toBeNull();
  });

  test('aceita CPF null explícito no cadastro', async () => {
    const network = await createNetwork({});

    const created = await academics.registerGuardian({
      networkId: network.id,
      name: 'Maria Santos',
      email: 'maria@escolaviva.test',
      cpf: null,
    });

    expect(created.ok).toBe(true);
    if (created.ok) expect(created.valor.cpf).toBeNull();
  });

  test('recusa CPF com verificador errado', async () => {
    const network = await createNetwork({});

    const created = await academics.registerGuardian({
      networkId: network.id,
      name: 'Marcos Vinícius Pires',
      email: 'marcos@escolaviva.test',
      cpf: '52998224724',
    });

    expect(created.ok).toBe(false);
    if (!created.ok) expect(created.erros[0]?.campo).toBe('cpf');
  });

  test('guarda o CPF só com dígitos, mesmo digitado com pontuação', async () => {
    const network = await createNetwork({});

    const created = await academics.registerGuardian({
      networkId: network.id,
      name: 'Heloísa Braga Sampaio',
      email: 'heloisa@escolaviva.test',
      cpf: '529.982.247-25',
    });

    expect(created.ok).toBe(true);
    if (created.ok) expect(created.valor.cpf).toBe('52998224725');
  });
});

describe('vincularResponsavel', () => {
  test('liga o responsável ao aluno com o parentesco informado', async () => {
    const network = await createNetwork();
    const student = await createStudent({ networkId: network.id });
    const guardian = await createGuardian({
      networkId: network.id, name: 'Carla Dias', email: 'carla@familia.br',
    });

    const result = await academics.linkGuardian({
      networkId: network.id, studentId: student.id, guardianId: guardian.id,
      relationship: 'mãe', financiallyResponsible: true,
    });

    expect(result.ok).toBe(true);
    expect(await academics.studentGuardians(network.id, student.id)).toEqual([
      {
        guardianId: guardian.id, name: 'Carla Dias',
        email: 'carla@familia.br', relationship: 'mãe', financiallyResponsible: true,
      },
    ]);
  });

  test('recusa o mesmo vínculo duas vezes', async () => {
    const network = await createNetwork();
    const student = await createStudent({ networkId: network.id });
    const guardian = await createGuardian({ networkId: network.id });
    await linkStudentGuardian({
      networkId: network.id, studentId: student.id, guardianId: guardian.id,
    });

    const result = await academics.linkGuardian({
      networkId: network.id, studentId: student.id, guardianId: guardian.id,
      relationship: 'pai', financiallyResponsible: false,
    });

    expect(errorsOf(result)).toEqual([
      {
        campo: 'responsavelId',
        codigo: 'vinculo_duplicado',
        mensagem: 'Este responsável já está vinculado a este aluno.',
      },
    ]);
    expect(await academics.studentGuardians(network.id, student.id)).toHaveLength(1);
  });

  test('recusa aluno de outra rede', async () => {
    const ours = await createNetwork();
    const foreign = await createNetwork();
    const foreignStudent = await createStudent({ networkId: foreign.id });
    const guardian = await createGuardian({ networkId: ours.id });

    const result = await academics.linkGuardian({
      networkId: ours.id, studentId: foreignStudent.id, guardianId: guardian.id,
      relationship: 'mãe', financiallyResponsible: true,
    });

    expect(errorsOf(result)[0]?.codigo).toBe('aluno_nao_encontrado');
  });

  test('recusa responsável de outra rede', async () => {
    const ours = await createNetwork();
    const foreign = await createNetwork();
    const student = await createStudent({ networkId: ours.id });
    const foreignGuardian = await createGuardian({ networkId: foreign.id });

    const result = await academics.linkGuardian({
      networkId: ours.id, studentId: student.id, guardianId: foreignGuardian.id,
      relationship: 'mãe', financiallyResponsible: true,
    });

    expect(errorsOf(result)[0]?.codigo).toBe('responsavel_nao_encontrado');
  });

  test('recusa vínculo sem parentesco', async () => {
    const network = await createNetwork();
    const student = await createStudent({ networkId: network.id });
    const guardian = await createGuardian({ networkId: network.id });

    const result = await academics.linkGuardian({
      networkId: network.id, studentId: student.id, guardianId: guardian.id,
      relationship: ' ', financiallyResponsible: false,
    });

    expect(errorsOf(result)[0]?.campo).toBe('parentesco');
  });
});

describe('alocarProfessor', () => {
  test('aloca a disciplina na turma com o professor da unidade', async () => {
    const scenario = await fullScenario();
    const [, emptyClassGroup] = scenario.classGroups;
    const subject = await createSubject({ networkId: scenario.network.id, name: 'Geografia' });

    const result = await academics.assignTeacher({
      networkId: scenario.network.id, classGroupId: emptyClassGroup.id,
      subjectId: subject.id, teacherUserId: scenario.teacher.id,
    });

    const assignment = valueOfResult(result);
    expect(assignment).toEqual({
      id: assignment.id, networkId: scenario.network.id, classGroupId: emptyClassGroup.id,
      subjectId: subject.id, subjectName: 'Geografia',
      teacherUserId: scenario.teacher.id,
    });
    expect(await academics.listClassGroupSubjects(scenario.network.id, emptyClassGroup.id)).toEqual([assignment]);
  });

  test('recusa quem não tem papel de professor na unidade da turma', async () => {
    const scenario = await fullScenario();
    const [, emptyClassGroup] = scenario.classGroups;
    const subject = await createSubject({ networkId: scenario.network.id });

    const result = await academics.assignTeacher({
      networkId: scenario.network.id, classGroupId: emptyClassGroup.id,
      subjectId: subject.id, teacherUserId: scenario.registrar.id,
    });

    expect(errorsOf(result)).toEqual([
      {
        campo: 'professorUsuarioId',
        codigo: 'sem_papel_de_professor',
        mensagem: 'Este usuário não tem papel de professor na unidade desta turma.',
      },
    ]);
    expect(await academics.listClassGroupSubjects(scenario.network.id, emptyClassGroup.id)).toHaveLength(0);
  });

  test('recusa professor de outra unidade da mesma rede', async () => {
    const scenario = await fullScenario();
    const [, anotherSchool] = scenario.schools;
    const classGroupOfAnotherSchool = await createClassGroup({
      networkId: scenario.network.id, schoolId: anotherSchool.id, academicYearId: scenario.academicYear.id,
    });
    const subject = await createSubject({ networkId: scenario.network.id });

    const result = await academics.assignTeacher({
      networkId: scenario.network.id, classGroupId: classGroupOfAnotherSchool.id,
      subjectId: subject.id, teacherUserId: scenario.teacher.id,
    });

    expect(errorsOf(result)[0]?.codigo).toBe('sem_papel_de_professor');
  });

  test('recusa professor de outra rede', async () => {
    const { a, b } = await twoNetworks();
    const [, emptyClassGroup] = a.classGroups;
    const subject = await createSubject({ networkId: a.network.id });

    const result = await academics.assignTeacher({
      networkId: a.network.id, classGroupId: emptyClassGroup.id,
      subjectId: subject.id, teacherUserId: b.teacher.id,
    });

    expect(errorsOf(result)[0]?.codigo).toBe('sem_papel_de_professor');
  });

  test('recusa a mesma disciplina duas vezes na mesma turma', async () => {
    const scenario = await fullScenario();
    const [classGroupWithSubjects] = scenario.classGroups;
    const [portuguese] = scenario.subjects;

    const result = await academics.assignTeacher({
      networkId: scenario.network.id, classGroupId: classGroupWithSubjects.id,
      subjectId: portuguese.id, teacherUserId: scenario.teacher.id,
    });

    expect(errorsOf(result)).toEqual([
      {
        campo: 'disciplinaId',
        codigo: 'disciplina_ja_alocada',
        mensagem: 'Esta disciplina já está alocada nesta turma.',
      },
    ]);
    expect(
      await academics.listClassGroupSubjects(scenario.network.id, classGroupWithSubjects.id),
    ).toHaveLength(3);
  });

  test('a mesma disciplina pode ser alocada em outra turma', async () => {
    const scenario = await fullScenario();
    const [, emptyClassGroup] = scenario.classGroups;
    const [portuguese] = scenario.subjects;

    const result = await academics.assignTeacher({
      networkId: scenario.network.id, classGroupId: emptyClassGroup.id,
      subjectId: portuguese.id, teacherUserId: scenario.teacher.id,
    });

    expect(result.ok).toBe(true);
  });

  test('recusa turma de outra rede', async () => {
    const { a, b } = await twoNetworks();
    const subject = await createSubject({ networkId: a.network.id });

    const result = await academics.assignTeacher({
      networkId: a.network.id, classGroupId: b.classGroups[1].id,
      subjectId: subject.id, teacherUserId: a.teacher.id,
    });

    expect(errorsOf(result)[0]?.codigo).toBe('turma_nao_encontrada');
  });

  test('recusa disciplina de outra rede', async () => {
    const { a, b } = await twoNetworks();

    const result = await academics.assignTeacher({
      networkId: a.network.id, classGroupId: a.classGroups[1].id,
      subjectId: b.subjects[0].id, teacherUserId: a.teacher.id,
    });

    expect(errorsOf(result)[0]?.codigo).toBe('disciplina_nao_encontrada');
  });

  test('recusa ids fora do formato antes de tocar no banco', async () => {
    const scenario = await fullScenario();

    const result = await academics.assignTeacher({
      networkId: scenario.network.id, classGroupId: 'nao-e-uuid',
      subjectId: 'tambem-nao', teacherUserId: scenario.teacher.id,
    });

    expect(errorsOf(result).map((error) => error.campo)).toEqual(['turmaId', 'disciplinaId']);
  });
});

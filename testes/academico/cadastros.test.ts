/*
 * Os cadastros que a secretaria alimenta antes de qualquer matrícula. Cada unicidade aqui é uma
 * constraint do banco (I8) traduzida em erro de campo pelo caso de uso — e cada uma delas vale
 * DENTRO da rede: duas prefeituras podem ter a mesma disciplina, a mesma turma e o mesmo e-mail
 * de responsável sem se atropelarem.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { academics } from '../../src/academics';
import type { ApplicationError, Result } from '../../src/shared/result';
import { limparBanco } from '../apoio/banco';
import {
  ANO_PADRAO,
  cenarioCompleto,
  criarAluno,
  criarAnoLetivo,
  criarDisciplina,
  criarRede,
  criarResponsavel,
  criarTurma,
  criarUnidade,
  criarUsuario,
  duasRedes,
  vincularAlunoResponsavel,
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

describe('definirAnoLetivo', () => {
  test('grava o ano letivo da rede com o período informado', async () => {
    const rede = await criarRede();

    const resultado = await academics.defineAcademicYear({
      networkId: rede.id, year: 2027, startDate: '2027-02-01', endDate: '2027-12-15',
    });

    const anoLetivo = valorDe(resultado);
    expect(anoLetivo).toEqual({
      id: anoLetivo.id, networkId: rede.id, year: 2027,
      startDate: '2027-02-01', endDate: '2027-12-15',
    });
    expect(await academics.listAcademicYears(rede.id)).toEqual([anoLetivo]);
  });

  test('recusa o mesmo ano duas vezes na rede', async () => {
    const rede = await criarRede();
    await criarAnoLetivo({ networkId: rede.id, year: 2027 });

    const resultado = await academics.defineAcademicYear({
      networkId: rede.id, year: 2027, startDate: '2027-02-01', endDate: '2027-12-15',
    });

    expect(errosDe(resultado)).toEqual([
      { campo: 'ano', codigo: 'ano_duplicado', mensagem: 'Esta rede já tem o ano letivo 2027 definido.' },
    ]);
    expect(await academics.listAcademicYears(rede.id)).toHaveLength(1);
  });

  test('aceita o mesmo ano em outra rede', async () => {
    const primeira = await criarRede();
    const segunda = await criarRede();
    await criarAnoLetivo({ networkId: primeira.id, year: 2027 });

    const resultado = await academics.defineAcademicYear({
      networkId: segunda.id, year: 2027, startDate: '2027-02-01', endDate: '2027-12-15',
    });

    expect(resultado.ok).toBe(true);
    expect(await academics.listAcademicYears(primeira.id)).toHaveLength(1);
  });

  test('recusa período com término anterior ao início', async () => {
    const rede = await criarRede();

    const resultado = await academics.defineAcademicYear({
      networkId: rede.id, year: 2027, startDate: '2027-12-15', endDate: '2027-02-01',
    });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'dataFim',
        codigo: 'periodo_incoerente',
        mensagem: 'A data de término precisa ser posterior à data de início.',
      },
    ]);
  });

  test('recusa ano fora da faixa que o produto atende', async () => {
    const rede = await criarRede();

    const resultado = await academics.defineAcademicYear({
      networkId: rede.id, year: 1998, startDate: '1998-02-01', endDate: '1998-12-15',
    });

    expect(errosDe(resultado)[0]?.campo).toBe('ano');
  });

  test('lista os anos letivos do mais recente para o mais antigo', async () => {
    const rede = await criarRede();
    await criarAnoLetivo({ networkId: rede.id, year: 2025 });
    await criarAnoLetivo({ networkId: rede.id, year: 2027 });
    await criarAnoLetivo({ networkId: rede.id, year: 2026 });

    const anos = await academics.listAcademicYears(rede.id);

    expect(anos.map((anoLetivo) => anoLetivo.year)).toEqual([2027, 2026, 2025]);
  });
});

describe('cadastrarDisciplina', () => {
  test('grava a disciplina da rede', async () => {
    const rede = await criarRede();

    const resultado = await academics.registerSubject({ networkId: rede.id, name: 'Matemática' });

    const disciplina = valorDe(resultado);
    expect(disciplina).toEqual({ id: disciplina.id, networkId: rede.id, name: 'Matemática' });
    expect(await academics.listSubjects(rede.id)).toEqual([disciplina]);
  });

  test('recusa disciplina com nome repetido na rede', async () => {
    const rede = await criarRede();
    await criarDisciplina({ networkId: rede.id, name: 'Matemática' });

    const resultado = await academics.registerSubject({ networkId: rede.id, name: 'Matemática' });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'nome',
        codigo: 'disciplina_duplicada',
        mensagem: 'Esta rede já tem uma disciplina com este nome.',
      },
    ]);
    expect(await academics.listSubjects(rede.id)).toHaveLength(1);
  });

  test('aceita a mesma disciplina em outra rede', async () => {
    const primeira = await criarRede();
    const segunda = await criarRede();
    await criarDisciplina({ networkId: primeira.id, name: 'Matemática' });

    const resultado = await academics.registerSubject({ networkId: segunda.id, name: 'Matemática' });

    expect(resultado.ok).toBe(true);
  });

  test('recusa disciplina sem nome', async () => {
    const rede = await criarRede();

    const resultado = await academics.registerSubject({ networkId: rede.id, name: '   ' });

    expect(errosDe(resultado)[0]?.campo).toBe('nome');
  });
});

describe('cadastrarTurma', () => {
  test('grava a turma da unidade no ano letivo', async () => {
    const rede = await criarRede();
    const unidade = await criarUnidade({ networkId: rede.id });
    const anoLetivo = await criarAnoLetivo({ networkId: rede.id });

    const resultado = await academics.registerClassGroup({
      networkId: rede.id, schoolId: unidade.id, academicYearId: anoLetivo.id,
      name: '6º A', gradeLevel: '6º ano', shift: 'morning',
    });

    const turma = valorDe(resultado);
    expect(turma).toEqual({
      id: turma.id, networkId: rede.id, schoolId: unidade.id, academicYearId: anoLetivo.id,
      name: '6º A', gradeLevel: '6º ano', shift: 'morning',
    });
    expect(await academics.classGroupById(rede.id, turma.id)).toEqual(turma);
  });

  test('recusa turma com o mesmo nome na mesma unidade e ano letivo', async () => {
    const rede = await criarRede();
    const unidade = await criarUnidade({ networkId: rede.id });
    const anoLetivo = await criarAnoLetivo({ networkId: rede.id });
    await criarTurma({
      networkId: rede.id, schoolId: unidade.id, academicYearId: anoLetivo.id, name: '6º A',
    });

    const resultado = await academics.registerClassGroup({
      networkId: rede.id, schoolId: unidade.id, academicYearId: anoLetivo.id,
      name: '6º A', gradeLevel: '6º ano', shift: 'afternoon',
    });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'nome',
        codigo: 'turma_duplicada',
        mensagem: 'Esta unidade já tem uma turma com este nome neste ano letivo.',
      },
    ]);
    expect(await academics.listClassGroups(rede.id)).toHaveLength(1);
  });

  test('aceita o mesmo nome de turma em outra unidade da mesma rede', async () => {
    const rede = await criarRede();
    const centro = await criarUnidade({ networkId: rede.id });
    const praia = await criarUnidade({ networkId: rede.id });
    const anoLetivo = await criarAnoLetivo({ networkId: rede.id });
    await criarTurma({
      networkId: rede.id, schoolId: centro.id, academicYearId: anoLetivo.id, name: '6º A',
    });

    const resultado = await academics.registerClassGroup({
      networkId: rede.id, schoolId: praia.id, academicYearId: anoLetivo.id,
      name: '6º A', gradeLevel: '6º ano', shift: 'morning',
    });

    expect(resultado.ok).toBe(true);
  });

  test('aceita o mesmo nome de turma na mesma unidade em outro ano letivo', async () => {
    const rede = await criarRede();
    const unidade = await criarUnidade({ networkId: rede.id });
    const esteAno = await criarAnoLetivo({ networkId: rede.id, year: ANO_PADRAO });
    const proximoAno = await criarAnoLetivo({ networkId: rede.id, year: ANO_PADRAO + 1 });
    await criarTurma({
      networkId: rede.id, schoolId: unidade.id, academicYearId: esteAno.id, name: '6º A',
    });

    const resultado = await academics.registerClassGroup({
      networkId: rede.id, schoolId: unidade.id, academicYearId: proximoAno.id,
      name: '6º A', gradeLevel: '6º ano', shift: 'morning',
    });

    expect(resultado.ok).toBe(true);
  });

  test('recusa turno que o domínio não conhece', async () => {
    const rede = await criarRede();
    const unidade = await criarUnidade({ networkId: rede.id });
    const anoLetivo = await criarAnoLetivo({ networkId: rede.id });

    const resultado = await academics.registerClassGroup({
      networkId: rede.id, schoolId: unidade.id, academicYearId: anoLetivo.id,
      name: '6º A', gradeLevel: '6º ano', shift: 'madrugada',
    });

    expect(errosDe(resultado)[0]?.campo).toBe('turno');
  });

  test('recusa unidade de outra rede', async () => {
    const nossa = await criarRede();
    const alheia = await criarRede();
    const unidadeAlheia = await criarUnidade({ networkId: alheia.id });
    const anoLetivo = await criarAnoLetivo({ networkId: nossa.id });

    const resultado = await academics.registerClassGroup({
      networkId: nossa.id, schoolId: unidadeAlheia.id, academicYearId: anoLetivo.id,
      name: '6º A', gradeLevel: '6º ano', shift: 'morning',
    });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'unidadeId',
        codigo: 'unidade_nao_encontrada',
        mensagem: 'Unidade não encontrada nesta rede.',
      },
    ]);
  });

  test('recusa ano letivo de outra rede', async () => {
    const nossa = await criarRede();
    const alheia = await criarRede();
    const unidade = await criarUnidade({ networkId: nossa.id });
    const anoLetivoAlheio = await criarAnoLetivo({ networkId: alheia.id });

    const resultado = await academics.registerClassGroup({
      networkId: nossa.id, schoolId: unidade.id, academicYearId: anoLetivoAlheio.id,
      name: '6º A', gradeLevel: '6º ano', shift: 'morning',
    });

    expect(errosDe(resultado)[0]?.codigo).toBe('ano_letivo_nao_encontrado');
  });
});

describe('cadastrarAluno', () => {
  test('grava o aluno da rede', async () => {
    const rede = await criarRede();

    const resultado = await academics.registerStudent({
      networkId: rede.id, name: '  Ana Souza  ', birthDate: '2014-05-10',
    });

    const aluno = valorDe(resultado);
    expect(aluno).toEqual({
      id: aluno.id, networkId: rede.id, name: 'Ana Souza', birthDate: '2014-05-10',
    });
    expect(await academics.studentById(rede.id, aluno.id)).toEqual(aluno);
  });

  test('recusa data de nascimento no futuro', async () => {
    const rede = await criarRede();

    const resultado = await academics.registerStudent({
      networkId: rede.id, name: 'Ana Souza', birthDate: '2099-01-01',
    });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'dataNascimento',
        codigo: 'data_no_futuro',
        mensagem: 'A data de nascimento não pode estar no futuro.',
      },
    ]);
    expect(await academics.searchStudents(rede.id, 'Ana')).toHaveLength(0);
  });

  test('recusa data de nascimento fora do formato', async () => {
    const rede = await criarRede();

    const resultado = await academics.registerStudent({
      networkId: rede.id, name: 'Ana Souza', birthDate: '10/05/2014',
    });

    expect(errosDe(resultado)[0]?.campo).toBe('dataNascimento');
  });

  test('recusa aluno sem nome', async () => {
    const rede = await criarRede();

    const resultado = await academics.registerStudent({
      networkId: rede.id, name: '', birthDate: '2014-05-10',
    });

    expect(errosDe(resultado)[0]?.campo).toBe('nome');
  });

  test('dois alunos podem ter o mesmo nome: homônimo não é duplicidade', async () => {
    const rede = await criarRede();
    await academics.registerStudent({
      networkId: rede.id, name: 'Ana Souza', birthDate: '2014-05-10',
    });

    const resultado = await academics.registerStudent({
      networkId: rede.id, name: 'Ana Souza', birthDate: '2015-09-22',
    });

    expect(resultado.ok).toBe(true);
    expect(await academics.searchStudents(rede.id, 'Ana Souza')).toHaveLength(2);
  });
});

describe('cadastrarResponsavel', () => {
  test('grava o responsável com e-mail normalizado', async () => {
    const rede = await criarRede();

    const resultado = await academics.registerGuardian({
      networkId: rede.id, name: 'Carla Dias', email: '  Carla.DIAS@Familia.BR ', phone: '27999990000',
    });

    const responsavel = valorDe(resultado);
    expect(responsavel).toEqual({
      id: responsavel.id, networkId: rede.id, name: 'Carla Dias', cpf: null,
      email: 'carla.dias@familia.br', phone: '27999990000',
    });
  });

  test('telefone em branco vira ausência de telefone', async () => {
    const rede = await criarRede();

    const resultado = await academics.registerGuardian({
      networkId: rede.id, name: 'Carla Dias', email: 'carla@familia.br', phone: '',
    });

    expect(valorDe(resultado).phone).toBeNull();
  });

  test('recusa e-mail já cadastrado na rede', async () => {
    const rede = await criarRede();
    await criarResponsavel({ networkId: rede.id, email: 'carla@familia.br' });

    const resultado = await academics.registerGuardian({
      networkId: rede.id, name: 'Outra Carla', email: 'carla@familia.br',
    });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'email',
        codigo: 'email_duplicado',
        mensagem: 'Esta rede já tem um responsável com este e-mail.',
      },
    ]);
    expect(await academics.listGuardians(rede.id)).toHaveLength(1);
  });

  test('aceita o mesmo e-mail de responsável em outra rede', async () => {
    const primeira = await criarRede();
    const segunda = await criarRede();
    await criarResponsavel({ networkId: primeira.id, email: 'carla@familia.br' });

    const resultado = await academics.registerGuardian({
      networkId: segunda.id, name: 'Carla Dias', email: 'carla@familia.br',
    });

    expect(resultado.ok).toBe(true);
    expect(await academics.listGuardians(primeira.id)).toHaveLength(1);
    expect(await academics.listGuardians(segunda.id)).toHaveLength(1);
  });

  test('recusa e-mail inválido', async () => {
    const rede = await criarRede();

    const resultado = await academics.registerGuardian({
      networkId: rede.id, name: 'Carla Dias', email: 'carla-arroba-nada',
    });

    expect(errosDe(resultado)[0]?.campo).toBe('email');
  });

  test('cadastra responsável sem CPF — o estrangeiro existe como contato', async () => {
    const rede = await criarRede({});

    const criado = await academics.registerGuardian({
      networkId: rede.id,
      name: 'Aiko Tanaka',
      email: 'aiko@escolaviva.test',
      cpf: '',
    });

    expect(criado.ok).toBe(true);
    if (criado.ok) expect(criado.valor.cpf).toBeNull();
  });

  test('aceita CPF null explícito no cadastro', async () => {
    const rede = await criarRede({});

    const criado = await academics.registerGuardian({
      networkId: rede.id,
      name: 'Maria Santos',
      email: 'maria@escolaviva.test',
      cpf: null,
    });

    expect(criado.ok).toBe(true);
    if (criado.ok) expect(criado.valor.cpf).toBeNull();
  });

  test('recusa CPF com verificador errado', async () => {
    const rede = await criarRede({});

    const criado = await academics.registerGuardian({
      networkId: rede.id,
      name: 'Marcos Vinícius Pires',
      email: 'marcos@escolaviva.test',
      cpf: '52998224724',
    });

    expect(criado.ok).toBe(false);
    if (!criado.ok) expect(criado.erros[0]?.campo).toBe('cpf');
  });

  test('guarda o CPF só com dígitos, mesmo digitado com pontuação', async () => {
    const rede = await criarRede({});

    const criado = await academics.registerGuardian({
      networkId: rede.id,
      name: 'Heloísa Braga Sampaio',
      email: 'heloisa@escolaviva.test',
      cpf: '529.982.247-25',
    });

    expect(criado.ok).toBe(true);
    if (criado.ok) expect(criado.valor.cpf).toBe('52998224725');
  });
});

describe('vincularResponsavel', () => {
  test('liga o responsável ao aluno com o parentesco informado', async () => {
    const rede = await criarRede();
    const aluno = await criarAluno({ networkId: rede.id });
    const responsavel = await criarResponsavel({
      networkId: rede.id, name: 'Carla Dias', email: 'carla@familia.br',
    });

    const resultado = await academics.linkGuardian({
      networkId: rede.id, studentId: aluno.id, guardianId: responsavel.id,
      relationship: 'mãe', financiallyResponsible: true,
    });

    expect(resultado.ok).toBe(true);
    expect(await academics.studentGuardians(rede.id, aluno.id)).toEqual([
      {
        guardianId: responsavel.id, name: 'Carla Dias',
        email: 'carla@familia.br', relationship: 'mãe', financiallyResponsible: true,
      },
    ]);
  });

  test('recusa o mesmo vínculo duas vezes', async () => {
    const rede = await criarRede();
    const aluno = await criarAluno({ networkId: rede.id });
    const responsavel = await criarResponsavel({ networkId: rede.id });
    await vincularAlunoResponsavel({
      networkId: rede.id, studentId: aluno.id, guardianId: responsavel.id,
    });

    const resultado = await academics.linkGuardian({
      networkId: rede.id, studentId: aluno.id, guardianId: responsavel.id,
      relationship: 'pai', financiallyResponsible: false,
    });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'responsavelId',
        codigo: 'vinculo_duplicado',
        mensagem: 'Este responsável já está vinculado a este aluno.',
      },
    ]);
    expect(await academics.studentGuardians(rede.id, aluno.id)).toHaveLength(1);
  });

  test('recusa aluno de outra rede', async () => {
    const nossa = await criarRede();
    const alheia = await criarRede();
    const alunoAlheio = await criarAluno({ networkId: alheia.id });
    const responsavel = await criarResponsavel({ networkId: nossa.id });

    const resultado = await academics.linkGuardian({
      networkId: nossa.id, studentId: alunoAlheio.id, guardianId: responsavel.id,
      relationship: 'mãe', financiallyResponsible: true,
    });

    expect(errosDe(resultado)[0]?.codigo).toBe('aluno_nao_encontrado');
  });

  test('recusa responsável de outra rede', async () => {
    const nossa = await criarRede();
    const alheia = await criarRede();
    const aluno = await criarAluno({ networkId: nossa.id });
    const responsavelAlheio = await criarResponsavel({ networkId: alheia.id });

    const resultado = await academics.linkGuardian({
      networkId: nossa.id, studentId: aluno.id, guardianId: responsavelAlheio.id,
      relationship: 'mãe', financiallyResponsible: true,
    });

    expect(errosDe(resultado)[0]?.codigo).toBe('responsavel_nao_encontrado');
  });

  test('recusa vínculo sem parentesco', async () => {
    const rede = await criarRede();
    const aluno = await criarAluno({ networkId: rede.id });
    const responsavel = await criarResponsavel({ networkId: rede.id });

    const resultado = await academics.linkGuardian({
      networkId: rede.id, studentId: aluno.id, guardianId: responsavel.id,
      relationship: ' ', financiallyResponsible: false,
    });

    expect(errosDe(resultado)[0]?.campo).toBe('parentesco');
  });
});

describe('alocarProfessor', () => {
  test('aloca a disciplina na turma com o professor da unidade', async () => {
    const cenario = await cenarioCompleto();
    const [, turmaVazia] = cenario.turmas;
    const disciplina = await criarDisciplina({ networkId: cenario.rede.id, name: 'Geografia' });

    const resultado = await academics.assignTeacher({
      networkId: cenario.rede.id, classGroupId: turmaVazia.id,
      subjectId: disciplina.id, teacherUserId: cenario.professor.id,
    });

    const alocacao = valorDe(resultado);
    expect(alocacao).toEqual({
      id: alocacao.id, networkId: cenario.rede.id, classGroupId: turmaVazia.id,
      subjectId: disciplina.id, subjectName: 'Geografia',
      teacherUserId: cenario.professor.id,
    });
    expect(await academics.listClassGroupSubjects(cenario.rede.id, turmaVazia.id)).toEqual([alocacao]);
  });

  test('recusa quem não tem papel de professor na unidade da turma', async () => {
    const cenario = await cenarioCompleto();
    const [, turmaVazia] = cenario.turmas;
    const disciplina = await criarDisciplina({ networkId: cenario.rede.id });

    const resultado = await academics.assignTeacher({
      networkId: cenario.rede.id, classGroupId: turmaVazia.id,
      subjectId: disciplina.id, teacherUserId: cenario.secretaria.id,
    });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'professorUsuarioId',
        codigo: 'sem_papel_de_professor',
        mensagem: 'Este usuário não tem papel de professor na unidade desta turma.',
      },
    ]);
    expect(await academics.listClassGroupSubjects(cenario.rede.id, turmaVazia.id)).toHaveLength(0);
  });

  test('recusa professor de outra unidade da mesma rede', async () => {
    const cenario = await cenarioCompleto();
    const [, outraUnidade] = cenario.unidades;
    const turmaDaOutraUnidade = await criarTurma({
      networkId: cenario.rede.id, schoolId: outraUnidade.id, academicYearId: cenario.anoLetivo.id,
    });
    const disciplina = await criarDisciplina({ networkId: cenario.rede.id });

    const resultado = await academics.assignTeacher({
      networkId: cenario.rede.id, classGroupId: turmaDaOutraUnidade.id,
      subjectId: disciplina.id, teacherUserId: cenario.professor.id,
    });

    expect(errosDe(resultado)[0]?.codigo).toBe('sem_papel_de_professor');
  });

  test('recusa professor de outra rede', async () => {
    const { a, b } = await duasRedes();
    const [, turmaVazia] = a.turmas;
    const disciplina = await criarDisciplina({ networkId: a.rede.id });

    const resultado = await academics.assignTeacher({
      networkId: a.rede.id, classGroupId: turmaVazia.id,
      subjectId: disciplina.id, teacherUserId: b.professor.id,
    });

    expect(errosDe(resultado)[0]?.codigo).toBe('sem_papel_de_professor');
  });

  test('recusa a mesma disciplina duas vezes na mesma turma', async () => {
    const cenario = await cenarioCompleto();
    const [turmaComDisciplinas] = cenario.turmas;
    const [portugues] = cenario.disciplinas;

    const resultado = await academics.assignTeacher({
      networkId: cenario.rede.id, classGroupId: turmaComDisciplinas.id,
      subjectId: portugues.id, teacherUserId: cenario.professor.id,
    });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'disciplinaId',
        codigo: 'disciplina_ja_alocada',
        mensagem: 'Esta disciplina já está alocada nesta turma.',
      },
    ]);
    expect(
      await academics.listClassGroupSubjects(cenario.rede.id, turmaComDisciplinas.id),
    ).toHaveLength(3);
  });

  test('a mesma disciplina pode ser alocada em outra turma', async () => {
    const cenario = await cenarioCompleto();
    const [, turmaVazia] = cenario.turmas;
    const [portugues] = cenario.disciplinas;

    const resultado = await academics.assignTeacher({
      networkId: cenario.rede.id, classGroupId: turmaVazia.id,
      subjectId: portugues.id, teacherUserId: cenario.professor.id,
    });

    expect(resultado.ok).toBe(true);
  });

  test('recusa turma de outra rede', async () => {
    const { a, b } = await duasRedes();
    const disciplina = await criarDisciplina({ networkId: a.rede.id });

    const resultado = await academics.assignTeacher({
      networkId: a.rede.id, classGroupId: b.turmas[1].id,
      subjectId: disciplina.id, teacherUserId: a.professor.id,
    });

    expect(errosDe(resultado)[0]?.codigo).toBe('turma_nao_encontrada');
  });

  test('recusa disciplina de outra rede', async () => {
    const { a, b } = await duasRedes();

    const resultado = await academics.assignTeacher({
      networkId: a.rede.id, classGroupId: a.turmas[1].id,
      subjectId: b.disciplinas[0].id, teacherUserId: a.professor.id,
    });

    expect(errosDe(resultado)[0]?.codigo).toBe('disciplina_nao_encontrada');
  });

  test('recusa ids fora do formato antes de tocar no banco', async () => {
    const cenario = await cenarioCompleto();

    const resultado = await academics.assignTeacher({
      networkId: cenario.rede.id, classGroupId: 'nao-e-uuid',
      subjectId: 'tambem-nao', teacherUserId: cenario.professor.id,
    });

    expect(errosDe(resultado).map((erro) => erro.campo)).toEqual(['turmaId', 'disciplinaId']);
  });
});

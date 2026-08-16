/*
 * A rede de proteção do refactor: o HTML de toda tela renderizada hoje, congelado em arquivo.
 *
 * Um refactor puro promete que nada muda para quem usa o sistema. Teste de unidade não cobra essa
 * promessa — ele olha um pedaço de cada vez, e o que quebra em uma reorganização de rotas é
 * justamente a costura: um `href` que passou a apontar para outro lugar, um rótulo que sumiu do
 * layout, um `redirect` que trocou de destino. O golden compara o documento inteiro, byte a byte,
 * contra o que o sistema respondia antes.
 *
 * Três decisões governam o arquivo:
 *
 * 1. UM cenário, montado à mão e nomeado. As fábricas numeram nomes com um contador de processo
 *    (`Aluno de Teste 47`), e esse número depende de quantos testes rodaram antes — o que faria o
 *    golden passar sozinho e falhar na suíte inteira. Aqui todo nome, e-mail, CPF e data é
 *    escrito, e o cenário é o mesmo em qualquer ordem de execução.
 *
 * 2. Normalização por dicionário, e não por vassoura. Os identificadores do cenário viram
 *    marcadores COM NOME — `{{aluno01}}`, `{{turma1}}` —, então trocar o `href` de um aluno pelo de
 *    outro continua sendo uma diferença visível. Só o que não tem como ser previsto (a chave de
 *    idempotência, o hash do CSS, o carimbo de tempo do banco) vira marcador anônimo.
 *
 * 3. O documento congelado inclui status e cabeçalhos de resposta. Metade das rotas de entrada não
 *    tem corpo: `/` e `/dashboard` são redirecionamentos, e o destino deles é exatamente o que um
 *    refactor de rotas pode trocar sem que nenhum HTML mude.
 */

import { join } from 'node:path';
import { app } from '../../src/web/app';
import { generateCpf } from '../../src/shared/document';
import { testSql } from '../support/database';
import {
  DEFAULT_PASSWORD,
  createStudent,
  createAcademicYear,
  createAnnouncement,
  createSubject,
  createAttendance,
  createEnrollment,
  createGrade,
  createNetwork,
  createGuardian,
  createClassGroup,
  createClassGroupSubject,
  createSchool,
  createUser,
  linkStudentGuardian,
  type TestStudent,
  type TestEnrollment,
  type TestGuardian,
} from '../support/factories';
import { signIn } from './support';

export const GOLDEN_DIR = join(import.meta.dir, 'golden');

/**
 * Papéis que abrem as telas. `anonimo` é a ausência de sessão, e também é uma tela; `semPapel` é a
 * conta que existe e ainda não foi ligada a unidade nenhuma, que é a única porta para a tela
 * "Conta sem papel atribuído" de `/dashboard`.
 */
export type GoldenRole =
  | 'anonimo'
  | 'semPapel'
  | 'admin'
  | 'secretaria'
  | 'professor'
  | 'responsavel';

export type GoldenScreen = {
  /** Nome do arquivo em `tests/web/golden/`, sem extensão. */
  readonly name: string;
  readonly role: GoldenRole;
  readonly path: string;
};

/*
 * Cabeçalho aceito pelo middleware de correlação (I16): fixá-lo aqui torna a página de erro
 * determinística sem que a normalização precise apagar o código de ocorrência — se ele sumir da
 * tela, o golden acusa.
 */
const CORRELATION = 'golden-correlacao-fixa';

/** Um identificador que respeita o formato e não existe no banco: a porta do 404. */
const NONEXISTENT_ID = '00000000-0000-4000-8000-000000000000';

const CURRENT_YEAR = 2026;
const PREVIOUS_YEAR = 2025;
const STUDENT_COUNT = 12;
const ROLL_CALL_DAY_COUNT = 12;
const CLOSED_TERM = 1;

const twoDigits = (value: number): string => String(value).padStart(2, '0');

/* --- Cenário ---------------------------------------------------------------- */

export type GoldenScenario = {
  readonly cookies: Readonly<Record<GoldenRole, string>>;
  readonly markers: ReadonlyMap<string, string>;
  readonly ids: {
    readonly schoolA: string;
    readonly schoolB: string;
    readonly currentYear: string;
    readonly classGroup1: string;
    readonly classGroup2: string;
    readonly assignment1: string;
    readonly student1: string;
    readonly enrollment1: string;
    readonly announcement1: string;
    readonly nonexistent: string;
  };
};

/**
 * Monta a rede inteira do golden. Tudo é escrito à mão de propósito: dez linhas por tabela custam
 * menos do que descobrir, seis meses depois, que o golden só passa quando roda sozinho.
 *
 * O tamanho não é arbitrário — doze alunos, doze responsáveis e doze dias de chamada são dois a
 * mais do que a página (dez), e é isso que faz a barra de paginação aparecer em três telas
 * diferentes. Barra de paginação monta `href` a partir do caminho da requisição, e caminho é
 * exatamente o que o refactor de rotas mexe.
 */
export async function buildGoldenScenario(): Promise<GoldenScenario> {
  const network = await createNetwork({ name: 'Rede Modelo do Litoral', slug: 'rede-golden' });
  const networkId = network.id;

  const schoolA = await createSchool({ networkId, name: 'Escola Central', inepCode: '32001234' });
  const schoolB = await createSchool({ networkId, name: 'Escola do Bairro', inepCode: '32005678' });

  const currentYear = await createAcademicYear({ networkId, year: CURRENT_YEAR });
  const previousYear = await createAcademicYear({ networkId, year: PREVIOUS_YEAR });

  const admin = await createUser({
    networkId,
    name: 'Alice Diretora',
    email: 'alice@golden.test',
    cpf: generateCpf(9_100_001),
    password: DEFAULT_PASSWORD,
    roles: [
      { schoolId: schoolA.id, role: 'network_admin' },
      { schoolId: schoolB.id, role: 'network_admin' },
    ],
  });
  const registrar = await createUser({
    networkId,
    name: 'Bruno Secretário',
    email: 'bruno@golden.test',
    cpf: generateCpf(9_100_002),
    password: DEFAULT_PASSWORD,
    roles: [{ schoolId: schoolA.id, role: 'registrar' }],
  });
  const teacher = await createUser({
    networkId,
    name: 'Carla Professora',
    email: 'carla@golden.test',
    cpf: generateCpf(9_100_003),
    password: DEFAULT_PASSWORD,
    roles: [{ schoolId: schoolA.id, role: 'teacher' }],
  });

  const classGroup1 = await createClassGroup({
    networkId, schoolId: schoolA.id, academicYearId: currentYear.id,
    name: '6A', gradeLevel: '6º ano', shift: 'morning',
  });
  const classGroup2 = await createClassGroup({
    networkId, schoolId: schoolA.id, academicYearId: currentYear.id,
    name: '7B', gradeLevel: '7º ano', shift: 'afternoon',
  });

  const portuguese = await createSubject({ networkId, name: 'Língua Portuguesa' });
  const math = await createSubject({ networkId, name: 'Matemática' });
  const history = await createSubject({ networkId, name: 'História' });

  const assign = (subjectId: string): Promise<{ id: string }> =>
    createClassGroupSubject({
      networkId, classGroupId: classGroup1.id, subjectId, teacherUserId: teacher.id,
    });
  const assignment1 = await assign(portuguese.id);
  const assignment2 = await assign(math.id);
  const assignment3 = await assign(history.id);

  const students: TestStudent[] = [];
  const guardians: TestGuardian[] = [];
  const enrollments: TestEnrollment[] = [];
  for (let number = 1; number <= STUDENT_COUNT; number += 1) {
    const label = twoDigits(number);
    const student = await createStudent({
      networkId, name: `Aluno ${label} da Silva`, birthDate: `2014-${label}-08`,
    });
    const guardian = await createGuardian({
      networkId,
      name: `Responsável ${label} da Silva`,
      email: `responsavel${label}@golden.test`,
      cpf: generateCpf(9_200_000 + number),
      phone: `2799000${label}${label}`,
    });
    await linkStudentGuardian({
      networkId, studentId: student.id, guardianId: guardian.id,
      relationship: number % 2 === 0 ? 'pai' : 'mãe', financiallyResponsible: number === 1,
    });
    const enrollment = await createEnrollment({
      networkId, studentId: student.id, classGroupId: classGroup1.id,
      academicYearId: currentYear.id, enrollmentDate: `${CURRENT_YEAR}-02-05`,
    });
    students.push(student);
    guardians.push(guardian);
    enrollments.push(enrollment);
  }

  // Conta criada e ainda não atribuída: `/dashboard` não tem para onde mandá-la, e diz isso na tela.
  const roleless = await createUser({
    networkId,
    name: 'Eva Recém-Convidada',
    email: 'eva@golden.test',
    cpf: generateCpf(9_100_005),
    password: DEFAULT_PASSWORD,
    roles: [],
  });

  const guardian = await createUser({
    networkId,
    name: 'Responsável 01 da Silva',
    email: 'portal01@golden.test',
    cpf: generateCpf(9_100_004),
    password: DEFAULT_PASSWORD,
    guardianId: guardians[0]?.id ?? null,
    roles: [{ schoolId: schoolA.id, role: 'guardian' }],
  });

  // Notas de dois bimestres para o primeiro aluno (o boletim precisa de linha cheia) e do primeiro
  // bimestre para os quatro primeiros (a tela de notas precisa de coluna preenchida e vazia).
  const assignments = [assignment1, assignment2, assignment3];
  const GRADE_VALUES = [8.5, 7, 9.5];
  for (let index = 0; index < assignments.length; index += 1) {
    for (const term of [1, 2]) {
      await createGrade({
        networkId,
        enrollmentId: enrollments[0]?.id ?? '',
        classGroupSubjectId: assignments[index]?.id ?? '',
        postedBy: teacher.id,
        term,
        value: (GRADE_VALUES[index] ?? 0) - (term === 1 ? 0 : 1),
      });
    }
  }
  for (let index = 1; index < 4; index += 1) {
    await createGrade({
      networkId,
      enrollmentId: enrollments[index]?.id ?? '',
      classGroupSubjectId: assignment1.id,
      postedBy: teacher.id,
      term: 1,
      value: 6 + index,
    });
  }

  for (let day = 1; day <= ROLL_CALL_DAY_COUNT; day += 1) {
    const present = day % 5 !== 0;
    await createAttendance({
      networkId,
      enrollmentId: enrollments[0]?.id ?? '',
      attendanceDate: `${CURRENT_YEAR}-03-${twoDigits(day)}`,
      present,
      excuse: present ? null : 'Consulta médica com atestado.',
    });
  }

  /*
   * Meio-dia UTC de propósito: `formatarDataHora` imprime a hora local, e um carimbo à meia-noite
   * mudaria de dia conforme o fuso de quem roda a suíte. A hora em si é normalizada; o dia, não.
   */
  const announcement1 = await createAnnouncement({
    networkId, schoolId: schoolA.id, authorUserId: admin.id,
    title: 'Reunião de pais e mestres',
    body: 'A reunião do primeiro bimestre acontece no dia 20, às 19h, no auditório da unidade.',
    publishedAt: new Date('2026-03-10T12:00:00.000Z'),
    recipients: [
      { guardianId: guardians[0]?.id ?? '', readAt: new Date('2026-03-11T12:00:00.000Z') },
      { guardianId: guardians[1]?.id ?? '' },
      { guardianId: guardians[2]?.id ?? '' },
    ],
  });
  const announcement2 = await createAnnouncement({
    networkId, schoolId: schoolA.id, authorUserId: registrar.id,
    title: 'Feira de ciências',
    body: 'A feira de ciências ocupa o pátio na primeira semana de maio.',
    publishedAt: new Date('2026-04-05T12:00:00.000Z'),
    recipients: [
      { guardianId: guardians[0]?.id ?? '' },
      { guardianId: guardians[1]?.id ?? '', readAt: new Date('2026-04-06T12:00:00.000Z') },
    ],
  });
  const announcement3 = await createAnnouncement({
    networkId, schoolId: schoolB.id, authorUserId: admin.id,
    title: 'Rascunho ainda não publicado',
    body: 'Este comunicado não foi publicado e não aparece em mural nenhum.',
    publishedAt: null,
    recipients: [],
  });

  // O primeiro bimestre da turma fechado: é o estado que a tela de fechamento e o boletim mostram.
  const sql = testSql();
  await sql`
    INSERT INTO term_closing (id, network_id, class_group_id, term, closed_at, closed_by)
    VALUES (${crypto.randomUUID()}, ${networkId}, ${classGroup1.id}, ${CLOSED_TERM},
            ${new Date('2026-04-20T12:00:00.000Z')}, ${teacher.id})
  `;

  const signInWithCpf = (cpf: string): Promise<string> =>
    signIn({ networkSlug: network.slug, cpf, password: DEFAULT_PASSWORD });

  const cookies: Record<GoldenRole, string> = {
    anonimo: '',
    semPapel: await signInWithCpf(roleless.cpf),
    admin: await signInWithCpf(admin.cpf),
    secretaria: await signInWithCpf(registrar.cpf),
    professor: await signInWithCpf(teacher.cpf),
    responsavel: await signInWithCpf(guardian.cpf),
  };

  const markers = new Map<string, string>([
    [network.id, '{{rede}}'],
    [schoolA.id, '{{unidadeA}}'],
    [schoolB.id, '{{unidadeB}}'],
    [currentYear.id, '{{anoCorrente}}'],
    [previousYear.id, '{{anoAnterior}}'],
    [admin.id, '{{usuarioAdmin}}'],
    [registrar.id, '{{usuarioSecretaria}}'],
    [teacher.id, '{{usuarioProfessor}}'],
    [guardian.id, '{{usuarioResponsavel}}'],
    [roleless.id, '{{usuarioSemPapel}}'],
    [classGroup1.id, '{{turma1}}'],
    [classGroup2.id, '{{turma2}}'],
    [portuguese.id, '{{disciplinaPortugues}}'],
    [math.id, '{{disciplinaMatematica}}'],
    [history.id, '{{disciplinaHistoria}}'],
    [assignment1.id, '{{alocacao1}}'],
    [assignment2.id, '{{alocacao2}}'],
    [assignment3.id, '{{alocacao3}}'],
    [announcement1.id, '{{comunicado1}}'],
    [announcement2.id, '{{comunicado2}}'],
    [announcement3.id, '{{comunicado3}}'],
    [NONEXISTENT_ID, '{{idInexistente}}'],
  ]);
  for (let index = 0; index < STUDENT_COUNT; index += 1) {
    const label = twoDigits(index + 1);
    markers.set(students[index]?.id ?? '', `{{aluno${label}}}`);
    markers.set(guardians[index]?.id ?? '', `{{responsavel${label}}}`);
    markers.set(enrollments[index]?.id ?? '', `{{matricula${label}}}`);
  }

  return {
    cookies,
    markers,
    ids: {
      schoolA: schoolA.id,
      schoolB: schoolB.id,
      currentYear: currentYear.id,
      classGroup1: classGroup1.id,
      classGroup2: classGroup2.id,
      assignment1: assignment1.id,
      student1: students[0]?.id ?? '',
      enrollment1: enrollments[0]?.id ?? '',
      announcement1: announcement1.id,
      nonexistent: NONEXISTENT_ID,
    },
  };
}

/* --- As telas --------------------------------------------------------------- */

/**
 * Toda rota GET registrada em `src/web/app.ts`, `src/web/health.ts` e `src/web/routes/*.ts`, mais as
 * variações de estado que são telas diferentes com o mesmo caminho: a lista com e sem busca, o
 * formulário com e sem unidade escolhida, a página com e sem aviso de sucesso, a segunda página de
 * uma tabela paginada e o 404 de quem pede o registro de outra unidade.
 */
export function systemScreens(ids: GoldenScenario['ids']): readonly GoldenScreen[] {
  const signOutMessage = encodeURIComponent('Sessão encerrada.');

  return [
    /* Sem sessão ----------------------------------------------------------- */
    { name: 'anonimo-raiz', role: 'anonimo', path: '/' },
    { name: 'anonimo-login', role: 'anonimo', path: '/login' },
    { name: 'anonimo-login-apos-sair', role: 'anonimo', path: `/login?ok=${signOutMessage}` },
    { name: 'anonimo-painel', role: 'anonimo', path: '/dashboard' },
    { name: 'anonimo-secretaria', role: 'anonimo', path: '/registrar' },
    { name: 'anonimo-rota-inexistente', role: 'anonimo', path: '/nao-existe' },
    { name: 'anonimo-publico-inexistente', role: 'anonimo', path: '/public/nao-existe.css' },
    { name: 'anonimo-publico-nome-recusado', role: 'anonimo', path: '/public/..%2Fsegredo' },

    /* Conta sem papel atribuído -------------------------------------------- */
    { name: 'sem-papel-painel', role: 'semPapel', path: '/dashboard' },
    { name: 'sem-papel-raiz', role: 'semPapel', path: '/' },

    /* Saúde ---------------------------------------------------------------- */
    { name: 'saude-health', role: 'anonimo', path: '/health' },
    { name: 'saude-health-live', role: 'anonimo', path: '/health/live' },

    /* Administração da rede ------------------------------------------------ */
    { name: 'admin-raiz', role: 'admin', path: '/' },
    { name: 'admin-painel', role: 'admin', path: '/dashboard' },
    { name: 'admin-login-com-sessao', role: 'admin', path: '/login' },
    { name: 'admin-rede-painel', role: 'admin', path: '/network' },
    { name: 'admin-rede-unidades', role: 'admin', path: '/network/schools' },
    { name: 'admin-rede-unidades-criada', role: 'admin', path: '/network/schools?ok=school-created' },
    { name: 'admin-rede-unidade-nova', role: 'admin', path: '/network/schools/new' },
    { name: 'admin-rede-usuarios', role: 'admin', path: '/network/users' },
    { name: 'admin-rede-usuarios-convidado', role: 'admin', path: '/network/users?ok=user-invited' },
    { name: 'admin-rede-usuario-novo', role: 'admin', path: '/network/users/new' },
    { name: 'admin-rede-anos-letivos', role: 'admin', path: '/network/academic-years' },
    { name: 'admin-rede-anos-letivos-definido', role: 'admin', path: '/network/academic-years?ok=year-defined' },
    { name: 'admin-rede-ano-novo', role: 'admin', path: '/network/academic-years/new' },
    { name: 'admin-comunicados', role: 'admin', path: '/announcements' },
    { name: 'admin-comunicados-unidade', role: 'admin', path: `/announcements?schoolId=${ids.schoolA}` },
    { name: 'admin-comunicado-novo', role: 'admin', path: '/announcements/new' },
    { name: 'admin-comunicado-novo-unidade', role: 'admin', path: `/announcements/new?schoolId=${ids.schoolA}` },
    { name: 'admin-conta-senha', role: 'admin', path: '/account/password' },
    { name: 'admin-conta-senha-alterada', role: 'admin', path: '/account/password?ok=password-changed' },
    { name: 'admin-professor-proibido', role: 'admin', path: '/teacher' },

    /* Secretaria ------------------------------------------------------------ */
    { name: 'secretaria-painel-redirecionado', role: 'secretaria', path: '/dashboard' },
    { name: 'secretaria-painel', role: 'secretaria', path: '/registrar' },
    { name: 'secretaria-alunos-sem-busca', role: 'secretaria', path: '/registrar/students' },
    { name: 'secretaria-alunos-busca', role: 'secretaria', path: '/registrar/students?q=Silva' },
    { name: 'secretaria-alunos-busca-pagina-2', role: 'secretaria', path: '/registrar/students?q=Silva&p=2' },
    { name: 'secretaria-aluno-novo', role: 'secretaria', path: '/registrar/students/new' },
    { name: 'secretaria-aluno-ficha', role: 'secretaria', path: `/registrar/students/${ids.student1}` },
    { name: 'secretaria-aluno-inexistente', role: 'secretaria', path: `/registrar/students/${ids.nonexistent}` },
    { name: 'secretaria-aluno-responsavel-novo', role: 'secretaria', path: `/registrar/students/${ids.student1}/guardians/new` },
    { name: 'secretaria-aluno-matricular', role: 'secretaria', path: `/registrar/students/${ids.student1}/enroll` },
    { name: 'secretaria-matricula-transferir', role: 'secretaria', path: `/registrar/enrollments/${ids.enrollment1}/transfer` },
    { name: 'secretaria-responsaveis', role: 'secretaria', path: '/registrar/guardians' },
    { name: 'secretaria-responsaveis-pagina-2', role: 'secretaria', path: '/registrar/guardians?p=2' },
    { name: 'secretaria-responsavel-novo', role: 'secretaria', path: '/registrar/guardians/new' },
    { name: 'secretaria-turmas', role: 'secretaria', path: '/registrar/class-groups' },
    { name: 'secretaria-turmas-filtradas', role: 'secretaria', path: `/registrar/class-groups?school=${ids.schoolA}&year=${ids.currentYear}` },
    { name: 'secretaria-turma-nova', role: 'secretaria', path: '/registrar/class-groups/new' },
    { name: 'secretaria-turma-ficha', role: 'secretaria', path: `/registrar/class-groups/${ids.classGroup1}` },
    { name: 'secretaria-turma-ficha-pagina-2', role: 'secretaria', path: `/registrar/class-groups/${ids.classGroup1}?pEnrollments=2` },
    { name: 'secretaria-turma-disciplina-nova', role: 'secretaria', path: `/registrar/class-groups/${ids.classGroup1}/subjects/new` },
    { name: 'secretaria-disciplinas', role: 'secretaria', path: '/registrar/subjects' },
    { name: 'secretaria-disciplina-nova', role: 'secretaria', path: '/registrar/subjects/new' },
    { name: 'secretaria-comunicados', role: 'secretaria', path: '/announcements' },
    { name: 'secretaria-comunicado-novo', role: 'secretaria', path: '/announcements/new' },
    { name: 'secretaria-rota-inexistente', role: 'secretaria', path: '/nao-existe' },

    /* Professor ------------------------------------------------------------- */
    { name: 'professor-painel-redirecionado', role: 'professor', path: '/dashboard' },
    { name: 'professor-painel', role: 'professor', path: '/teacher' },
    { name: 'professor-notas', role: 'professor', path: `/teacher/subjects/${ids.assignment1}/grades` },
    { name: 'professor-notas-bimestre-2', role: 'professor', path: `/teacher/subjects/${ids.assignment1}/grades?term=2` },
    { name: 'professor-chamada-data-fixa', role: 'professor', path: `/teacher/class-groups/${ids.classGroup1}/roll-call?date=${CURRENT_YEAR}-03-05` },
    { name: 'professor-chamada-hoje', role: 'professor', path: `/teacher/class-groups/${ids.classGroup1}/roll-call` },
    { name: 'professor-fechamento', role: 'professor', path: `/teacher/class-groups/${ids.classGroup1}/closing` },
    { name: 'professor-turma-alheia', role: 'professor', path: `/teacher/class-groups/${ids.classGroup2}/closing` },
    { name: 'professor-conta-senha', role: 'professor', path: '/account/password' },

    /* Responsável ----------------------------------------------------------- */
    { name: 'responsavel-painel-redirecionado', role: 'responsavel', path: '/dashboard' },
    { name: 'responsavel-painel', role: 'responsavel', path: '/guardian' },
    { name: 'responsavel-boletim', role: 'responsavel', path: `/guardian/enrollments/${ids.enrollment1}/report-card` },
    { name: 'responsavel-frequencia', role: 'responsavel', path: `/guardian/enrollments/${ids.enrollment1}/attendance` },
    { name: 'responsavel-frequencia-pagina-2', role: 'responsavel', path: `/guardian/enrollments/${ids.enrollment1}/attendance?p=2` },
    { name: 'responsavel-mural', role: 'responsavel', path: '/guardian/board' },
    { name: 'responsavel-comunicado', role: 'responsavel', path: `/guardian/board/${ids.announcement1}` },
    { name: 'responsavel-comunicado-alheio', role: 'responsavel', path: `/guardian/board/${ids.nonexistent}` },
    { name: 'responsavel-conta-senha', role: 'responsavel', path: '/account/password' },
  ];
}

/* --- Normalização ----------------------------------------------------------- */

const UUID = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
/**
 * As duas grafias do campo convivem enquanto o repositório é convertido para inglês. Se a
 * regex ficasse só com a antiga, o campo renomeado deixaria de ser normalizado e os 57
 * fixtures que o carregam passariam a divergir a cada execução, com um UUID novo por vez.
 */
const IDEMPOTENCY_KEY_ATTR = /(name="_(?:chave|key)" value=")[^"]*(")/g;
/**
 * O nome publicado do CSS (I10) e o nome cru que `asset()` devolve quando ainda não houve
 * `bun run build:assets` viram o mesmo marcador. São a mesma linha da tela; congelar o hash faria
 * 71 arquivos mudarem a cada ajuste de folha de estilo, e um clone novo, sem manifesto, reprovaria
 * um refactor que não encostou em CSS nenhum.
 */
const VERSIONED_ASSET = /\/(?:publico|public)\/app\.(?:[0-9a-f]{6,}\.)?css/g;
/** `Tue Mar 10 2026 09:00:00 GMT-0300 (Brasilia Standard Time)` — o `toString` de um `Date`. */
const JAVASCRIPT_DATE =
  /[A-Z][a-z]{2} [A-Z][a-z]{2} \d{2} \d{4} \d{2}:\d{2}:\d{2} GMT[+-]\d{4}(?: \([^)]*\))?/g;
const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g;
const TIME_OF_DAY = /\b\d{2}:\d{2}\b/g;

/** Dois dias para cada lado cobrem o fuso local, o dia UTC e a virada da meia-noite no meio da suíte. */
const DAY_WINDOW = 2;
const MS_PER_DAY = 86_400_000;

/**
 * Os dias que dependem de quando a suíte roda: o `hoje()` da secretaria (dia UTC), o `hoje()` do
 * professor (dia local) e o dia anterior e o seguinte da tela de chamada. Todos viram o mesmo
 * marcador — a distinção entre eles fica congelada em `professor-chamada-data-fixa`, que passa a
 * data na query e por isso não depende de relógio nenhum.
 */
function currentDays(): string[] {
  const now = Date.now();
  const days = new Set<string>();
  for (let step = -DAY_WINDOW; step <= DAY_WINDOW; step += 1) {
    const date = new Date(now + step * MS_PER_DAY);
    days.add(`${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`);
    days.add(date.toISOString().slice(0, 10));
  }
  return [...days];
}

const inBrazilianFormat = (iso: string): string => {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
};

/**
 * Troca o que não pode ser previsto por marcadores estáveis, e nada além disso.
 *
 * A ordem importa: os carimbos de tempo inteiros saem antes das datas soltas, senão `2026-08-14` de
 * dentro de `2026-08-14T12:00:00Z` seria trocado primeiro e o resto do carimbo ficaria órfão. Os
 * identificadores conhecidos saem antes do varredor de UUID, senão todos virariam `{{uuid}}` e o
 * golden deixaria de distinguir o `href` de um aluno do `href` de outro.
 */
export function normalize(text: string, markers: ReadonlyMap<string, string>): string {
  let output = text;

  output = output.replace(IDEMPOTENCY_KEY_ATTR, '$1{{chave}}$2');
  output = output.replace(VERSIONED_ASSET, '/public/app.{{hashDoCss}}.css');
  output = output.replaceAll(CORRELATION, '{{correlacao}}');

  for (const [raw, marker] of markers) {
    if (raw !== '') output = output.replaceAll(raw, marker);
  }

  output = output.replace(JAVASCRIPT_DATE, '{{carimboDeTempo}}');
  output = output.replace(ISO_TIMESTAMP, '{{carimboDeTempo}}');

  for (const day of currentDays()) {
    output = output.replaceAll(day, '{{diaCorrente}}');
    output = output.replaceAll(inBrazilianFormat(day), '{{diaCorrente}}');
  }

  output = output.replace(TIME_OF_DAY, '{{hora}}');
  output = output.replace(UUID, '{{uuid}}');

  return output;
}

/* --- Captura ---------------------------------------------------------------- */

/** O que entra no arquivo golden além do corpo: o que um refactor de rotas pode trocar sozinho. */
const FROZEN_HEADERS = ['Location', 'Content-Type', 'Cache-Control', 'Vary'] as const;

const SEPARATOR = '-'.repeat(78);

export async function capture(screen: GoldenScreen, scenario: GoldenScenario): Promise<string> {
  const cookie = scenario.cookies[screen.role];
  const headers: Record<string, string> = { 'X-Correlation-Id': CORRELATION };
  if (cookie !== '') headers['Cookie'] = cookie;

  const response = await app.request(screen.path, { headers });
  const body = await response.text();

  const rows = [`GET ${screen.path}`, `papel: ${screen.role}`, `status: ${response.status}`];
  for (const name of FROZEN_HEADERS) {
    const value = response.headers.get(name);
    if (value !== null) rows.push(`${name}: ${value}`);
  }
  rows.push(SEPARATOR, body);

  return normalize(rows.join('\n'), scenario.markers);
}

export const goldenPath = (name: string): string => join(GOLDEN_DIR, `${name}.txt`);

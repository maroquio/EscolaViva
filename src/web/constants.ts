import { ACADEMIC_FIELDS } from '../academics';
import { ASSESSMENT_FIELDS, TERM_LABEL } from '../assessment';
import { COMMUNICATION_FIELDS } from '../communication';
import { IDENTITY_FIELDS, ROLE } from '../identity';
import { ASSETS, ENTRY_PATHS, HEALTH_PATHS, MISSING_VALUE } from '../shared/constants';
import { group } from './routes/routeMap';

export { ASSETS, ERROR_TITLES, MISSING_VALUE } from '../shared/constants';

export const PUBLIC_PREFIX = ASSETS.urlPrefix;

export const ASSET_WILDCARD = '*';

export const ROUTES = {
  public: group('', {
    root: '/',
    login: ENTRY_PATHS.login,
    logout: '/logout',
    dashboard: ENTRY_PATHS.dashboard,
    readiness: HEALTH_PATHS.readiness,
    liveness: HEALTH_PATHS.liveness,
    assets: `${PUBLIC_PREFIX}${ASSET_WILDCARD}`,
  }),

  account: group('/conta', {
    password: '/senha',
  }),

  network: group('/rede', {
    dashboard: '/',
    schools: '/unidades',
    schoolNew: '/unidades/nova',
    users: '/usuarios',
    userNew: '/usuarios/novo',
    academicYears: '/anos-letivos',
    academicYearNew: '/anos-letivos/novo',
  }),

  registrar: group('/secretaria', {
    dashboard: '/',
    students: '/alunos',
    studentNew: '/alunos/novo',
    student: '/alunos/:id',
    studentGuardianNew: '/alunos/:id/responsaveis/novo',
    studentGuardians: '/alunos/:id/responsaveis',
    studentEnroll: '/alunos/:id/matricular',
    enrollments: '/matriculas',
    enrollmentTransfer: '/matriculas/:id/transferir',
    guardians: '/responsaveis',
    guardianNew: '/responsaveis/novo',
    classGroups: '/turmas',
    classGroupNew: '/turmas/nova',
    classGroup: '/turmas/:id',
    classGroupSubjectNew: '/turmas/:id/disciplinas/nova',
    classGroupSubjects: '/turmas/:id/disciplinas',
    subjects: '/disciplinas',
    subjectNew: '/disciplinas/nova',
  }),

  teacher: group('/professor', {
    dashboard: '/',
    grades: '/disciplinas/:turmaDisciplinaId/notas',
    rollCall: '/turmas/:turmaId/chamada',
    closing: '/turmas/:turmaId/fechamento',
  }),

  guardian: group('/responsavel', {
    dashboard: '/',
    reportCard: '/matriculas/:id/boletim',
    attendance: '/matriculas/:id/frequencia',
    board: '/mural',
    announcement: '/mural/:comunicadoId',
    announcementRead: '/mural/:comunicadoId/lido',
  }),

  announcements: group('/comunicados', {
    list: '/',
    new: '/novo',
  }),
} as const;

export const WRITE_GROUPS = [
  ROUTES.account.prefix,
  ROUTES.network.prefix,
  ROUTES.registrar.prefix,
  ROUTES.teacher.prefix,
  ROUTES.guardian.prefix,
  ROUTES.announcements.prefix,
] as const;

export const wildcardOf = (prefix: string): string => `${prefix}/*`;

export const DASHBOARD_BY_ROLE = [
  { role: ROLE.networkAdmin, target: ROUTES.network.dashboard() },
  { role: ROLE.registrar, target: ROUTES.registrar.dashboard() },
  { role: ROLE.teacher, target: ROUTES.teacher.dashboard() },
  { role: ROLE.guardian, target: ROUTES.guardian.dashboard() },
] as const;

export const TEMPLATES = {
  layout: '/_layout',
  publicLayout: '/_layout_public',
  error: '/error',
  login: '/login',

  partials: {
    icon: '/partials/_icon',
    header: '/partials/_header',
    navigation: '/partials/_navigation',
    messages: '/partials/_messages',
    noticesScript: '/partials/_notices_script',
    pagination: '/partials/_pagination',
    empty: '/partials/_empty',
  },

  account: { password: '/account/password' },

  network: {
    dashboard: '/network/dashboard',
    schools: '/network/schools',
    schoolNew: '/network/school_new',
    users: '/network/users',
    userNew: '/network/user_new',
    years: '/network/years',
    yearNew: '/network/year_new',
  },

  registrar: {
    dashboard: '/registrar/dashboard',
    students: '/registrar/students',
    studentNew: '/registrar/student_new',
    student: '/registrar/student',
    studentGuardianNew: '/registrar/student_guardian_new',
    studentEnrollmentNew: '/registrar/student_enrollment_new',
    enrollmentTransfer: '/registrar/enrollment_transfer',
    guardians: '/registrar/guardians',
    guardianNew: '/registrar/guardian_new',
    classGroups: '/registrar/class_groups',
    classGroupNew: '/registrar/class_group_new',
    classGroup: '/registrar/class_group',
    classGroupSubjectNew: '/registrar/class_group_subject_new',
    subjects: '/registrar/subjects',
    subjectNew: '/registrar/subject_new',
  },

  teacher: {
    dashboard: '/teacher/dashboard',
    grades: '/teacher/grades',
    rollCall: '/teacher/roll_call',
    closing: '/teacher/closing',
  },

  guardian: {
    dashboard: '/guardian/dashboard',
    reportCard: '/guardian/report_card',
    attendance: '/guardian/attendance',
    board: '/guardian/board',
    announcement: '/guardian/announcement',
  },

  announcements: { list: '/announcements/list', new: '/announcements/new' },

  directory: 'templates',
} as const;

export const PARAMS = {
  defaultPage: 'p',
  guardiansPage: 'pResponsaveis',
  enrollmentsPage: 'pMatriculas',
  subjectsPage: 'pDisciplinas',
  unreadPage: 'pNaoLidos',
  readPage: 'pLidos',
  search: 'q',
  school: 'unidade',
  year: 'ano',
  schoolId: 'unidadeId',
  term: 'bimestre',
  date: 'data',
  ok: 'ok',
  error: 'erro',
} as const;

export const FIELDS = {
  login: {
    networkSlug: IDENTITY_FIELDS.login.networkSlug,
    cpf: IDENTITY_FIELDS.login.cpf,
    password: IDENTITY_FIELDS.login.password,
  },
  password: {
    current: IDENTITY_FIELDS.password.current,
    new: IDENTITY_FIELDS.password.new,
    confirmation: IDENTITY_FIELDS.password.confirmation,
  },
  student: {
    name: ACADEMIC_FIELDS.student.name,
    birthDate: ACADEMIC_FIELDS.student.birthDate,
  },
  guardian: {
    name: ACADEMIC_FIELDS.guardian.name,
    email: ACADEMIC_FIELDS.guardian.email,
    phone: ACADEMIC_FIELDS.guardian.phone,
    cpf: ACADEMIC_FIELDS.guardian.cpf,
  },
  guardianLink: {
    studentId: ACADEMIC_FIELDS.guardianLink.studentId,
    guardianId: ACADEMIC_FIELDS.guardianLink.guardianId,
    relationship: ACADEMIC_FIELDS.guardianLink.relationship,
    financiallyResponsible: ACADEMIC_FIELDS.guardianLink.financiallyResponsible,
  },
  enrollment: {
    studentId: ACADEMIC_FIELDS.enrollment.studentId,
    classGroupId: ACADEMIC_FIELDS.enrollment.classGroupId,
    academicYearId: ACADEMIC_FIELDS.enrollment.academicYearId,
    enrollmentDate: ACADEMIC_FIELDS.enrollment.enrollmentDate,
  },
  transfer: {
    enrollmentId: ACADEMIC_FIELDS.transfer.enrollmentId,
    targetClassGroupId: ACADEMIC_FIELDS.transfer.targetClassGroupId,
    date: ACADEMIC_FIELDS.transfer.date,
  },
  classGroup: {
    name: ACADEMIC_FIELDS.classGroup.name,
    gradeLevel: ACADEMIC_FIELDS.classGroup.gradeLevel,
    shift: ACADEMIC_FIELDS.classGroup.shift,
    schoolId: ACADEMIC_FIELDS.classGroup.schoolId,
    academicYearId: ACADEMIC_FIELDS.classGroup.academicYearId,
  },
  subject: { name: ACADEMIC_FIELDS.subject.name },
  teachingAssignment: {
    classGroupId: ACADEMIC_FIELDS.teachingAssignment.classGroupId,
    subjectId: ACADEMIC_FIELDS.teachingAssignment.subjectId,
    teacherUserId: ACADEMIC_FIELDS.teachingAssignment.teacherUserId,
  },
  school: { name: IDENTITY_FIELDS.school.name, inepCode: IDENTITY_FIELDS.school.inepCode },
  user: {
    name: IDENTITY_FIELDS.user.name,
    email: IDENTITY_FIELDS.user.email,
    cpf: IDENTITY_FIELDS.user.cpf,
    roleAssignments: IDENTITY_FIELDS.user.roleAssignments,
    guardianId: IDENTITY_FIELDS.user.guardianId,
    schools: 'unidade[]',
    roles: 'papel[]',
  },
  academicYear: {
    year: ACADEMIC_FIELDS.academicYear.year,
    startDate: ACADEMIC_FIELDS.academicYear.startDate,
    endDate: ACADEMIC_FIELDS.academicYear.endDate,
  },
  announcement: {
    title: COMMUNICATION_FIELDS.title,
    body: COMMUNICATION_FIELDS.body,
    schoolId: COMMUNICATION_FIELDS.schoolId,
    authorUserId: COMMUNICATION_FIELDS.authorUserId,
    recipients: COMMUNICATION_FIELDS.recipients,
    audience: COMMUNICATION_FIELDS.audience,
    guardians: 'responsaveis[]',
  },
  journal: { grade: 'nota_', present: 'presenca_', excuse: 'justificativa_' },
  term: ASSESSMENT_FIELDS.term,
  date: ASSESSMENT_FIELDS.date,
  grades: ASSESSMENT_FIELDS.grades,
} as const;

export const CHECKED_VALUE = 'sim';

export const INITIAL_VALUES = {
  login: { networkSlug: '', cpf: '' },
  student: { name: '', birthDate: '' },
  guardian: { name: '', email: '', phone: '', cpf: '' },
  classGroup: { name: '', gradeLevel: '', shift: '', schoolId: '', academicYearId: '' },
  subject: { name: '' },
  school: { name: '', inepCode: '' },
  user: { name: '', email: '', cpf: '', guardianId: '' },
  academicYear: { year: '', startDate: '', endDate: '' },
} as const;

export const TITLES = {
  product: 'EscolaViva',
  login: 'Entrar',
  changePassword: 'Trocar senha',

  network: {
    dashboard: 'Painel da rede',
    schools: 'Unidades',
    schoolNew: 'Criar unidade',
    users: 'Usuários',
    userNew: 'Convidar usuário',
    years: 'Anos letivos',
    yearNew: 'Definir ano letivo',
  },
  registrar: {
    dashboard: 'Painel da secretaria',
    students: 'Alunos',
    studentNew: 'Cadastrar aluno',
    student: 'Ficha do aluno',
    linkGuardian: 'Vincular responsável',
    enroll: 'Matricular em uma turma',
    transfer: 'Transferir de turma',
    guardians: 'Responsáveis',
    guardianNew: 'Cadastrar responsável',
    classGroups: 'Turmas',
    classGroupNew: 'Cadastrar turma',
    classGroup: (name: string): string => `Turma ${name}`,
    assign: 'Alocar disciplina e professor',
    subjects: 'Disciplinas',
    subjectNew: 'Cadastrar disciplina',
  },
  teacher: {
    dashboard: 'Minhas turmas',
    grades: (subject: string, classGroup: string): string => `${subject} · ${classGroup}`,
    rollCall: (classGroup: string): string => `Chamada · ${classGroup}`,
    closing: (classGroup: string): string => `Fechamento · ${classGroup}`,
  },
  guardian: {
    dashboard: 'Meus alunos',
    reportCard: (student: string): string => `Boletim de ${student}`,
    attendance: (student: string): string => `Frequência de ${student}`,
    board: 'Mural de comunicados',
  },
  announcements: { list: 'Comunicados', new: 'Novo comunicado' },
} as const;

export const AREAS = {
  network: 'Rede',
  registrar: 'Secretaria',
  teaching: 'Ensino',
  monitoring: 'Acompanhamento',
  communication: 'Comunicação',
  account: 'Conta',
} as const;

export const LABELS = {
  student: 'Aluno',
  classGroup: 'Turma',
  school: 'Unidade',
  subject: 'Disciplina',
  guardian: 'Responsável',
  year: 'Ano',
  academicYear: 'Ano letivo',
  enrollment: 'Matrícula',
  activeEnrollments: 'Matrículas ativas',
  name: 'Nome',
  cpf: 'CPF',
  email: 'E-mail',
  start: 'Início',
  end: 'Término',
  attendance: 'Frequência',
  recipients: 'Destinatários',
  actions: 'Ações',
} as const;

export const NOUNS = {
  student: { singular: 'aluno', plural: 'alunos' },
  classGroup: { singular: 'turma', plural: 'turmas' },
  school: { singular: 'unidade', plural: 'unidades' },
  subject: { singular: 'disciplina', plural: 'disciplinas' },
  guardian: { singular: 'responsável', plural: 'responsáveis' },
  enrollment: { singular: 'matrícula', plural: 'matrículas' },
  announcement: { singular: 'comunicado', plural: 'comunicados' },
  user: { singular: 'usuário', plural: 'usuários' },
  academicYear: { singular: 'ano letivo', plural: 'anos letivos' },
} as const;

export type CountableNoun = { readonly singular: string; readonly plural: string };

export const ACTIONS = {
  cancel: 'Cancelar',
  searchStudent: 'Buscar aluno',
  backTo: {
    dashboard: 'Voltar ao painel',
    search: 'Voltar à busca',
    record: 'Voltar à ficha',
    students: 'Voltar aos alunos',
    classGroup: 'Voltar à turma',
    classGroups: 'Voltar às turmas',
    board: 'Voltar ao mural',
    announcements: 'Voltar aos comunicados',
  },
} as const;

export const NO_ENROLLED_STUDENT = 'Nenhum aluno matriculado';

export const NOTICES = {
  sessionEnded: 'Sessão encerrada.',
  passwordChanged: 'Senha alterada. Use a senha nova no próximo acesso.',
  studentRegistered: 'Aluno cadastrado.',
  guardianLinked: 'Responsável vinculado.',
  enrollmentRecorded: 'Matrícula registrada.',
  transferCompleted: 'Transferência concluída.',
  guardianRegistered: 'Responsável cadastrado.',
  classGroupRegistered: 'Turma cadastrada.',
  subjectAssigned: 'Disciplina alocada.',
  subjectRegistered: 'Disciplina cadastrada.',
  schoolCreated: 'Unidade criada.',
  userInvited: 'Usuário criado. A senha provisória está logo abaixo.',
  yearDefined: 'Ano letivo definido.',
  announcementPublished: 'Comunicado publicado. A taxa de leitura começa a contar agora.',
  announcementRead: 'Comunicado marcado como lido.',
  readNotRecorded: 'Não foi possível registrar a leitura.',
  noGrades: 'Lançamento salvo: nenhuma nota preenchida.',
  oneGrade: '1 nota gravada.',
  manyGrades: (total: number): string => `${total} notas gravadas.`,
  rollCallRecorded: (date: string): string => `Chamada de ${date} registrada.`,
  termClosed: (term: number, classGroup: string): string =>
    `${TERM_LABEL(term)} fechado para a turma ${classGroup}.`,
} as const;

export const NOTICE_CODES = {
  passwordChanged: 'senha-alterada',
  schoolCreated: 'unidade-criada',
  userInvited: 'usuario-convidado',
  yearDefined: 'ano-definido',
} as const;

export const FOUR_DIGIT_YEAR = /^\d{4}$/;

export const FORM_ERRORS = {
  confirmationMismatch: {
    campo: FIELDS.password.confirmation,
    codigo: 'confirmacao_diferente',
    mensagem: 'A confirmação não confere com a senha nova.',
  },
  invalidYear: {
    campo: FIELDS.academicYear.year,
    codigo: 'ano_invalido',
    mensagem: 'Informe o ano com quatro dígitos.',
  },
  incompleteRoleAssignment: {
    campo: FIELDS.user.roleAssignments,
    codigo: 'atribuicao_incompleta',
    mensagem: 'Cada atribuição precisa de uma unidade e de um papel.',
  },
  invalidGrade: {
    campo: FIELDS.grades,
    codigo: 'nota_invalida',
  },
  noSelection: {
    campo: FIELDS.announcement.recipients,
    codigo: 'sem_selecao',
  },
  recipientOutsideSchool: {
    campo: FIELDS.announcement.recipients,
    codigo: 'destinatario_fora_da_unidade',
    mensagem: 'Um dos responsáveis marcados não pertence à unidade escolhida.',
  },
  missingSchool: {
    campo: FIELDS.announcement.schoolId,
    codigo: 'unidade_ausente',
    mensagem: 'Escolha a unidade que vai enviar o comunicado.',
  },
} as const;

export const GRADE_OUT_OF_RANGE = (minimum: number, maximum: number): string =>
  `Use um número de ${minimum} a ${maximum}.`;

export const GRADE_OUT_OF_RANGE_SUMMARY = (minimum: number, maximum: number): string =>
  `Confira os campos destacados: há nota fora do intervalo de ${minimum} a ${maximum}.`;

export const NO_SELECTION_ON_SEND =
  'Marque ao menos um responsável ou escolha enviar para toda a unidade.';

export const ERROR_DETAILS = {
  400: 'O formulário chegou incompleto ou com um campo que o sistema não reconhece. Volte, confira os dados e envie de novo.',
  401: 'A sessão terminou ou ainda não foi aberta. Entre novamente para continuar de onde parou.',
  403: 'Sua conta não tem permissão para esta tela. Se você deveria ter, peça ao administrador da rede.',
  404: 'O endereço não existe, ou o registro pertence a outra rede. Use o menu para voltar a uma tela conhecida.',
  422: 'Os dados estão consistentes, mas a situação atual não permite concluir esta operação.',
  500: 'Algo falhou do nosso lado. A ocorrência foi registrada com o código abaixo.',
} as const;

export const ERROR_PAGES = {
  accountWithoutRole: {
    title: 'Conta sem papel atribuído',
    detail:
      'Seu acesso existe, mas ainda não foi ligado a nenhuma unidade. Peça ao administrador da rede para atribuir um papel.',
  },
  invalidAssetName: {
    title: 'Arquivo não encontrado',
    detail: 'Este endereço não corresponde a nenhum arquivo publicado.',
  },
  missingAsset: {
    title: 'Arquivo não encontrado',
    detail: 'O arquivo pedido não faz parte desta versão do sistema.',
  },
  recordOutOfScope: {
    title: 'Registro não encontrado',
    detail:
      'O endereço não existe, ou o registro pertence a outra unidade. Use o menu para voltar a uma tela conhecida.',
  },
} as const;

export const UNEXPECTED_ERROR_TEXT = 'Erro inesperado';

export const DIAGNOSTICS = {
  termOnPosting: 'bimestre fora do conjunto no lançamento',
  termOnClosing: 'bimestre fora do conjunto no fechamento',
  malformedRollCallDate: 'data de chamada malformada',
  subjectOutsideSchedule: 'disciplina fora do quadro do professor',
  classGroupOutsideSchedule: 'turma fora do quadro do professor',
  accountWithoutGuardian: 'conta sem responsável vinculado',
  enrollmentOutsideResponsibility: 'matrícula fora da responsabilidade',
  enrollmentWithoutReportCard: 'matrícula sem boletim',
  enrollmentWithoutAttendance: 'matrícula sem apuração de frequência',
  announcementOutsideBoard: 'comunicado fora do mural do responsável',
  schoolOutOfScope: 'unidade fora do alcance do usuário',
} as const;

export const LOG_EVENTS = {
  signInAttempt: 'tentativa de entrada',
  rejected: 'recusado',
  success: 'sucesso',
  passwordChanged: 'senha alterada pelo próprio usuário',
  schoolCreated: 'unidade criada',
  userInvited: 'usuário convidado',
  academicYearDefined: 'ano letivo definido',
} as const;

export const PRESENTATION = {
  titleSuffix: ' · EscolaViva',
  brand: 'Escola<em>Viva</em>',
  publicSubtitle: 'Portal da rede escolar',
  publicFooter: 'Sistema de uso restrito. O acesso é registrado.',
  separator: ' · ',
  shiftSeparator: ' · turno ',
  percentSuffix: ' %',
  decimalSeparator: ',',
  oneDecimalFactor: 10,
  percentFactor: 100,
  messageLimit: 160,
  emptyOption: 'Selecione…',
  twoDigitWidth: 2,
  digitPad: '0',
} as const;

const TAG = {
  active: 'etiqueta--ativa',
  transferred: 'etiqueta--transferida',
  cancelled: 'etiqueta--cancelada',
  completed: 'etiqueta--concluida',
  passed: 'etiqueta--aprovado',
  failed: 'etiqueta--reprovado',
  inProgress: 'etiqueta--em-curso',
  noModifier: '',
} as const;

export const TAG_CLASS = {
  enrollmentStatus: {
    active: TAG.active,
    transferred: TAG.transferred,
    cancelled: TAG.cancelled,
    completed: TAG.completed,
  },
  guardianEnrollment: {
    active: TAG.active,
    transferred: TAG.transferred,
    cancelled: TAG.noModifier,
    completed: TAG.noModifier,
  },
  finalStatus: {
    passed: TAG.passed,
    failed: TAG.failed,
    in_progress: TAG.inProgress,
  },
  attendance: {
    present: TAG.active,
    excusedAbsence: TAG.transferred,
    absence: TAG.failed,
  },
  closing: { closed: TAG.passed, open: TAG.inProgress },
} as const;

export const ID_SUFFIXES = { help: '-ajuda', error: '-erro' } as const;

export const ID_PREFIXES = { cellError: 'erro-', pending: 'pendencia-' } as const;

export const PAGINATION = {
  window: 7,
} as const;

export const ROLE_ASSIGNMENT_ROWS = 3;

export const ASSET_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,127})$/;

export const ASSET_TYPES: Record<string, string> = {
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  woff2: 'font/woff2',
};

export const DEFAULT_ASSET_TYPE = 'application/octet-stream';

export const HEALTH_NO_CACHE = 'no-store';

export const HEALTH_BODY = {
  ok: { status: 'ok', banco: 'ok' },
  degraded: { status: 'degradado', banco: 'indisponivel' },
  alive: { status: 'ok' },
} as const;

export const INVITE_COOKIE = {
  name: 'ev_convite',
  maxAgeInSeconds: 120,
  separator: ':',
  sameSite: 'Lax',
} as const;

export const DOCUMENT = {
  language: 'pt-BR',
  colorScheme: 'light',
  robots: 'noindex, nofollow',
  contentId: 'conteudo',
} as const;

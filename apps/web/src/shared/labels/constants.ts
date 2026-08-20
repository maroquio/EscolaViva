import type { EnrollmentStatus, Shift } from '@escolaviva/contracts/enumerations';
import { ABSENCE_COLOUR, AGREEMENT_COLOUR } from '../ui/constants';

export const NAME_LABEL = 'Nome';
export const CPF_LABEL = 'CPF';
export const EMAIL_LABEL = 'E-mail';
export const PHONE_LABEL = 'Telefone';

export const NETWORK_LABEL = 'Rede';
export const SCHOOL_LABEL = 'Escola';
export const SCHOOLS_LABEL = 'Escolas';
export const UNIT_LABEL = 'Unidade';
export const USERS_LABEL = 'Usuários';
export const GUARDIANS_LABEL = 'Responsáveis';

export const CLASS_GROUPS_LABEL = 'Turmas';
export const MY_CLASS_GROUPS_LABEL = 'Minhas turmas';
export const SUBJECT_LABEL = 'Disciplina';
export const SUBJECTS_LABEL = 'Disciplinas';
export const ACADEMIC_YEAR_LABEL = 'Ano letivo';
export const ACADEMIC_YEARS_LABEL = 'Anos letivos';
export const GRADE_LEVEL_LABEL = 'Série';
export const SHIFT_LABEL = 'Turno';
export const START_LABEL = 'Início';
export const END_LABEL = 'Término';
export const SITUATION_LABEL = 'Situação';

export const ENROLLED_LABEL = 'Matriculados';
export const ENROLMENTS_COUNTED = 'matrículas';
export const SUBJECTS_COUNTED = 'disciplinas';

export const ANNOUNCEMENTS_AREA = 'Comunicação';
export const ANNOUNCEMENT_LABEL = 'Comunicado';
export const ANNOUNCEMENTS_LABEL = 'Comunicados';

export const REGISTRAR_DASHBOARD_LABEL = 'Painel da secretaria';

export const CLASS_GROUP_NOT_FOUND = 'Turma não encontrada';
export const NO_STUDENT_ENROLLED = 'Nenhum aluno matriculado';

export const STATUS_LABELS: Record<EnrollmentStatus, string> = {
  active: 'Ativa',
  transferred: 'Transferida',
  cancelled: 'Cancelada',
  completed: 'Concluída',
};

export const STATUS_COLOURS: Record<EnrollmentStatus, string> = {
  active: AGREEMENT_COLOUR,
  transferred: ABSENCE_COLOUR,
  cancelled: ABSENCE_COLOUR,
  completed: ABSENCE_COLOUR,
};

export const SHIFT_LABELS: Record<Shift, string> = {
  morning: 'Matutino',
  afternoon: 'Vespertino',
  evening: 'Noturno',
  full_time: 'Integral',
};

export const CHOOSE = {
  school: 'Escolha a escola',
  unit: 'Escolha a unidade',
  classGroup: 'Escolha a turma',
  targetClassGroup: 'Escolha a turma de destino',
  academicYear: 'Escolha o ano letivo',
  guardian: 'Escolha o responsável',
  subject: 'Escolha a disciplina',
  teacher: 'Escolha o professor',
} as const;

export const STUDENT_LABEL = 'Aluno';
export const STUDENTS_LABEL = 'Alunos';
export const CLASS_GROUP_LABEL = 'Turma';
export const YEAR_LABEL = 'Ano';
export const TEACHER_LABEL = 'Professor';

export const ATTENDANCE_LABEL = 'Frequência';
export const PRESENT_LABEL = 'Presente';
export const EXCUSE_LABEL = 'Justificativa';

export const CHANGE_PASSWORD_LABEL = 'Trocar senha';

export const TEMPORARY_PASSWORD_WARNING =
  'Anote agora: esta senha aparece uma única vez e não pode ser recuperada depois que você sair desta página.';
export const CHANGE_PASSWORD_ON_FIRST_ACCESS = 'e troque a senha no primeiro acesso.';
export const temporaryPasswordOf = (name: string): string => `Senha provisória de ${name}`;

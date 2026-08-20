import { REGISTRAR_ROUTES } from '../../../constants';

export const STUDENT_OVERLINE = 'Secretaria · Alunos';
export const ENROLLMENT_OVERLINE = 'Secretaria · Matrículas';

export const REGISTER_STUDENT_LABEL = 'Cadastrar aluno';
export const ENROLL_LABEL = 'Matricular';
export const LINK_GUARDIAN_LABEL = 'Vincular responsável';
export const TRANSFER_LABEL = 'Transferir';
export const BACK_TO_SEARCH_LABEL = 'Voltar para a busca';

export const REGISTER_STUDENT_ACTION = {
  href: REGISTRAR_ROUTES.newStudent,
  text: REGISTER_STUDENT_LABEL,
} as const;

export const BIRTH_DATE_LABEL = 'Nascimento';
export const GUARDIAN_LABEL = 'Responsável';
export const RELATIONSHIP_LABEL = 'Parentesco';

export const GUARDIANS_HEADING_ID = 'responsaveis';
export const ENROLLMENTS_HEADING_ID = 'matriculas';

export const FINANCIALLY_RESPONSIBLE_LABEL = 'Financeiro';
export const YES = 'Sim';
export const NO = 'Não';

export const SEARCH_FIELD_WIDTH = '28rem';

export const BACK_TO_RECORD_LABEL = 'Voltar para a ficha';

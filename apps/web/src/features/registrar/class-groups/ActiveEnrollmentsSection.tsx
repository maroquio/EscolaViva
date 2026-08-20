import { Stack, Title } from '@mantine/core';
import { Link, generatePath } from 'react-router';
import { REGISTRAR_ROUTES } from '../../../constants';
import { PAGE_PARAMS } from '../../../shared/api';
import {
  ENROLLED_LABEL,
  ENROLMENTS_COUNTED,
  NO_STUDENT_ENROLLED,
  STUDENT_LABEL,
  YEAR_LABEL,
} from '../../../shared/labels/constants';
import { Empty } from '../../../shared/ui/Empty';
import { Pagination } from '../../../shared/ui/Pagination';
import { Table, type Column } from '../../../shared/ui/Table';
import type { Page } from '@escolaviva/contracts/page';
import type { EnrollmentInList } from '@escolaviva/contracts/shared';
import { NUMBERS_RIGHT } from '../../../shared/ui/constants';
import { SEARCH_STUDENT_LABEL } from './constants';

const ENROLLMENTS_SECTION_ID = 'matriculados';

const activeEnrollmentColumns: Column<EnrollmentInList>[] = [
  {
    header: STUDENT_LABEL,
    cell: (enrollment) => (
      <Link to={generatePath(REGISTRAR_ROUTES.student, { id: enrollment.studentId })}>
        {enrollment.studentName}
      </Link>
    ),
  },
  { header: YEAR_LABEL, cell: (enrollment) => enrollment.year, align: NUMBERS_RIGHT },
];

type ActiveEnrollmentsSectionProps = {
  readonly classGroupName: string;
  readonly enrollments: Page<EnrollmentInList>;
  readonly page: number;
};

export function ActiveEnrollmentsSection({
  classGroupName,
  enrollments,
  page,
}: ActiveEnrollmentsSectionProps): React.ReactElement {
  return (
    <section aria-labelledby={ENROLLMENTS_SECTION_ID}>
      <Title order={2} id={ENROLLMENTS_SECTION_ID} mb="md">
        {ENROLLED_LABEL}
      </Title>

      {enrollments.items.length === 0 ? (
        <Empty
          title={NO_STUDENT_ENROLLED}
          text="A turma existe, mas ainda não tem alunos. A matrícula é feita a partir da ficha do aluno."
          action={{ href: REGISTRAR_ROUTES.students, text: SEARCH_STUDENT_LABEL }}
        />
      ) : (
        <Stack gap="md">
          <Table
            caption={`Alunos matriculados em ${classGroupName}`}
            columns={activeEnrollmentColumns}
            rows={enrollments.items}
            rowKey={(enrollment) => enrollment.id}
          />
          <Pagination
            param={PAGE_PARAMS.enrollments}
            page={page}
            pages={enrollments.pages}
            total={enrollments.total}
            shown={enrollments.items.length}
            size={enrollments.size}
            label={ENROLMENTS_COUNTED}
          />
        </Stack>
      )}
    </section>
  );
}

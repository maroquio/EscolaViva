import { Stack, Title } from '@mantine/core';
import type { Page } from '@escolaviva/contracts/page';
import type { EnrollmentInList } from '@escolaviva/contracts/shared';
import type { StudentAsJson } from '@escolaviva/contracts/students';
import { PAGE_PARAMS } from '../../../shared/api';
import {
  CLASS_GROUP_LABEL,
  ENROLMENTS_COUNTED,
  SITUATION_LABEL,
  YEAR_LABEL,
} from '../../../shared/labels/constants';
import { Empty } from '../../../shared/ui/Empty';
import { Pagination } from '../../../shared/ui/Pagination';
import { Table, type Column } from '../../../shared/ui/Table';
import { NUMBERS_RIGHT } from '../../../shared/ui/constants';
import { StatusTag } from '../StatusTag';
import { ENROLMENTS_LABEL } from '../constants';
import { enrollAddress } from './addresses';
import { ENROLLMENTS_HEADING_ID, ENROLL_LABEL } from './constants';

const enrollmentColumns: Column<EnrollmentInList>[] = [
  { header: CLASS_GROUP_LABEL, cell: (enrollment) => enrollment.classGroupName },
  { header: YEAR_LABEL, cell: (enrollment) => enrollment.year, align: NUMBERS_RIGHT },
  { header: SITUATION_LABEL, cell: (enrollment) => <StatusTag status={enrollment.status} /> },
];

export type EnrollmentsSectionProps = {
  readonly student: StudentAsJson;
  readonly enrollments: Page<EnrollmentInList>;
  readonly page: number;
};

export function EnrollmentsSection({
  student,
  enrollments,
  page,
}: EnrollmentsSectionProps): React.ReactElement {
  return (
    <section aria-labelledby={ENROLLMENTS_HEADING_ID}>
      <Title order={2} id={ENROLLMENTS_HEADING_ID} mb="md">
        {ENROLMENTS_LABEL}
      </Title>

      {enrollments.items.length === 0 ? (
        <Empty
          title="Nenhuma matrícula"
          text="O aluno está cadastrado, mas ainda não foi matriculado em nenhuma turma."
          action={{ href: enrollAddress(student.id), text: ENROLL_LABEL }}
        />
      ) : (
        <Stack gap="md">
          <Table
            caption={`Histórico de matrículas de ${student.name}`}
            columns={enrollmentColumns}
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

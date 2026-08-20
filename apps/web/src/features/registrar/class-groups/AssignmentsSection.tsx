import { Button, Group, Stack, Title } from '@mantine/core';
import { Link } from 'react-router';
import { PAGE_PARAMS } from '../../../shared/api';
import {
  SUBJECTS_COUNTED,
  SUBJECTS_LABEL,
  SUBJECT_LABEL,
  TEACHER_LABEL,
} from '../../../shared/labels/constants';
import { Empty } from '../../../shared/ui/Empty';
import { Pagination } from '../../../shared/ui/Pagination';
import { Table, type Column } from '../../../shared/ui/Table';
import {
  ALIGNED_AT_THE_BOTTOM,
  SECONDARY_BUTTON,
  SPREAD_APART,
} from '../../../shared/ui/constants';
import { ASSIGN_SUBJECT_LABEL } from './constants';
import type { AssignmentInList } from '@escolaviva/contracts/classGroups';
import type { Page } from '@escolaviva/contracts/page';

const ASSIGNMENTS_SECTION_ID = 'disciplinas';

const assignmentColumns: Column<AssignmentInList>[] = [
  { header: SUBJECT_LABEL, cell: (assignment) => assignment.subjectName },
  { header: TEACHER_LABEL, cell: (assignment) => assignment.teacherName },
];

type AssignmentsSectionProps = {
  readonly classGroupName: string;
  readonly assignments: Page<AssignmentInList>;
  readonly page: number;
  readonly assignSubjectRoute: string;
};

export function AssignmentsSection({
  classGroupName,
  assignments,
  page,
  assignSubjectRoute,
}: AssignmentsSectionProps): React.ReactElement {
  return (
    <section aria-labelledby={ASSIGNMENTS_SECTION_ID}>
      <Group justify={SPREAD_APART} align={ALIGNED_AT_THE_BOTTOM} mb="md">
        <Title order={2} id={ASSIGNMENTS_SECTION_ID}>
          {SUBJECTS_LABEL}
        </Title>
        <Button component={Link} to={assignSubjectRoute} variant={SECONDARY_BUTTON} size="xs">
          {ASSIGN_SUBJECT_LABEL}
        </Button>
      </Group>

      {assignments.items.length === 0 ? (
        <Empty
          title="Nenhuma disciplina atribuída"
          text="Sem disciplina atribuída, nenhum professor vê esta turma para lançar frequência ou notas."
          action={{ href: assignSubjectRoute, text: ASSIGN_SUBJECT_LABEL }}
        />
      ) : (
        <Stack gap="md">
          <Table
            caption={`Disciplinas de ${classGroupName}`}
            columns={assignmentColumns}
            rows={assignments.items}
            rowKey={(assignment) => assignment.id}
          />
          <Pagination
            param={PAGE_PARAMS.subjects}
            page={page}
            pages={assignments.pages}
            total={assignments.total}
            shown={assignments.items.length}
            size={assignments.size}
            label={SUBJECTS_COUNTED}
          />
        </Stack>
      )}
    </section>
  );
}

import { Badge, Button, Card, Group, Stack, Text } from '@mantine/core';
import { Link, generatePath } from 'react-router';
import type { Page } from '@escolaviva/contracts/page';
import type { EnrollmentInList } from '@escolaviva/contracts/shared';
import { GUARDIAN_ROUTES } from '../../constants';
import { PAGE_PARAMS } from '../../shared/api';
import {
  ATTENDANCE_LABEL,
  ENROLMENTS_COUNTED,
  STATUS_COLOURS,
  STATUS_LABELS,
} from '../../shared/labels/constants';
import { Empty } from '../../shared/ui/Empty';
import { Pagination } from '../../shared/ui/Pagination';
import {
  ALIGNED_AT_THE_TOP,
  MUTED_TEXT,
  SECONDARY_BUTTON,
  SOFT_BADGE,
  SPREAD_APART,
} from '../../shared/ui/constants';

function EnrolledStudentCard({
  enrollment,
}: {
  readonly enrollment: EnrollmentInList;
}): React.ReactElement {
  return (
    <Card withBorder>
      <Group justify={SPREAD_APART} align={ALIGNED_AT_THE_TOP}>
        <Stack gap={2}>
          <Text fw={700}>{enrollment.studentName}</Text>
          <Text size="sm" c={MUTED_TEXT}>
            {enrollment.classGroupName} · {enrollment.year}
          </Text>
          <Badge color={STATUS_COLOURS[enrollment.status]} variant={SOFT_BADGE} w="fit-content">
            {STATUS_LABELS[enrollment.status]}
          </Badge>
        </Stack>

        <Group gap="xs">
          <Button
            component={Link}
            to={generatePath(GUARDIAN_ROUTES.reportCard, { id: enrollment.id })}
            variant={SECONDARY_BUTTON}
            size="xs"
          >
            Boletim
          </Button>
          <Button
            component={Link}
            to={generatePath(GUARDIAN_ROUTES.attendance, { id: enrollment.id })}
            variant={SECONDARY_BUTTON}
            size="xs"
          >
            {ATTENDANCE_LABEL}
          </Button>
        </Group>
      </Group>
    </Card>
  );
}

export type EnrolledStudentListProps = {
  readonly enrollments: Page<EnrollmentInList>;
  readonly page: number;
};

export function EnrolledStudentList({
  enrollments,
  page,
}: EnrolledStudentListProps): React.ReactElement {
  if (enrollments.items.length === 0) {
    return (
      <Empty
        title="Nenhum aluno vinculado"
        text="Sua conta existe, mas ainda não está vinculada a nenhum aluno. Quem faz esse vínculo é a secretaria da escola — procure-a para que o acompanhamento apareça aqui."
      />
    );
  }

  return (
    <Stack gap="md">
      {enrollments.items.map((enrollment) => (
        <EnrolledStudentCard key={enrollment.id} enrollment={enrollment} />
      ))}

      <Pagination
        param={PAGE_PARAMS.default}
        page={page}
        pages={enrollments.pages}
        total={enrollments.total}
        shown={enrollments.items.length}
        size={enrollments.size}
        label={ENROLMENTS_COUNTED}
      />
    </Stack>
  );
}

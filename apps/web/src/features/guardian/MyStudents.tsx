import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router';
import { GUARDIAN_ROUTES } from '../../constants';
import { usePage } from '../../shared/api';
import { STUDENTS_LABEL } from '../../shared/labels/constants';
import { LoadFailed } from '../../shared/ui/LoadFailed';
import { Loading } from '../../shared/ui/Loading';
import { PageHeader } from '../../shared/ui/PageHeader';
import {
  ALIGNED_AT_THE_BOTTOM,
  MUTED_TEXT,
  SECONDARY_BUTTON,
  SPREAD_APART,
} from '../../shared/ui/constants';
import { EnrolledStudentList } from './EnrolledStudentList';
import { UnreadHighlights } from './UnreadHighlights';
import { BOARD_TITLE, GUARDIAN_OVERLINE } from './constants';
import { useGuardianDashboard } from './queries';

const STUDENTS_SECTION_ID = 'alunos';
const BOARD_SECTION_ID = 'mural';

export function MyStudents(): React.ReactElement {
  const page = usePage();
  const dashboard = useGuardianDashboard(page);

  if (dashboard.isPending) return <Loading />;
  if (dashboard.isError) {
    return <LoadFailed error={dashboard.error} onRetry={() => void dashboard.refetch()} />;
  }

  const { enrollments, unread, totalUnread, totalOnBoard } = dashboard.data;

  return (
    <>
      <PageHeader
        overline={GUARDIAN_OVERLINE}
        title="Meus alunos"
        summary="O boletim e a frequência de quem você acompanha, e os comunicados da escola."
      />

      <Stack gap="xl">
        <section aria-labelledby={STUDENTS_SECTION_ID}>
          <Title order={2} id={STUDENTS_SECTION_ID} mb="md">
            {STUDENTS_LABEL}
          </Title>

          <EnrolledStudentList enrollments={enrollments} page={page} />
        </section>

        <section aria-labelledby={BOARD_SECTION_ID}>
          <Group justify={SPREAD_APART} align={ALIGNED_AT_THE_BOTTOM} mb="md">
            <Stack gap={2}>
              <Title order={2} id={BOARD_SECTION_ID}>
                {BOARD_TITLE}
              </Title>
              <Text size="sm" c={MUTED_TEXT}>
                {totalUnread} não lido(s) de {totalOnBoard} comunicado(s).
              </Text>
            </Stack>
            <Button component={Link} to={GUARDIAN_ROUTES.board} variant={SECONDARY_BUTTON} size="xs">
              Ver o mural
            </Button>
          </Group>

          <UnreadHighlights unread={unread} />
        </section>
      </Stack>
    </>
  );
}

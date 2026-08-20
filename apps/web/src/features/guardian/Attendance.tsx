import { Anchor, Badge, Card, Group, Stack, Text } from '@mantine/core';
import { Link, generatePath, useParams } from 'react-router';
import type { AttendanceDay, ReportCardAsJson } from '@escolaviva/contracts/guardian';
import { APP_ROUTES, GUARDIAN_ROUTES } from '../../constants';
import { PAGE_PARAMS, isNotFound, usePage } from '../../shared/api';
import { MISSING_VALUE, formatDate, formatPercent } from '../../shared/format';
import { Empty } from '../../shared/ui/Empty';
import { LoadFailed } from '../../shared/ui/LoadFailed';
import { Loading } from '../../shared/ui/Loading';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Pagination } from '../../shared/ui/Pagination';
import { Table, type Column } from '../../shared/ui/Table';
import {
  AGREEMENT_COLOUR,
  MUTED_TEXT,
  NOTHING_TO_SHOW_TITLE,
  REFUSAL_COLOUR,
  SOFT_BADGE,
} from '../../shared/ui/constants';
import {
  ATTENDANCE_COLUMNS,
  BACK_TO_MY_STUDENTS,
  GUARDIAN_OVERLINE,
  PRESENCE_LABELS,
} from './constants';
import { useAttendance } from './queries';

const dayColumns: Column<AttendanceDay>[] = [
  { header: ATTENDANCE_COLUMNS.day, cell: (day) => formatDate(day.date) },
  {
    header: ATTENDANCE_COLUMNS.presence,
    cell: (day) => (
      <Badge color={day.present ? AGREEMENT_COLOUR : REFUSAL_COLOUR} variant={SOFT_BADGE}>
        {day.present ? PRESENCE_LABELS.present : PRESENCE_LABELS.absent}
      </Badge>
    ),
  },
  { header: ATTENDANCE_COLUMNS.excuse, cell: (day) => day.excuse ?? MISSING_VALUE },
];

function AttendanceNotFound(): React.ReactElement {
  return (
    <>
      <PageHeader
        overline={GUARDIAN_OVERLINE}
        title="Frequência não encontrada"
        summary="Esta matrícula não é de nenhum aluno sob sua responsabilidade."
      />
      <Empty
        title={NOTHING_TO_SHOW_TITLE}
        action={{ href: APP_ROUTES.guardian, text: BACK_TO_MY_STUDENTS }}
      />
    </>
  );
}

function AttendanceSummary({
  reportCard,
}: {
  readonly reportCard: ReportCardAsJson;
}): React.ReactElement {
  return (
    <Card withBorder>
      <Group gap="xl">
        <Stack gap={2}>
          <Text size="xs" c={MUTED_TEXT}>
            Frequência no ano
          </Text>
          <Text fw={700}>{formatPercent(reportCard.attendanceRate)}</Text>
        </Stack>
        <Stack gap={2}>
          <Text size="xs" c={MUTED_TEXT}>
            Presenças
          </Text>
          <Text>
            {reportCard.presentDays} de {reportCard.totalDays} dias
          </Text>
        </Stack>
      </Group>
    </Card>
  );
}

export function Attendance(): React.ReactElement {
  const { id = '' } = useParams();
  const page = usePage();
  const attendance = useAttendance(id, page);

  if (attendance.isPending) return <Loading />;
  if (attendance.isError) {
    if (isNotFound(attendance.error)) {
      return <AttendanceNotFound />;
    }
    return <LoadFailed error={attendance.error} onRetry={() => void attendance.refetch()} />;
  }

  const { enrollment, reportCard, days } = attendance.data;

  return (
    <>
      <PageHeader
        overline={GUARDIAN_OVERLINE}
        title={`Frequência de ${enrollment.studentName}`}
        summary={`${enrollment.classGroupName} · ${enrollment.year}. Cada linha é um dia em que houve chamada.`}
      />

      <Stack gap="lg">
        <AttendanceSummary reportCard={reportCard} />

        {days.items.length === 0 ? (
          <Empty
            title="Nenhuma chamada registrada"
            text="Ainda não houve chamada nesta turma, ou nenhuma foi registrada até agora."
          />
        ) : (
          <>
            <Table
              caption={`Frequência de ${enrollment.studentName}, dia a dia`}
              columns={dayColumns}
              rows={days.items}
              rowKey={(day) => day.date}
            />
            <Pagination
              param={PAGE_PARAMS.default}
              page={page}
              pages={days.pages}
              total={days.total}
              shown={days.items.length}
              size={days.size}
              label="dias"
            />
          </>
        )}

        <Group>
          <Anchor component={Link} to={generatePath(GUARDIAN_ROUTES.reportCard, { id })}>
            Ver o boletim
          </Anchor>
          <Anchor component={Link} to={APP_ROUTES.guardian}>
            {BACK_TO_MY_STUDENTS}
          </Anchor>
        </Group>
      </Stack>
    </>
  );
}

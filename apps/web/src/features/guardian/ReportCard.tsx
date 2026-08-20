import { Anchor, Badge, Card, Group, Stack, Text } from '@mantine/core';
import { Link, generatePath, useParams } from 'react-router';
import type { ReportCardAsJson } from '@escolaviva/contracts/guardian';
import { APP_ROUTES, GUARDIAN_ROUTES } from '../../constants';
import { isNotFound } from '../../shared/api';
import { formatGrade, formatPercent } from '../../shared/format';
import { ATTENDANCE_LABEL, SITUATION_LABEL } from '../../shared/labels/constants';
import { Empty } from '../../shared/ui/Empty';
import { LoadFailed } from '../../shared/ui/LoadFailed';
import { Loading } from '../../shared/ui/Loading';
import { PageHeader } from '../../shared/ui/PageHeader';
import { MUTED_TEXT, NOTHING_TO_SHOW_TITLE, SOFT_BADGE } from '../../shared/ui/constants';
import { GradesTable } from './GradesTable';
import {
  BACK_TO_MY_STUDENTS,
  FINAL_STATUS_COLOURS,
  FINAL_STATUS_LABELS,
  GUARDIAN_OVERLINE,
} from './constants';
import { useReportCard } from './queries';

function ReportCardNotFound(): React.ReactElement {
  return (
    <>
      <PageHeader
        overline={GUARDIAN_OVERLINE}
        title="Boletim não encontrado"
        summary="Esta matrícula não é de nenhum aluno sob sua responsabilidade, ou ainda não tem boletim."
      />
      <Empty
        title={NOTHING_TO_SHOW_TITLE}
        text="O boletim aparece depois que a escola lança as primeiras notas."
        action={{ href: APP_ROUTES.guardian, text: BACK_TO_MY_STUDENTS }}
      />
    </>
  );
}

function ReportCardSummary({
  reportCard,
}: {
  readonly reportCard: ReportCardAsJson;
}): React.ReactElement {
  return (
    <Card withBorder>
      <Group gap="xl">
        <Stack gap={2}>
          <Text size="xs" c={MUTED_TEXT}>
            {SITUATION_LABEL}
          </Text>
          <Badge color={FINAL_STATUS_COLOURS[reportCard.status]} variant={SOFT_BADGE}>
            {FINAL_STATUS_LABELS[reportCard.status]}
          </Badge>
        </Stack>
        <Stack gap={2}>
          <Text size="xs" c={MUTED_TEXT}>
            Média geral
          </Text>
          <Text fw={700}>{formatGrade(reportCard.overallAverage)}</Text>
        </Stack>
        <Stack gap={2}>
          <Text size="xs" c={MUTED_TEXT}>
            {ATTENDANCE_LABEL}
          </Text>
          <Text>
            {formatPercent(reportCard.attendanceRate)} ({reportCard.presentDays} de{' '}
            {reportCard.totalDays} dias)
          </Text>
        </Stack>
      </Group>
    </Card>
  );
}

export function ReportCard(): React.ReactElement {
  const { id = '' } = useParams();
  const card = useReportCard(id);

  if (card.isPending) return <Loading />;
  if (card.isError) {
    if (isNotFound(card.error)) {
      return <ReportCardNotFound />;
    }
    return <LoadFailed error={card.error} onRetry={() => void card.refetch()} />;
  }

  const { reportCard, terms } = card.data;

  return (
    <>
      <PageHeader
        overline={GUARDIAN_OVERLINE}
        title={`Boletim de ${reportCard.studentName}`}
        summary={`${reportCard.classGroupName} · ${reportCard.year}. As notas e as médias vêm da escola; esta tela apenas as apresenta.`}
      />

      <Stack gap="lg">
        <ReportCardSummary reportCard={reportCard} />

        <GradesTable reportCard={reportCard} terms={terms} />

        <Group>
          <Anchor component={Link} to={generatePath(GUARDIAN_ROUTES.attendance, { id })}>
            Ver a frequência dia a dia
          </Anchor>
          <Anchor component={Link} to={APP_ROUTES.guardian}>
            {BACK_TO_MY_STUDENTS}
          </Anchor>
        </Group>
      </Stack>
    </>
  );
}

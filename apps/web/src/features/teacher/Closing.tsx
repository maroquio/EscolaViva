import { Alert, Badge, Button, Card, Group, List, Stack, Text } from '@mantine/core';
import { useParams } from 'react-router';
import type { ApplicationError } from '@escolaviva/contracts/errors';
import type { ClosingState } from '@escolaviva/contracts/teacher';
import { formatDateTime } from '../../shared/format';
import { CLASS_GROUP_NOT_FOUND } from '../../shared/labels/constants';
import { LoadFailed } from '../../shared/ui/LoadFailed';
import { Loading } from '../../shared/ui/Loading';
import { PageHeader } from '../../shared/ui/PageHeader';
import {
  ABSENCE_COLOUR,
  AGREEMENT_COLOUR,
  ALERT_ROLE,
  MUTED_TEXT,
  REFUSAL_COLOUR,
  SOFT_BADGE,
  SPREAD_APART,
  STATUS_ROLE,
} from '../../shared/ui/constants';
import { TEACHER_OVERLINE, TERM_CLOSING_LABELS, termInWords } from './constants';
import { isNotYours, useClosingState } from './queries';
import { useTermClosing } from './useTermClosing';

function WhyItCouldNotClose({
  refusals,
}: {
  readonly refusals: readonly ApplicationError[];
}): React.ReactElement {
  return (
    <Alert color={REFUSAL_COLOUR} role={ALERT_ROLE} title="Não foi possível fechar">
      <List>
        {refusals.map((problem) => (
          <List.Item key={`${problem.code}-${problem.message}`}>{problem.message}</List.Item>
        ))}
      </List>
    </Alert>
  );
}

function TermClosingCard({
  state,
  anyClosingRuns,
  onClose,
}: {
  readonly state: ClosingState;
  readonly anyClosingRuns: boolean;
  readonly onClose: (term: number) => void;
}): React.ReactElement {
  return (
    <Card withBorder>
      <Group justify={SPREAD_APART} align="center">
        <Stack gap={2}>
          <Group gap="sm">
            <Text fw={700}>{termInWords(state.term)}</Text>
            <Badge color={state.closed ? AGREEMENT_COLOUR : ABSENCE_COLOUR} variant={SOFT_BADGE}>
              {state.closed ? TERM_CLOSING_LABELS.closed : TERM_CLOSING_LABELS.open}
            </Badge>
          </Group>
          {state.closedAt !== null && (
            <Text size="sm" c={MUTED_TEXT}>
              Fechado em {formatDateTime(state.closedAt)}
            </Text>
          )}
        </Stack>

        {state.closed ? (
          <Text size="sm" c={MUTED_TEXT}>
            Nada a fazer
          </Text>
        ) : (
          <Button
            onClick={() => onClose(state.term)}
            loading={anyClosingRuns}
            disabled={anyClosingRuns}
          >
            Fechar {termInWords(state.term)}
          </Button>
        )}
      </Group>
    </Card>
  );
}

function TheWaitOnScreen(): React.ReactElement {
  return (
    <Text size="sm" role={STATUS_ROLE}>
      Fechando o bimestre. Isso consolida notas e frequência de toda a turma e pode levar alguns
      segundos — não feche a página.
    </Text>
  );
}

export function Closing(): React.ReactElement {
  const { classGroupId = '' } = useParams();
  const states = useClosingState(classGroupId);
  const { refusals, anyClosingRuns, closeTerm } = useTermClosing(classGroupId);

  if (states.isPending) return <Loading />;
  if (states.isError) {
    if (isNotYours(states.error)) {
      return (
        <>
          <PageHeader
            overline={TEACHER_OVERLINE}
            title={CLASS_GROUP_NOT_FOUND}
            summary="Esta turma não está entre as suas."
          />
          <LoadFailed error={states.error} />
        </>
      );
    }
    return <LoadFailed error={states.error} onRetry={() => void states.refetch()} />;
  }

  return (
    <>
      <PageHeader
        overline={TEACHER_OVERLINE}
        title="Fechamento do bimestre"
        summary="Fechar um bimestre consolida as notas e a frequência da turma. Depois de fechado, as notas daquele bimestre não podem mais ser alteradas."
      />

      <Stack gap="lg" maw="42rem">
        {refusals.length > 0 && <WhyItCouldNotClose refusals={refusals} />}

        {states.data.map((state) => (
          <TermClosingCard
            key={state.term}
            state={state}
            anyClosingRuns={anyClosingRuns}
            onClose={closeTerm}
          />
        ))}

        {anyClosingRuns && <TheWaitOnScreen />}
      </Stack>
    </>
  );
}

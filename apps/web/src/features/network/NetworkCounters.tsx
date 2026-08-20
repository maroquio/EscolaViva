import { Card, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router';
import type { AcademicYearInList, NetworkCounts } from '@escolaviva/contracts/network';
import { NETWORK_ROUTES } from '../../constants';
import {
  CLASS_GROUPS_LABEL,
  ENROLLED_LABEL,
  SCHOOLS_LABEL,
  USERS_LABEL,
} from '../../shared/labels/constants';
import { COUNTER_COLUMNS, IN_CAPITALS, MUTED_TEXT } from '../../shared/ui/constants';
import {
  DASHBOARD_HEADING_IDS,
  NO_ACADEMIC_YEAR_IN_WORDS,
  academicYearInWords,
} from './constants';

type CounterProps = {
  readonly label: string;
  readonly value: number;
  readonly detail: string;
};

const CounterBody = ({ label, value, detail }: CounterProps): React.ReactElement => (
  <Stack gap={4}>
    <Text size="xs" c={MUTED_TEXT} tt={IN_CAPITALS}>
      {label}
    </Text>
    <Text size="xl" fw={700}>
      {value}
    </Text>
    <Text size="sm" c={MUTED_TEXT}>
      {detail}
    </Text>
  </Stack>
);

const Counter = (counter: CounterProps): React.ReactElement => (
  <Card withBorder>
    <CounterBody {...counter} />
  </Card>
);

const CounterLinkingTo = ({
  href,
  ...counter
}: CounterProps & { readonly href: string }): React.ReactElement => (
  <Card withBorder component={Link} to={href}>
    <CounterBody {...counter} />
  </Card>
);

const inWordsOrNone = (academicYear: AcademicYearInList | null): string =>
  academicYear === null ? NO_ACADEMIC_YEAR_IN_WORDS : academicYearInWords(academicYear.year);

export type NetworkCountersProps = {
  readonly counts: NetworkCounts;
  readonly academicYear: AcademicYearInList | null;
};

export function NetworkCounters({ counts, academicYear }: NetworkCountersProps): React.ReactElement {
  const inWords = inWordsOrNone(academicYear);

  return (
    <section aria-labelledby={DASHBOARD_HEADING_IDS.counters}>
      <Stack gap="xs" mb="md">
        <Title order={2} id={DASHBOARD_HEADING_IDS.counters}>
          Onde a rede está hoje
        </Title>
        <Text size="sm" c={MUTED_TEXT}>
          Contagem no momento em que esta página foi aberta.
        </Text>
      </Stack>

      <SimpleGrid cols={COUNTER_COLUMNS}>
        <CounterLinkingTo
          label={SCHOOLS_LABEL}
          value={counts.schools}
          detail="Escolas ativas e inativas da rede"
          href={NETWORK_ROUTES.schools}
        />
        <CounterLinkingTo
          label={USERS_LABEL}
          value={counts.users}
          detail="Pessoas com acesso, somando todos os papéis"
          href={NETWORK_ROUTES.users}
        />
        <Counter
          label={CLASS_GROUPS_LABEL}
          value={counts.classGroups}
          detail={`Abertas no ${inWords}`}
        />
        <Counter
          label={ENROLLED_LABEL}
          value={counts.enrolled}
          detail={`Matrículas ativas no ${inWords}`}
        />
      </SimpleGrid>
    </section>
  );
}

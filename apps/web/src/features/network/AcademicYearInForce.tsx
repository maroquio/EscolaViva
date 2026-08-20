import { Card, Group, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import type { AcademicYearInList } from '@escolaviva/contracts/network';
import { NETWORK_ROUTES } from '../../constants';
import { formatDate } from '../../shared/format';
import { END_LABEL, START_LABEL } from '../../shared/labels/constants';
import { Empty } from '../../shared/ui/Empty';
import { MUTED_TEXT } from '../../shared/ui/constants';
import {
  DASHBOARD_HEADING_IDS,
  NETWORK_ACTIONS,
  NO_ACADEMIC_YEAR_TITLE,
  YEAR_LABEL,
} from './constants';

const AcademicYearFact = ({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): React.ReactElement => (
  <Stack gap={2}>
    <Text size="xs" c={MUTED_TEXT}>
      {label}
    </Text>
    {children}
  </Stack>
);

export type AcademicYearInForceProps = {
  readonly academicYear: AcademicYearInList | null;
  readonly definedYears: number;
};

export function AcademicYearInForce({
  academicYear,
  definedYears,
}: AcademicYearInForceProps): React.ReactElement {
  return (
    <section aria-labelledby={DASHBOARD_HEADING_IDS.academicYear}>
      <Stack gap="xs" mb="md">
        <Title order={2} id={DASHBOARD_HEADING_IDS.academicYear}>
          Ano letivo em vigor
        </Title>
        <Text size="sm" c={MUTED_TEXT}>
          {definedYears} ano(s) definido(s) nesta rede.
        </Text>
      </Stack>

      {academicYear === null ? (
        <Empty
          title={NO_ACADEMIC_YEAR_TITLE}
          text="Sem ano letivo não existe turma nem matrícula. É o primeiro passo depois de criar as unidades."
          action={{
            href: NETWORK_ROUTES.newAcademicYear,
            text: NETWORK_ACTIONS.defineAcademicYear,
          }}
        />
      ) : (
        <Card withBorder>
          <Group gap="xl">
            <AcademicYearFact label={YEAR_LABEL}>
              <Text fw={700}>{academicYear.year}</Text>
            </AcademicYearFact>
            <AcademicYearFact label={START_LABEL}>
              <Text>{formatDate(academicYear.startDate)}</Text>
            </AcademicYearFact>
            <AcademicYearFact label={END_LABEL}>
              <Text>{formatDate(academicYear.endDate)}</Text>
            </AcademicYearFact>
          </Group>
        </Card>
      )}
    </section>
  );
}

import { Card, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import type { AcademicYearAsJson, RegistrarTotals } from '@escolaviva/contracts/students';
import { formatDate } from '../../shared/format';
import { CLASS_GROUPS_LABEL, GUARDIANS_LABEL, SUBJECTS_LABEL } from '../../shared/labels/constants';
import { COUNTER_COLUMNS, IN_CAPITALS, MUTED_TEXT } from '../../shared/ui/constants';
import { ENROLMENTS_LABEL, NO_ACADEMIC_YEAR_SENTENCE, academicYearSpan } from './constants';

const TOTALS_HEADING_ID = 'totais';

const academicYearSentence = (currentYear: AcademicYearAsJson | null): string =>
  currentYear === null
    ? NO_ACADEMIC_YEAR_SENTENCE
    : academicYearSpan(
        currentYear.year,
        formatDate(currentYear.startDate),
        formatDate(currentYear.endDate),
      );

type CounterProps = { readonly label: string; readonly value: number };

const Counter = ({ label, value }: CounterProps): React.ReactElement => (
  <Card withBorder>
    <Stack gap={4}>
      <Text size="xs" c={MUTED_TEXT} tt={IN_CAPITALS}>
        {label}
      </Text>
      <Text size="xl" fw={700}>
        {value}
      </Text>
    </Stack>
  </Card>
);

export type ScopeTotalsProps = {
  readonly currentYear: AcademicYearAsJson | null;
  readonly totals: RegistrarTotals;
};

export function ScopeTotals({ currentYear, totals }: ScopeTotalsProps): React.ReactElement {
  return (
    <section aria-labelledby={TOTALS_HEADING_ID}>
      <Stack gap="xs" mb="md">
        <Title order={2} id={TOTALS_HEADING_ID}>
          No seu escopo
        </Title>
        <Text size="sm" c={MUTED_TEXT}>
          {academicYearSentence(currentYear)}
        </Text>
      </Stack>

      <SimpleGrid cols={COUNTER_COLUMNS}>
        <Counter label={CLASS_GROUPS_LABEL} value={totals.classGroups} />
        <Counter label={ENROLMENTS_LABEL} value={totals.enrollments} />
        <Counter label={GUARDIANS_LABEL} value={totals.guardians} />
        <Counter label={SUBJECTS_LABEL} value={totals.subjects} />
      </SimpleGrid>
    </section>
  );
}

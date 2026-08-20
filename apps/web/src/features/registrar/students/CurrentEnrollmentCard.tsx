import { Card, Stack, Text } from '@mantine/core';
import type { EnrollmentInList } from '@escolaviva/contracts/shared';
import type { StudentAsJson } from '@escolaviva/contracts/students';
import { MUTED_TEXT } from '../../../shared/ui/constants';

export type CurrentEnrollmentCardProps = {
  readonly student: StudentAsJson;
  readonly enrollment: EnrollmentInList;
};

export function CurrentEnrollmentCard({
  student,
  enrollment,
}: CurrentEnrollmentCardProps): React.ReactElement {
  return (
    <Card withBorder>
      <Stack gap={2}>
        <Text size="xs" c={MUTED_TEXT}>
          Matrícula atual
        </Text>
        <Text fw={700}>{student.name}</Text>
        <Text>
          {enrollment.classGroupName} · {enrollment.year}
        </Text>
      </Stack>
    </Card>
  );
}

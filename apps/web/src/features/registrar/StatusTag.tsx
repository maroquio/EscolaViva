import { Badge, Text } from '@mantine/core';
import type { EnrollmentStatus } from '@escolaviva/contracts/enumerations';
import { MISSING_VALUE } from '../../shared/format';
import { STATUS_COLOURS, STATUS_LABELS } from '../../shared/labels/constants';
import { MUTED_TEXT, SOFT_BADGE } from '../../shared/ui/constants';

export function StatusTag({ status }: { status: EnrollmentStatus | null }): React.ReactElement {
  if (status === null) return <Text c={MUTED_TEXT}>{MISSING_VALUE}</Text>;
  return (
    <Badge color={STATUS_COLOURS[status]} variant={SOFT_BADGE}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

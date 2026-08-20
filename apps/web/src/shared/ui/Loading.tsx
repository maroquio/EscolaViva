import { Group, Loader, Text } from '@mantine/core';
import { STATUS_ROLE } from './constants';

export function Loading(): React.ReactElement {
  return (
    <Group role={STATUS_ROLE} gap="sm">
      <Loader size="sm" />
      <Text>Carregando…</Text>
    </Group>
  );
}

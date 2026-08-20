import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router';
import {
  ALIGNED_AT_THE_TOP,
  IN_CAPITALS,
  MUTED_TEXT,
  ON_A_SINGLE_LINE,
  SPREAD_APART,
} from './constants';

const SUMMARY_WIDTH = '42rem';

export type PageHeaderProps = {
  readonly overline: string;
  readonly title: string;
  readonly summary: string;
  readonly action?: { readonly href: string; readonly text: string };
};

export function PageHeader({
  overline,
  title,
  summary,
  action,
}: PageHeaderProps): React.ReactElement {
  return (
    <Group justify={SPREAD_APART} align={ALIGNED_AT_THE_TOP} mb="lg" wrap={ON_A_SINGLE_LINE}>
      <Stack gap="xs">
        <Text size="xs" c={MUTED_TEXT} tt={IN_CAPITALS}>
          {overline}
        </Text>
        <Title order={1}>{title}</Title>
        <Text maw={SUMMARY_WIDTH}>{summary}</Text>
      </Stack>

      {action !== undefined && (
        <Button component={Link} to={action.href} style={{ flexShrink: 0 }}>
          {action.text}
        </Button>
      )}
    </Group>
  );
}

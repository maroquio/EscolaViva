import { Anchor, Group, Stack, Text } from '@mantine/core';
import { Link, generatePath } from 'react-router';
import type { BoardItem } from '@escolaviva/contracts/guardian';
import { GUARDIAN_ROUTES } from '../../constants';
import { formatDate } from '../../shared/format';
import { MUTED_TEXT } from '../../shared/ui/constants';

export function UnreadHighlights({
  unread,
}: {
  readonly unread: readonly BoardItem[];
}): React.ReactElement {
  if (unread.length === 0) return <Text c={MUTED_TEXT}>Nenhum comunicado não lido.</Text>;
  return (
    <Stack gap="xs">
      {unread.map((announcement) => (
        <Group key={announcement.announcementId} gap="sm">
          <Anchor
            component={Link}
            to={generatePath(GUARDIAN_ROUTES.announcement, {
              announcementId: announcement.announcementId,
            })}
          >
            {announcement.title}
          </Anchor>
          <Text size="sm" c={MUTED_TEXT}>
            {formatDate(announcement.publishedAt)}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}

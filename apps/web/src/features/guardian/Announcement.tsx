import { Alert, Anchor, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { Link, useParams } from 'react-router';
import { GUARDIAN_ROUTES } from '../../constants';
import { isNotFound } from '../../shared/api';
import { formatDateTime } from '../../shared/format';
import { Empty } from '../../shared/ui/Empty';
import { LoadFailed } from '../../shared/ui/LoadFailed';
import { Loading } from '../../shared/ui/Loading';
import { PageHeader } from '../../shared/ui/PageHeader';
import {
  AGREEMENT_COLOUR,
  ALERT_ROLE,
  NOTHING_TO_SHOW_TITLE,
  REFUSAL_COLOUR,
  STATUS_ROLE,
  WIDE_FORM_WIDTH,
} from '../../shared/ui/constants';
import { useNotices } from '../../shared/ui/notices';
import {
  BACK_TO_BOARD,
  BOARD_OVERLINE,
  KEEPS_THE_LINE_BREAKS,
  MARKED_AS_READ,
} from './constants';
import { useMarkAsRead } from './mutations';
import { useAnnouncement } from './queries';

function NotOnYourBoard(): React.ReactElement {
  return (
    <>
      <PageHeader
        overline={BOARD_OVERLINE}
        title="Comunicado não encontrado"
        summary="Este comunicado não está no seu mural."
      />
      <Empty
        title={NOTHING_TO_SHOW_TITLE}
        text="Comunicados são enviados a turmas ou escolas específicas; este não foi enviado a nenhuma das suas."
        action={{ href: GUARDIAN_ROUTES.board, text: BACK_TO_BOARD }}
      />
    </>
  );
}

export function Announcement(): React.ReactElement {
  const { announcementId = '' } = useParams();
  const notices = useNotices();
  const opened = useAnnouncement(announcementId);
  const markAsRead = useMarkAsRead(announcementId);

  if (opened.isPending) return <Loading />;
  if (opened.isError) {
    if (isNotFound(opened.error)) {
      return <NotOnYourBoard />;
    }
    return <LoadFailed error={opened.error} onRetry={() => void opened.refetch()} />;
  }

  const { announcement, readAt } = opened.data;

  return (
    <>
      <PageHeader
        overline={BOARD_OVERLINE}
        title={announcement.title}
        summary={`Publicado por ${announcement.authorName}${
          announcement.publishedAt === null ? '' : ` em ${formatDateTime(announcement.publishedAt)}`
        }.`}
      />

      <Stack gap="lg" maw={WIDE_FORM_WIDTH}>
        <Paper p="lg" withBorder>
          <Text style={{ whiteSpace: KEEPS_THE_LINE_BREAKS }}>{announcement.body}</Text>
        </Paper>

        {readAt === null ? (
          <Group>
            <Button
              onClick={() => {
                markAsRead.mutate(undefined, {
                  onSuccess: () => notices.success(MARKED_AS_READ),
                });
              }}
              loading={markAsRead.isPending}
              disabled={markAsRead.isPending}
            >
              Marcar como lido
            </Button>
          </Group>
        ) : (
          <Alert color={AGREEMENT_COLOUR} role={STATUS_ROLE}>
            Você marcou este comunicado como lido em {formatDateTime(readAt)}.
          </Alert>
        )}

        {markAsRead.isError && (
          <Alert color={REFUSAL_COLOUR} role={ALERT_ROLE}>
            {markAsRead.error.message}
          </Alert>
        )}

        <Anchor component={Link} to={GUARDIAN_ROUTES.board}>
          {BACK_TO_BOARD}
        </Anchor>
      </Stack>
    </>
  );
}

import { Anchor, Badge, Group, Stack, Text, Title } from '@mantine/core';
import { Link, generatePath } from 'react-router';
import type { BoardItem } from '@escolaviva/contracts/guardian';
import type { Page } from '@escolaviva/contracts/page';
import { GUARDIAN_ROUTES } from '../../constants';
import { PAGE_PARAMS, type PageParam, usePage } from '../../shared/api';
import { formatDate } from '../../shared/format';
import { Empty } from '../../shared/ui/Empty';
import { LoadFailed } from '../../shared/ui/LoadFailed';
import { Loading } from '../../shared/ui/Loading';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Pagination } from '../../shared/ui/Pagination';
import { MUTED_TEXT, NOTICE_COLOUR, ON_A_SINGLE_LINE, SOFT_BADGE } from '../../shared/ui/constants';
import { BOARD_TITLE, GUARDIAN_OVERLINE } from './constants';
import { useBoard } from './queries';

const UNREAD_SECTION_ID = 'nao-lidos';
const READ_SECTION_ID = 'lidos';

function AnnouncementLink({
  announcement,
}: {
  readonly announcement: BoardItem;
}): React.ReactElement {
  return (
    <Group gap="sm" wrap={ON_A_SINGLE_LINE}>
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
      {announcement.readAt === null && (
        <Badge color={NOTICE_COLOUR} variant={SOFT_BADGE}>
          Não lido
        </Badge>
      )}
    </Group>
  );
}

type BoardSectionProps = {
  readonly sectionId: string;
  readonly title: string;
  readonly announcements: Page<BoardItem>;
  readonly pageParam: PageParam;
  readonly page: number;
  readonly countLabel: string;
  readonly emptyTitle: string;
  readonly emptyText: string;
};

function BoardSection({
  sectionId,
  title,
  announcements,
  pageParam,
  page,
  countLabel,
  emptyTitle,
  emptyText,
}: BoardSectionProps): React.ReactElement {
  return (
    <section aria-labelledby={sectionId}>
      <Title order={2} id={sectionId} mb="md">
        {title}
      </Title>

      {announcements.items.length === 0 ? (
        <Empty title={emptyTitle} text={emptyText} />
      ) : (
        <Stack gap="sm">
          {announcements.items.map((announcement) => (
            <AnnouncementLink key={announcement.announcementId} announcement={announcement} />
          ))}
          <Pagination
            param={pageParam}
            page={page}
            pages={announcements.pages}
            total={announcements.total}
            shown={announcements.items.length}
            size={announcements.size}
            label={countLabel}
          />
        </Stack>
      )}
    </section>
  );
}

export function Board(): React.ReactElement {
  const unreadPage = usePage(PAGE_PARAMS.unread);
  const readPage = usePage(PAGE_PARAMS.read);
  const board = useBoard(unreadPage, readPage);

  if (board.isPending) return <Loading />;
  if (board.isError) return <LoadFailed error={board.error} onRetry={() => void board.refetch()} />;

  const { unread, read } = board.data;

  return (
    <>
      <PageHeader
        overline={GUARDIAN_OVERLINE}
        title={BOARD_TITLE}
        summary="Os comunicados da escola. Abrir um comunicado não o marca como lido — quem marca é você, no botão dentro dele."
      />

      <Stack gap="xl">
        <BoardSection
          sectionId={UNREAD_SECTION_ID}
          title="Não lidos"
          announcements={unread}
          pageParam={PAGE_PARAMS.unread}
          page={unreadPage}
          countLabel="não lidos"
          emptyTitle="Nenhum comunicado não lido"
          emptyText="Você está em dia com o mural."
        />

        <BoardSection
          sectionId={READ_SECTION_ID}
          title="Lidos"
          announcements={read}
          pageParam={PAGE_PARAMS.read}
          page={readPage}
          countLabel="lidos"
          emptyTitle="Nenhum comunicado lido"
          emptyText="Depois que você marcar um comunicado como lido, ele aparece aqui."
        />
      </Stack>
    </>
  );
}

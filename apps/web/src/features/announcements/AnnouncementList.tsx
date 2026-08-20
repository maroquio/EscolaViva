import { Card, Group, NativeSelect, Stack, Text, Title } from '@mantine/core';
import { useSearchParams } from 'react-router';
import type { AnnouncementInList, ReadSummary } from '@escolaviva/contracts/announcements';
import type { SchoolOption } from '@escolaviva/contracts/options';
import { ANNOUNCEMENT_ROUTES } from '../../constants';
import { PAGE_PARAMS, usePage } from '../../shared/api';
import { formatDate, formatRate } from '../../shared/format';
import { ANNOUNCEMENTS_AREA, ANNOUNCEMENTS_LABEL, UNIT_LABEL } from '../../shared/labels/constants';
import { Empty } from '../../shared/ui/Empty';
import { LoadFailed } from '../../shared/ui/LoadFailed';
import { Loading } from '../../shared/ui/Loading';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Pagination } from '../../shared/ui/Pagination';
import { Table, type Column } from '../../shared/ui/Table';
import { IN_CAPITALS, MUTED_TEXT, NUMBERS_RIGHT } from '../../shared/ui/constants';
import { useSchoolOptions } from '../network/queries';
import { ANNOUNCEMENT_COLUMNS, NO_SCHOOL, SCHOOL_PARAM, WHOLE_NETWORK } from './constants';
import { useAnnouncements } from './queries';

const NEW_ANNOUNCEMENT_TEXT = 'Novo comunicado';

const announcementColumns: Column<AnnouncementInList>[] = [
  { header: ANNOUNCEMENT_COLUMNS.announcement, cell: (announcement) => announcement.title },
  { header: ANNOUNCEMENT_COLUMNS.sentAt, cell: (announcement) => formatDate(announcement.publishedAt) },
  { header: ANNOUNCEMENT_COLUMNS.recipients, cell: (announcement) => announcement.recipients, align: NUMBERS_RIGHT },
  { header: ANNOUNCEMENT_COLUMNS.reads, cell: (announcement) => announcement.reads, align: NUMBERS_RIGHT },
  { header: ANNOUNCEMENT_COLUMNS.rate, cell: (announcement) => formatRate(announcement.rate), align: NUMBERS_RIGHT },
];

function ReadRateCard({ summary }: { readonly summary: ReadSummary }): React.ReactElement {
  return (
    <Card withBorder>
      <Group gap="xl">
        <Stack gap={2}>
          <Text size="xs" c={MUTED_TEXT} tt={IN_CAPITALS}>
            Taxa de leitura
          </Text>
          <Text size="xl" fw={700}>
            {formatRate(summary.rate)}
          </Text>
          <Text size="sm" c={MUTED_TEXT}>
            {summary.reads} leitura(s) de {summary.recipients} destinatário(s)
          </Text>
        </Stack>
      </Group>
    </Card>
  );
}

type SchoolFilterProps = {
  readonly schools: readonly SchoolOption[];
  readonly chosen: string;
  readonly onChoose: (schoolId: string) => void;
};

function SchoolFilter({ schools, chosen, onChoose }: SchoolFilterProps): React.ReactElement {
  return (
    <Group>
      <NativeSelect
        label={UNIT_LABEL}
        data={[
          { value: NO_SCHOOL, label: WHOLE_NETWORK },
          ...schools.map((school) => ({ value: school.id, label: school.name })),
        ]}
        value={chosen}
        onChange={(event) => onChoose(event.currentTarget.value)}
      />
    </Group>
  );
}

export function AnnouncementList(): React.ReactElement {
  const [search, setSearch] = useSearchParams();
  const page = usePage();
  const schoolId = search.get(SCHOOL_PARAM) ?? NO_SCHOOL;
  const schools = useSchoolOptions();
  const board = useAnnouncements(schoolId, page);

  const filterBySchool = (chosenSchoolId: string): void => {
    const next = new URLSearchParams(search);
    if (chosenSchoolId === NO_SCHOOL) next.delete(SCHOOL_PARAM);
    else next.set(SCHOOL_PARAM, chosenSchoolId);
    next.delete(PAGE_PARAMS.default);
    setSearch(next);
  };

  if (board.isPending) return <Loading />;
  if (board.isError) return <LoadFailed error={board.error} onRetry={() => void board.refetch()} />;

  const { announcements, summary, seesWholeNetwork } = board.data;

  return (
    <>
      <PageHeader
        overline={ANNOUNCEMENTS_AREA}
        title={ANNOUNCEMENTS_LABEL}
        summary="O que foi enviado e quanto disso foi lido. A taxa de leitura é a medida de que o mural funciona — ou de que ninguém o abre."
        action={{ href: ANNOUNCEMENT_ROUTES.newAnnouncement, text: NEW_ANNOUNCEMENT_TEXT }}
      />

      <Stack gap="lg">
        <ReadRateCard summary={summary} />

        {seesWholeNetwork && (
          <SchoolFilter
            schools={schools.data ?? []}
            chosen={schoolId}
            onChoose={filterBySchool}
          />
        )}

        {announcements.items.length === 0 ? (
          <Empty
            title="Nenhum comunicado enviado"
            text="Comunicados aparecem no mural de quem responde pelos alunos da unidade."
            action={{ href: ANNOUNCEMENT_ROUTES.newAnnouncement, text: NEW_ANNOUNCEMENT_TEXT }}
          />
        ) : (
          <>
            <Title order={2} size="h4">
              Enviados
            </Title>
            <Table
              caption="Comunicados enviados e suas leituras"
              columns={announcementColumns}
              rows={announcements.items}
              rowKey={(announcement) => announcement.id}
            />
            <Pagination
              param={PAGE_PARAMS.default}
              page={page}
              pages={announcements.pages}
              total={announcements.total}
              shown={announcements.items.length}
              size={announcements.size}
              label="comunicados"
            />
          </>
        )}
      </Stack>
    </>
  );
}

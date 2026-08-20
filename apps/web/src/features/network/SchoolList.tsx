import { Badge, Stack, Text, Title } from '@mantine/core';
import type { SchoolInList } from '@escolaviva/contracts/network';
import { NETWORK_ROUTES } from '../../constants';
import { PAGE_PARAMS, usePage } from '../../shared/api';
import { MISSING_VALUE } from '../../shared/format';
import { SCHOOLS_LABEL, SCHOOL_LABEL, SITUATION_LABEL } from '../../shared/labels/constants';
import { Empty } from '../../shared/ui/Empty';
import { LoadFailed } from '../../shared/ui/LoadFailed';
import { Loading } from '../../shared/ui/Loading';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Pagination } from '../../shared/ui/Pagination';
import { Table, type Column } from '../../shared/ui/Table';
import { IN_TOTAL, MUTED_TEXT, NUMBERS_RIGHT, SOFT_BADGE } from '../../shared/ui/constants';
import {
  ACTIVITY_COLOURS,
  INEP_CODE_LABEL,
  NETWORK_ACTIONS,
  NETWORK_OVERLINES,
  SCHOOL_ACTIVITY_LABELS,
} from './constants';
import { useSchools } from './queries';

const newSchool = { href: NETWORK_ROUTES.newSchool, text: NETWORK_ACTIONS.newSchool };

const columns: Column<SchoolInList>[] = [
  { header: SCHOOL_LABEL, cell: (school) => school.name },
  { header: INEP_CODE_LABEL, cell: (school) => school.inepCode ?? MISSING_VALUE, align: NUMBERS_RIGHT },
  {
    header: SITUATION_LABEL,
    cell: (school) => (
      <Badge
        color={school.active ? ACTIVITY_COLOURS.active : ACTIVITY_COLOURS.inactive}
        variant={SOFT_BADGE}
      >
        {school.active ? SCHOOL_ACTIVITY_LABELS.active : SCHOOL_ACTIVITY_LABELS.inactive}
      </Badge>
    ),
  },
];

export function SchoolList(): React.ReactElement {
  const page = usePage();
  const schools = useSchools(page);

  if (schools.isPending) return <Loading />;
  if (schools.isError) {
    return <LoadFailed error={schools.error} onRetry={() => void schools.refetch()} />;
  }

  const { items, pages, total, size } = schools.data;

  return (
    <>
      <PageHeader
        overline={NETWORK_OVERLINES.area}
        title={SCHOOLS_LABEL}
        summary='Cada escola da rede é uma unidade. Papéis, turmas e comunicados existem sempre dentro de uma — ninguém é "professor da rede".'
        action={newSchool}
      />

      <Stack gap="md">
        <Stack gap={2}>
          <Title order={2}>Unidades da rede</Title>
          <Text size="sm" c={MUTED_TEXT}>
            {total} {IN_TOTAL}
          </Text>
        </Stack>

        {items.length === 0 ? (
          <Empty
            title="Nenhuma unidade criada"
            text="A primeira unidade abre o caminho para os usuários e as turmas."
            action={newSchool}
          />
        ) : (
          <>
            <Table
              caption="Unidades cadastradas"
              columns={columns}
              rows={items}
              rowKey={(school) => school.id}
            />
            <Pagination
              param={PAGE_PARAMS.default}
              page={page}
              pages={pages}
              total={total}
              shown={items.length}
              size={size}
              label="escolas"
            />
          </>
        )}
      </Stack>
    </>
  );
}

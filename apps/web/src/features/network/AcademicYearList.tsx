import { Stack, Text, Title } from '@mantine/core';
import type { AcademicYearInList } from '@escolaviva/contracts/network';
import { NETWORK_ROUTES } from '../../constants';
import { PAGE_PARAMS, usePage } from '../../shared/api';
import { formatDate } from '../../shared/format';
import { ACADEMIC_YEARS_LABEL, END_LABEL, START_LABEL } from '../../shared/labels/constants';
import { Empty } from '../../shared/ui/Empty';
import { LoadFailed } from '../../shared/ui/LoadFailed';
import { Loading } from '../../shared/ui/Loading';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Pagination } from '../../shared/ui/Pagination';
import { Table, type Column } from '../../shared/ui/Table';
import { MUTED_TEXT, NUMBERS_RIGHT } from '../../shared/ui/constants';
import {
  NETWORK_ACTIONS,
  NETWORK_OVERLINES,
  NO_ACADEMIC_YEAR_TITLE,
  YEAR_LABEL,
} from './constants';
import { useAcademicYears } from './queries';

const defineAcademicYear = {
  href: NETWORK_ROUTES.newAcademicYear,
  text: NETWORK_ACTIONS.defineAcademicYear,
};

const columns: Column<AcademicYearInList>[] = [
  { header: YEAR_LABEL, cell: (year) => year.year, align: NUMBERS_RIGHT },
  { header: START_LABEL, cell: (year) => formatDate(year.startDate) },
  { header: END_LABEL, cell: (year) => formatDate(year.endDate) },
];

export function AcademicYearList(): React.ReactElement {
  const page = usePage();
  const years = useAcademicYears(page);

  if (years.isPending) return <Loading />;
  if (years.isError) {
    return <LoadFailed error={years.error} onRetry={() => void years.refetch()} />;
  }

  const { items, pages, total, size } = years.data;

  return (
    <>
      <PageHeader
        overline={NETWORK_OVERLINES.area}
        title={ACADEMIC_YEARS_LABEL}
        summary="O ano letivo delimita as matrículas: um aluno tem uma matrícula ativa por ano, e é esse recorte que o boletim e a frequência usam."
        action={defineAcademicYear}
      />

      <Stack gap="md">
        <Stack gap={2}>
          <Title order={2}>Anos definidos</Title>
          <Text size="sm" c={MUTED_TEXT}>
            Do mais recente para o mais antigo
          </Text>
        </Stack>

        {items.length === 0 ? (
          <Empty
            title={NO_ACADEMIC_YEAR_TITLE}
            text="Enquanto não houver um ano definido, a secretaria não consegue criar turmas nem matricular alunos."
            action={defineAcademicYear}
          />
        ) : (
          <>
            <Table
              caption="Calendário letivo da rede"
              columns={columns}
              rows={items}
              rowKey={(year) => year.id}
            />
            <Pagination
              param={PAGE_PARAMS.default}
              page={page}
              pages={pages}
              total={total}
              shown={items.length}
              size={size}
              label="anos letivos"
            />
          </>
        )}
      </Stack>
    </>
  );
}

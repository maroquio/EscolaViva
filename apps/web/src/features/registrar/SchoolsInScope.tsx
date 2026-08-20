import { Stack, Title } from '@mantine/core';
import type { Page } from '@escolaviva/contracts/page';
import type { SchoolInDashboard } from '@escolaviva/contracts/students';
import { PAGE_PARAMS } from '../../shared/api';
import { CLASS_GROUPS_LABEL, GUARDIANS_LABEL, UNIT_LABEL } from '../../shared/labels/constants';
import { Empty } from '../../shared/ui/Empty';
import { Pagination } from '../../shared/ui/Pagination';
import { Table, type Column } from '../../shared/ui/Table';
import { NUMBERS_RIGHT } from '../../shared/ui/constants';
import { ENROLMENTS_LABEL } from './constants';

const SCHOOLS_HEADING_ID = 'unidades';

const schoolColumns: Column<SchoolInDashboard>[] = [
  { header: UNIT_LABEL, cell: (school) => school.schoolName },
  { header: CLASS_GROUPS_LABEL, cell: (school) => school.classGroups, align: NUMBERS_RIGHT },
  { header: ENROLMENTS_LABEL, cell: (school) => school.enrollments, align: NUMBERS_RIGHT },
  { header: GUARDIANS_LABEL, cell: (school) => school.guardians, align: NUMBERS_RIGHT },
];

export type SchoolsInScopeProps = {
  readonly schools: Page<SchoolInDashboard>;
  readonly page: number;
};

export function SchoolsInScope({ schools, page }: SchoolsInScopeProps): React.ReactElement {
  return (
    <section aria-labelledby={SCHOOLS_HEADING_ID}>
      <Title order={2} id={SCHOOLS_HEADING_ID} mb="md">
        Suas unidades
      </Title>

      {schools.items.length === 0 ? (
        <Empty
          title="Nenhuma unidade atribuída"
          text="Sua conta tem o papel de secretaria, mas não está vinculada a nenhuma escola. Peça à administração da rede que atribua uma unidade."
        />
      ) : (
        <Stack gap="md">
          <Table
            caption="Unidades sob sua responsabilidade"
            columns={schoolColumns}
            rows={schools.items}
            rowKey={(school) => school.schoolId}
          />
          <Pagination
            param={PAGE_PARAMS.default}
            page={page}
            pages={schools.pages}
            total={schools.total}
            shown={schools.items.length}
            size={schools.size}
            label="unidades"
          />
        </Stack>
      )}
    </section>
  );
}

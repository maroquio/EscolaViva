import { Button, Group, Stack, Title } from '@mantine/core';
import { Link } from 'react-router';
import type { Page } from '@escolaviva/contracts/page';
import type { GuardianLinkInList, StudentAsJson } from '@escolaviva/contracts/students';
import { PAGE_PARAMS } from '../../../shared/api';
import { EMAIL_LABEL, GUARDIANS_LABEL } from '../../../shared/labels/constants';
import { Empty } from '../../../shared/ui/Empty';
import { Pagination } from '../../../shared/ui/Pagination';
import { Table, type Column } from '../../../shared/ui/Table';
import {
  ALIGNED_AT_THE_BOTTOM,
  SECONDARY_BUTTON,
  SPREAD_APART,
} from '../../../shared/ui/constants';
import { guardianLinkAddress } from './addresses';
import {
  FINANCIALLY_RESPONSIBLE_LABEL,
  GUARDIANS_HEADING_ID,
  GUARDIAN_LABEL,
  LINK_GUARDIAN_LABEL,
  NO,
  RELATIONSHIP_LABEL,
  YES,
} from './constants';

const guardianColumns: Column<GuardianLinkInList>[] = [
  { header: GUARDIAN_LABEL, cell: (link) => link.name },
  { header: RELATIONSHIP_LABEL, cell: (link) => link.relationship },
  { header: EMAIL_LABEL, cell: (link) => link.email },
  { header: FINANCIALLY_RESPONSIBLE_LABEL, cell: (link) => (link.financiallyResponsible ? YES : NO) },
];

export type GuardiansSectionProps = {
  readonly student: StudentAsJson;
  readonly guardians: Page<GuardianLinkInList>;
  readonly page: number;
};

export function GuardiansSection({
  student,
  guardians,
  page,
}: GuardiansSectionProps): React.ReactElement {
  const linkAddress = guardianLinkAddress(student.id);

  return (
    <section aria-labelledby={GUARDIANS_HEADING_ID}>
      <Group justify={SPREAD_APART} align={ALIGNED_AT_THE_BOTTOM} mb="md">
        <Title order={2} id={GUARDIANS_HEADING_ID}>
          {GUARDIANS_LABEL}
        </Title>
        <Button component={Link} to={linkAddress} variant={SECONDARY_BUTTON} size="xs">
          {LINK_GUARDIAN_LABEL}
        </Button>
      </Group>

      {guardians.items.length === 0 ? (
        <Empty
          title="Nenhum responsável vinculado"
          text="Sem responsável vinculado, ninguém acompanha este aluno pelo portal."
          action={{ href: linkAddress, text: LINK_GUARDIAN_LABEL }}
        />
      ) : (
        <Stack gap="md">
          <Table
            caption={`Responsáveis de ${student.name}`}
            columns={guardianColumns}
            rows={guardians.items}
            rowKey={(link) => link.userId}
          />
          <Pagination
            param={PAGE_PARAMS.guardians}
            page={page}
            pages={guardians.pages}
            total={guardians.total}
            shown={guardians.items.length}
            size={guardians.size}
            label="responsáveis"
          />
        </Stack>
      )}
    </section>
  );
}

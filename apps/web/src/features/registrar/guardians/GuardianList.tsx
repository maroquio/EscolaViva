import { Stack, Text, Title } from '@mantine/core';
import type { GuardianInList } from '@escolaviva/contracts/students';
import { REGISTRAR_ROUTES } from '../../../constants';
import { PAGE_PARAMS, usePage } from '../../../shared/api';
import { MISSING_VALUE, formatCpf } from '../../../shared/format';
import {
  CPF_LABEL,
  EMAIL_LABEL,
  GUARDIANS_LABEL,
  NAME_LABEL,
  PHONE_LABEL,
} from '../../../shared/labels/constants';
import { Empty } from '../../../shared/ui/Empty';
import { LoadFailed } from '../../../shared/ui/LoadFailed';
import { Loading } from '../../../shared/ui/Loading';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { Pagination } from '../../../shared/ui/Pagination';
import { Table, type Column } from '../../../shared/ui/Table';
import { IN_TOTAL, MUTED_TEXT } from '../../../shared/ui/constants';
import { REGISTRAR_OVERLINE } from '../constants';
import { useGuardians } from '../queries';
import { REGISTER_GUARDIAN_LABEL } from './constants';

const guardianColumns: Column<GuardianInList>[] = [
  { header: NAME_LABEL, cell: (guardian) => guardian.name },
  { header: CPF_LABEL, cell: (guardian) => formatCpf(guardian.cpf) },
  { header: EMAIL_LABEL, cell: (guardian) => guardian.email },
  { header: PHONE_LABEL, cell: (guardian) => guardian.phone ?? MISSING_VALUE },
];

const registerGuardian = { href: REGISTRAR_ROUTES.newGuardian, text: REGISTER_GUARDIAN_LABEL };

export function GuardianList(): React.ReactElement {
  const page = usePage();
  const guardians = useGuardians(page);

  if (guardians.isPending) return <Loading />;
  if (guardians.isError) {
    return <LoadFailed error={guardians.error} onRetry={() => void guardians.refetch()} />;
  }

  const { items, pages, total, size } = guardians.data;

  return (
    <>
      <PageHeader
        overline={REGISTRAR_OVERLINE}
        title={GUARDIANS_LABEL}
        summary="Quem responde por um aluno entra no sistema como usuário com papel de responsável. Cadastrar aqui cria o acesso; vincular a um aluno é feito na ficha dele."
        action={registerGuardian}
      />

      <Stack gap="md">
        <Stack gap={2}>
          <Title order={2}>Responsáveis da rede</Title>
          <Text size="sm" c={MUTED_TEXT}>
            {total} {IN_TOTAL}
          </Text>
        </Stack>

        {items.length === 0 ? (
          <Empty
            title="Nenhum responsável cadastrado"
            text="Sem responsáveis cadastrados, nenhum aluno pode ser acompanhado pelo portal."
            action={registerGuardian}
          />
        ) : (
          <>
            <Table
              caption="Responsáveis cadastrados"
              columns={guardianColumns}
              rows={items}
              rowKey={(guardian) => guardian.id}
            />
            <Pagination
              param={PAGE_PARAMS.default}
              page={page}
              pages={pages}
              total={total}
              shown={items.length}
              size={size}
              label="responsáveis"
            />
          </>
        )}
      </Stack>
    </>
  );
}

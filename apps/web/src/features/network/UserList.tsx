import { Badge, Stack, Text, Title } from '@mantine/core';
import type { UserInList } from '@escolaviva/contracts/network';
import { NETWORK_ROUTES } from '../../constants';
import { PAGE_PARAMS, usePage } from '../../shared/api';
import { MISSING_VALUE, formatCpf } from '../../shared/format';
import {
  CPF_LABEL,
  EMAIL_LABEL,
  NAME_LABEL,
  SITUATION_LABEL,
  USERS_LABEL,
} from '../../shared/labels/constants';
import { Empty } from '../../shared/ui/Empty';
import { LoadFailed } from '../../shared/ui/LoadFailed';
import { Loading } from '../../shared/ui/Loading';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Pagination } from '../../shared/ui/Pagination';
import { Table, type Column } from '../../shared/ui/Table';
import { IN_TOTAL, MUTED_TEXT, SOFT_BADGE } from '../../shared/ui/constants';
import {
  ACTIVITY_COLOURS,
  NETWORK_ACTIONS,
  NETWORK_OVERLINES,
  ROLES_LABEL,
  ROLE_LABELS,
  USER_ACTIVITY_LABELS,
} from './constants';
import { useNetworkUsers } from './queries';

const inviteUser = { href: NETWORK_ROUTES.newUser, text: NETWORK_ACTIONS.inviteUser };

const RolesWithTheirSchools = ({
  roles,
}: {
  readonly roles: UserInList['roles'];
}): React.ReactElement =>
  roles.length === 0 ? (
    <Text c={MUTED_TEXT}>{MISSING_VALUE}</Text>
  ) : (
    <Stack gap={2}>
      {roles.map((assignment) => (
        <Text key={`${assignment.schoolId}-${assignment.role}`} size="sm">
          {ROLE_LABELS[assignment.role]} · {assignment.schoolName}
        </Text>
      ))}
    </Stack>
  );

const columns: Column<UserInList>[] = [
  { header: NAME_LABEL, cell: (user) => user.name },
  { header: CPF_LABEL, cell: (user) => formatCpf(user.cpf) },
  { header: EMAIL_LABEL, cell: (user) => user.email },
  { header: ROLES_LABEL, cell: (user) => <RolesWithTheirSchools roles={user.roles} /> },
  {
    header: SITUATION_LABEL,
    cell: (user) => (
      <Badge
        color={user.active ? ACTIVITY_COLOURS.active : ACTIVITY_COLOURS.inactive}
        variant={SOFT_BADGE}
      >
        {user.active ? USER_ACTIVITY_LABELS.active : USER_ACTIVITY_LABELS.inactive}
      </Badge>
    ),
  },
];

export function UserList(): React.ReactElement {
  const page = usePage();
  const users = useNetworkUsers(page);

  if (users.isPending) return <Loading />;
  if (users.isError) {
    return <LoadFailed error={users.error} onRetry={() => void users.refetch()} />;
  }

  const { items, pages, total, size } = users.data;

  return (
    <>
      <PageHeader
        overline={NETWORK_OVERLINES.area}
        title={USERS_LABEL}
        summary="Todo acesso nasce aqui. O papel decide o que a pessoa vê, e ele existe sempre dentro de uma unidade: a mesma pessoa pode ser secretária em uma escola e responsável em outra."
        action={inviteUser}
      />

      <Stack gap="md">
        <Stack gap={2}>
          <Title order={2}>Quem tem acesso</Title>
          <Text size="sm" c={MUTED_TEXT}>
            {total} {IN_TOTAL}
          </Text>
        </Stack>

        {items.length === 0 ? (
          <Empty
            title="Nenhum usuário cadastrado"
            text="Convide a secretaria primeiro: é ela quem cadastra alunos, responsáveis e turmas."
            action={inviteUser}
          />
        ) : (
          <>
            <Table
              caption="Usuários da rede"
              columns={columns}
              rows={items}
              rowKey={(user) => user.id}
            />
            <Pagination
              param={PAGE_PARAMS.default}
              page={page}
              pages={pages}
              total={total}
              shown={items.length}
              size={size}
              label="usuários"
            />
          </>
        )}
      </Stack>
    </>
  );
}

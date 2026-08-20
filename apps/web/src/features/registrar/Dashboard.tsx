import { Stack } from '@mantine/core';
import { usePage } from '../../shared/api';
import { REGISTRAR_DASHBOARD_LABEL } from '../../shared/labels/constants';
import { LoadFailed } from '../../shared/ui/LoadFailed';
import { Loading } from '../../shared/ui/Loading';
import { PageHeader } from '../../shared/ui/PageHeader';
import { SchoolsInScope } from './SchoolsInScope';
import { ScopeTotals } from './ScopeTotals';
import { REGISTRAR_OVERLINE } from './constants';
import { useRegistrarDashboard } from './queries';

export function Dashboard(): React.ReactElement {
  const page = usePage();
  const dashboard = useRegistrarDashboard(page);

  if (dashboard.isPending) return <Loading />;
  if (dashboard.isError) {
    return <LoadFailed error={dashboard.error} onRetry={() => void dashboard.refetch()} />;
  }

  const { schools, currentYear, totals } = dashboard.data;

  return (
    <>
      <PageHeader
        overline={REGISTRAR_OVERLINE}
        title={REGISTRAR_DASHBOARD_LABEL}
        summary="O que existe nas unidades sob sua responsabilidade. Tudo o que a secretaria faz — matricular, transferir, criar turma — acontece dentro de uma delas."
      />

      <Stack gap="xl">
        <ScopeTotals currentYear={currentYear} totals={totals} />
        <SchoolsInScope schools={schools} page={page} />
      </Stack>
    </>
  );
}

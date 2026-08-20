import { Stack } from '@mantine/core';
import { LoadFailed } from '../../shared/ui/LoadFailed';
import { Loading } from '../../shared/ui/Loading';
import { PageHeader } from '../../shared/ui/PageHeader';
import { useSession } from '../session/queries';
import { AcademicYearInForce } from './AcademicYearInForce';
import { NetworkCounters } from './NetworkCounters';
import { NETWORK_OVERLINES } from './constants';
import { useNetworkDashboard } from './queries';

export function Dashboard(): React.ReactElement {
  const { data: signedInUser } = useSession();
  const dashboard = useNetworkDashboard();

  if (dashboard.isPending) return <Loading />;
  if (dashboard.isError) {
    return <LoadFailed error={dashboard.error} onRetry={() => void dashboard.refetch()} />;
  }

  const { counts, academicYear, definedYears } = dashboard.data;

  return (
    <>
      <PageHeader
        overline={NETWORK_OVERLINES.area}
        title={signedInUser?.networkName ?? NETWORK_OVERLINES.area}
        summary="A rede é o contorno de tudo o que este sistema mostra: nenhuma consulta atravessa para outra rede, e é daqui que saem as unidades, os acessos e o calendário que a secretaria usa."
      />

      <Stack gap="xl">
        <NetworkCounters counts={counts} academicYear={academicYear} />
        <AcademicYearInForce academicYear={academicYear} definedYears={definedYears} />
      </Stack>
    </>
  );
}

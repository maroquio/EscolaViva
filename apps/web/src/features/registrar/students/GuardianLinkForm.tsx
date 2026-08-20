import { Alert, Button, Checkbox, Group, NativeSelect, Paper, Stack, TextInput } from '@mantine/core';
import { Link, useParams } from 'react-router';
import { REGISTRAR_ROUTES } from '../../../constants';
import { CHOOSE } from '../../../shared/labels/constants';
import { Empty } from '../../../shared/ui/Empty';
import { LoadFailed } from '../../../shared/ui/LoadFailed';
import { Loading } from '../../../shared/ui/Loading';
import { PageHeader } from '../../../shared/ui/PageHeader';
import {
  ALERT_ROLE,
  CANCEL_LABEL,
  FORM_WIDTH,
  QUIET_BUTTON,
  REFUSAL_COLOUR,
  SUBMIT_BUTTON,
} from '../../../shared/ui/constants';
import { GUARDIAN_LINK_FIELD } from '../constants';
import { REGISTER_GUARDIAN_LABEL } from '../guardians/constants';
import { useAvailableGuardians } from '../queries';
import { studentRecordAddress } from './addresses';
import { guardianChoices, withPlaceholder } from './choices';
import {
  GUARDIAN_LABEL,
  LINK_GUARDIAN_LABEL,
  RELATIONSHIP_LABEL,
  STUDENT_OVERLINE,
} from './constants';
import { useGuardianLinkForm } from './useGuardianLinkForm';

function GuardianLinkHeader(): React.ReactElement {
  return (
    <PageHeader
      overline={STUDENT_OVERLINE}
      title={LINK_GUARDIAN_LABEL}
      summary="O responsável precisa já existir como usuário. É esse vínculo que faz o aluno aparecer no portal de quem responde por ele."
    />
  );
}

function NobodyLeftToLink(): React.ReactElement {
  return (
    <>
      <GuardianLinkHeader />
      <Empty
        title="Nenhum responsável disponível"
        text="Ou ninguém está cadastrado como responsável nesta rede, ou todos os cadastrados já estão vinculados a este aluno."
        action={{ href: REGISTRAR_ROUTES.newGuardian, text: REGISTER_GUARDIAN_LABEL }}
      />
    </>
  );
}

export function GuardianLinkForm(): React.ReactElement {
  const { id: studentId = '' } = useParams();
  const guardiansNotYetLinked = useAvailableGuardians(studentId);
  const form = useGuardianLinkForm(studentId);
  const recordAddress = studentRecordAddress(studentId);

  if (guardiansNotYetLinked.isPending) return <Loading />;
  if (guardiansNotYetLinked.isError) {
    return (
      <LoadFailed
        error={guardiansNotYetLinked.error}
        onRetry={() => void guardiansNotYetLinked.refetch()}
      />
    );
  }
  if (guardiansNotYetLinked.data.length === 0) return <NobodyLeftToLink />;

  return (
    <>
      <GuardianLinkHeader />

      <Paper p="lg" withBorder maw={FORM_WIDTH}>
        <form onSubmit={form.submit} noValidate>
          <Stack gap="md">
            {form.warning !== undefined && (
              <Alert color={REFUSAL_COLOUR} role={ALERT_ROLE}>
                {form.warning}
              </Alert>
            )}

            <NativeSelect
              label={GUARDIAN_LABEL}
              withAsterisk
              data={withPlaceholder(CHOOSE.guardian, guardianChoices(guardiansNotYetLinked.data))}
              error={form.errors.userId?.message}
              {...form.register(GUARDIAN_LINK_FIELD.userId)}
            />

            <TextInput
              label={RELATIONSHIP_LABEL}
              withAsterisk
              description="Como esta pessoa se relaciona com o aluno: mãe, pai, avó, tutor legal."
              error={form.errors.relationship?.message}
              {...form.register(GUARDIAN_LINK_FIELD.relationship)}
            />

            <Checkbox
              label="Responsável financeiro"
              {...form.register(GUARDIAN_LINK_FIELD.financiallyResponsible)}
            />

            <Group>
              <Button type={SUBMIT_BUTTON} loading={form.isLinking}>
                {LINK_GUARDIAN_LABEL}
              </Button>
              <Button component={Link} to={recordAddress} variant={QUIET_BUTTON}>
                {CANCEL_LABEL}
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>
    </>
  );
}

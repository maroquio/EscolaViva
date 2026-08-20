import { Alert, Button, Group, NativeSelect, Paper, Stack, TextInput } from '@mantine/core';
import { Link } from 'react-router';
import { REGISTRAR_ROUTES } from '../../../constants';
import {
  CHOOSE,
  CPF_LABEL,
  EMAIL_LABEL,
  NAME_LABEL,
  PHONE_LABEL,
  UNIT_LABEL,
} from '../../../shared/labels/constants';
import { PageHeader } from '../../../shared/ui/PageHeader';
import {
  ALERT_ROLE,
  CANCEL_LABEL,
  FORM_WIDTH,
  NEVER_CAPITALIZED,
  QUIET_BUTTON,
  REFUSAL_COLOUR,
  SUBMIT_BUTTON,
} from '../../../shared/ui/constants';
import { GUARDIAN_FIELD } from '../constants';
import { GuardianInvited } from './GuardianInvited';
import { GUARDIAN_OVERLINE, REGISTER_GUARDIAN_LABEL } from './constants';
import { useGuardianInvitation } from './useGuardianInvitation';

const NOTHING_CHOSEN = '';

export function GuardianForm(): React.ReactElement {
  const { invitation, register, errors, warning, schools, mustChooseSchool, isPending, submit } =
    useGuardianInvitation();

  if (invitation !== null) return <GuardianInvited invitation={invitation} />;

  return (
    <>
      <PageHeader
        overline={GUARDIAN_OVERLINE}
        title={REGISTER_GUARDIAN_LABEL}
        summary="A senha provisória é gerada agora e aparece uma única vez. Tenha onde anotá-la antes de enviar o formulário."
      />

      <Paper p="lg" withBorder maw={FORM_WIDTH}>
        <form onSubmit={submit} noValidate>
          <Stack gap="md">
            {warning !== undefined && (
              <Alert color={REFUSAL_COLOUR} role={ALERT_ROLE}>
                {warning}
              </Alert>
            )}

            <TextInput
              label={NAME_LABEL}
              withAsterisk
              error={errors.name?.message}
              {...register(GUARDIAN_FIELD.name)}
            />

            <TextInput
              label={CPF_LABEL}
              withAsterisk
              inputMode="numeric"
              description="É por ele que a pessoa entra. Com ou sem pontos."
              error={errors.cpf?.message}
              {...register(GUARDIAN_FIELD.cpf)}
            />

            <TextInput
              label={EMAIL_LABEL}
              withAsterisk
              type="email"
              autoCapitalize={NEVER_CAPITALIZED}
              spellCheck={false}
              error={errors.email?.message}
              {...register(GUARDIAN_FIELD.email)}
            />

            <TextInput
              label={PHONE_LABEL}
              error={errors.phone?.message}
              {...register(GUARDIAN_FIELD.phone)}
            />

            {mustChooseSchool && (
              <NativeSelect
                label={UNIT_LABEL}
                withAsterisk
                description="Em qual escola este responsável entra no portal."
                data={[
                  { value: NOTHING_CHOSEN, label: CHOOSE.unit },
                  ...schools.map((school) => ({ value: school.id, label: school.name })),
                ]}
                error={errors.schoolId?.message}
                {...register(GUARDIAN_FIELD.schoolId)}
              />
            )}

            <Group>
              <Button type={SUBMIT_BUTTON} loading={isPending}>
                {REGISTER_GUARDIAN_LABEL}
              </Button>
              <Button component={Link} to={REGISTRAR_ROUTES.guardians} variant={QUIET_BUTTON}>
                {CANCEL_LABEL}
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>
    </>
  );
}

import { Alert, Button, Group, Paper, Stack, TextInput } from '@mantine/core';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { NETWORK_ROUTES } from '../../constants';
import { applyRefusal } from '../../shared/api';
import { CPF_LABEL, EMAIL_LABEL, NAME_LABEL, PHONE_LABEL } from '../../shared/labels/constants';
import { LoadFailed } from '../../shared/ui/LoadFailed';
import { PageHeader } from '../../shared/ui/PageHeader';
import {
  ALERT_ROLE,
  CANCEL_LABEL,
  NEVER_CAPITALIZED,
  QUIET_BUTTON,
  REFUSAL_COLOUR,
  SUBMIT_BUTTON,
  WIDE_FORM_WIDTH,
} from '../../shared/ui/constants';
import { InvitationSent, type InvitationSentProps } from './InvitationSent';
import { RoleAssignments } from './RoleAssignments';
import { NETWORK_ACTIONS, NETWORK_OVERLINES, USER_FIELD } from './constants';
import { useInviteUser } from './mutations';
import { useSchoolOptions } from './queries';
import { BLANK_INVITATION, USER_FIELDS, userSchema, type UserValues } from './schemas';

export function UserForm(): React.ReactElement {
  const [invitationSent, setInvitationSent] = useState<InvitationSentProps | null>(null);
  const invite = useInviteUser();
  const schools = useSchoolOptions();

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<UserValues>({
    resolver: standardSchemaResolver(userSchema),
    defaultValues: BLANK_INVITATION,
  });

  const formWarning = errors.root?.message ?? errors.roleAssignments?.message;

  const submit = handleSubmit((values) => {
    invite.mutate(values, {
      onSuccess: (answer) => {
        setInvitationSent({ answer, invitee: { name: values.name, cpf: values.cpf } });
      },
      onError: (failure) => {
        applyRefusal(failure, setError, USER_FIELDS);
      },
    });
  });

  if (invitationSent !== null) return <InvitationSent {...invitationSent} />;

  if (schools.isError) {
    return <LoadFailed error={schools.error} onRetry={() => void schools.refetch()} />;
  }

  return (
    <>
      <PageHeader
        overline={NETWORK_OVERLINES.users}
        title={NETWORK_ACTIONS.inviteUser}
        summary="A senha provisória é gerada agora e aparece uma única vez, logo depois de criar. Tenha onde anotá-la antes de enviar o formulário."
      />

      <Paper p="lg" withBorder maw={WIDE_FORM_WIDTH}>
        <form onSubmit={(event) => void submit(event)} noValidate>
          <Stack gap="md">
            {formWarning !== undefined && (
              <Alert color={REFUSAL_COLOUR} role={ALERT_ROLE}>
                {formWarning}
              </Alert>
            )}

            <TextInput
              label={NAME_LABEL}
              withAsterisk
              error={errors.name?.message}
              {...register(USER_FIELD.name)}
            />

            <TextInput
              label={CPF_LABEL}
              withAsterisk
              inputMode="numeric"
              description="É por ele que a pessoa entra. Com ou sem pontos."
              error={errors.cpf?.message}
              {...register(USER_FIELD.cpf)}
            />

            <TextInput
              label={EMAIL_LABEL}
              withAsterisk
              type="email"
              autoCapitalize={NEVER_CAPITALIZED}
              spellCheck={false}
              description="Contato. Não é usado para entrar."
              error={errors.email?.message}
              {...register(USER_FIELD.email)}
            />

            <TextInput
              label={PHONE_LABEL}
              error={errors.phone?.message}
              {...register(USER_FIELD.phone)}
            />

            <RoleAssignments
              control={control}
              register={register}
              errors={errors}
              schoolOptions={schools.data}
              schoolOptionsArePending={schools.isPending}
            />

            <Group>
              <Button type={SUBMIT_BUTTON} loading={invite.isPending}>
                {NETWORK_ACTIONS.inviteUser}
              </Button>
              <Button component={Link} to={NETWORK_ROUTES.users} variant={QUIET_BUTTON}>
                {CANCEL_LABEL}
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>
    </>
  );
}

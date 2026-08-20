import { Alert, Button, Paper, PasswordInput, Stack, Title } from '@mantine/core';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useForm } from 'react-hook-form';
import { applyRefusal } from '../../shared/api';
import { CHANGE_PASSWORD_LABEL } from '../../shared/labels/constants';
import { ALERT_ROLE, REFUSAL_COLOUR, SUBMIT_BUTTON } from '../../shared/ui/constants';
import { useNotices } from '../../shared/ui/notices';
import { useChangePassword } from '../session/mutations';
import { PASSWORD_CHANGED, PASSWORD_CHANGE_FIELD, SHOW_OR_HIDE } from './constants';
import {
  PASSWORD_CHANGE_FIELDS,
  passwordChangeSchema,
  type PasswordChangeValues,
} from './schemas';

const EMPTY_PASSWORDS: PasswordChangeValues = {
  currentPassword: '',
  newPassword: '',
  passwordConfirmation: '',
};

export function PasswordChange(): React.ReactElement {
  const notices = useNotices();
  const passwordChange = useChangePassword();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<PasswordChangeValues>({
    resolver: standardSchemaResolver(passwordChangeSchema),
    defaultValues: EMPTY_PASSWORDS,
  });

  const warning = errors.root?.message;

  const submit = handleSubmit((typedPasswords) => {
    passwordChange.mutate(typedPasswords, {
      onSuccess: () => {
        reset(EMPTY_PASSWORDS);
        notices.success(PASSWORD_CHANGED);
      },
      onError: (failure) => {
        applyRefusal(failure, setError, PASSWORD_CHANGE_FIELDS);
      },
    });
  });

  return (
    <Paper p="lg" withBorder maw="30rem">
      <form onSubmit={(event) => void submit(event)} noValidate>
        <Stack gap="md">
          <Title order={1}>{CHANGE_PASSWORD_LABEL}</Title>

          {warning !== undefined && (
            <Alert color={REFUSAL_COLOUR} role={ALERT_ROLE}>
              {warning}
            </Alert>
          )}

          <PasswordInput
            label="Senha atual"
            autoComplete="current-password"
            visibilityToggleButtonProps={{ 'aria-label': SHOW_OR_HIDE.currentPassword }}
            error={errors.currentPassword?.message}
            {...register(PASSWORD_CHANGE_FIELD.currentPassword)}
          />

          <PasswordInput
            label="Senha nova"
            autoComplete="new-password"
            visibilityToggleButtonProps={{ 'aria-label': SHOW_OR_HIDE.newPassword }}
            error={errors.newPassword?.message}
            {...register(PASSWORD_CHANGE_FIELD.newPassword)}
          />

          <PasswordInput
            label="Confirme a senha nova"
            autoComplete="new-password"
            visibilityToggleButtonProps={{ 'aria-label': SHOW_OR_HIDE.passwordConfirmation }}
            error={errors.passwordConfirmation?.message}
            {...register(PASSWORD_CHANGE_FIELD.passwordConfirmation)}
          />

          <Button type={SUBMIT_BUTTON} loading={passwordChange.isPending}>
            {CHANGE_PASSWORD_LABEL}
          </Button>
        </Stack>
      </form>
    </Paper>
  );
}

import {
  Alert,
  Button,
  Container,
  Paper,
  PasswordInput,
  Stack,
  TextInput,
  Title,
} from '@mantine/core';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { initialDashboard } from '../../app/guards';
import { applyRefusal } from '../../shared/api';
import { CPF_LABEL, NETWORK_LABEL } from '../../shared/labels/constants';
import { ALERT_ROLE, REFUSAL_COLOUR, SUBMIT_BUTTON } from '../../shared/ui/constants';
import { SHOW_OR_HIDE_PASSWORD, SIGN_IN_FIELD } from './constants';
import { useSignIn } from './mutations';
import { useSession } from './queries';
import { SIGN_IN_FIELDS, signInSchema, type SignInValues } from './schemas';

const EMPTY_CREDENTIALS: SignInValues = { networkSlug: '', cpf: '', password: '' };

type ExpiredSessionState = { readonly cameFrom?: string };

export function SignInScreen(): React.ReactElement {
  const navigate = useNavigate();
  const cameFrom = (useLocation().state as ExpiredSessionState | null)?.cameFrom;
  const session = useSession();
  const signIn = useSignIn();
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors },
  } = useForm<SignInValues>({
    resolver: standardSchemaResolver(signInSchema),
    defaultValues: EMPTY_CREDENTIALS,
  });

  const warning = errors.root?.message;

  const submit = handleSubmit((credentials) => {
    signIn.mutate(credentials, {
      onSuccess: (signedInUser) => {
        void navigate(cameFrom ?? initialDashboard(signedInUser), { replace: true });
      },
      onError: (failure) => {
        setValue(SIGN_IN_FIELD.password, '');
        applyRefusal(failure, setError, SIGN_IN_FIELDS);
      },
    });
  });

  if (session.data !== undefined) {
    return <Navigate to={cameFrom ?? initialDashboard(session.data)} replace />;
  }

  return (
    <Container size="xs" py="xl">
      <Paper p="lg" withBorder>
        <form onSubmit={(event) => void submit(event)} noValidate>
          <Stack gap="md">
            <Title order={1}>Entrar</Title>

            {warning !== undefined && (
              <Alert color={REFUSAL_COLOUR} role={ALERT_ROLE}>
                {warning}
              </Alert>
            )}

            <TextInput
              label={NETWORK_LABEL}
              autoComplete="organization"
              error={errors.networkSlug?.message}
              {...register(SIGN_IN_FIELD.networkSlug)}
            />

            <TextInput
              label={CPF_LABEL}
              inputMode="numeric"
              autoComplete="username"
              error={errors.cpf?.message}
              {...register(SIGN_IN_FIELD.cpf)}
            />

            <PasswordInput
              label="Senha"
              autoComplete="current-password"
              visibilityToggleButtonProps={{ 'aria-label': SHOW_OR_HIDE_PASSWORD }}
              error={errors.password?.message}
              {...register(SIGN_IN_FIELD.password)}
            />

            <Button type={SUBMIT_BUTTON} loading={signIn.isPending}>
              Entrar
            </Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}

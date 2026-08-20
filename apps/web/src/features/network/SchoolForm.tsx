import { Alert, Button, Group, Paper, Stack, TextInput } from '@mantine/core';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { NETWORK_ROUTES } from '../../constants';
import { applyRefusal } from '../../shared/api';
import { NAME_LABEL } from '../../shared/labels/constants';
import { PageHeader } from '../../shared/ui/PageHeader';
import {
  ALERT_ROLE,
  CANCEL_LABEL,
  FORM_WIDTH,
  QUIET_BUTTON,
  REFUSAL_COLOUR,
  SUBMIT_BUTTON,
} from '../../shared/ui/constants';
import { useNotices } from '../../shared/ui/notices';
import {
  INEP_CODE_LABEL,
  NETWORK_ACTIONS,
  NETWORK_NOTICES,
  NETWORK_OVERLINES,
  SCHOOL_FIELD,
} from './constants';
import { useCreateSchool } from './mutations';
import { BLANK_SCHOOL, SCHOOL_FIELDS, schoolSchema, type SchoolValues } from './schemas';

export function SchoolForm(): React.ReactElement {
  const navigate = useNavigate();
  const notices = useNotices();
  const create = useCreateSchool();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SchoolValues>({
    resolver: standardSchemaResolver(schoolSchema),
    defaultValues: BLANK_SCHOOL,
  });

  const formWarning = errors.root?.message;

  const submit = handleSubmit((values) => {
    create.mutate(values, {
      onSuccess: () => {
        notices.success(NETWORK_NOTICES.schoolCreated);
        void navigate(NETWORK_ROUTES.schools);
      },
      onError: (failure) => {
        applyRefusal(failure, setError, SCHOOL_FIELDS);
      },
    });
  });

  return (
    <>
      <PageHeader
        overline={NETWORK_OVERLINES.schools}
        title={NETWORK_ACTIONS.newSchool}
        summary="A unidade é onde tudo o mais acontece: sem ela não há turma, papel nem comunicado. O nome precisa ser único dentro da rede."
      />

      <Paper p="lg" withBorder maw={FORM_WIDTH}>
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
              description="Como a escola é chamada no dia a dia."
              error={errors.name?.message}
              {...register(SCHOOL_FIELD.name)}
            />

            <TextInput
              label={INEP_CODE_LABEL}
              inputMode="numeric"
              description="Opcional. Pode ser preenchido depois."
              error={errors.inepCode?.message}
              {...register(SCHOOL_FIELD.inepCode)}
            />

            <Group>
              <Button type={SUBMIT_BUTTON} loading={create.isPending}>
                Criar escola
              </Button>
              <Button component={Link} to={NETWORK_ROUTES.schools} variant={QUIET_BUTTON}>
                {CANCEL_LABEL}
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>
    </>
  );
}

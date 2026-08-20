import { Alert, Button, Group, Paper, Stack, TextInput } from '@mantine/core';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { REGISTRAR_ROUTES } from '../../../constants';
import { applyRefusal } from '../../../shared/api';
import { NAME_LABEL } from '../../../shared/labels/constants';
import { PageHeader } from '../../../shared/ui/PageHeader';
import {
  ALERT_ROLE,
  CANCEL_LABEL,
  FORM_WIDTH,
  QUIET_BUTTON,
  REFUSAL_COLOUR,
  SUBMIT_BUTTON,
} from '../../../shared/ui/constants';
import { useNotices } from '../../../shared/ui/notices';
import { SUBJECT_FIELD } from '../class-groups/constants';
import { useRegisterSubject } from '../class-groups/mutations';
import { SUBJECT_FIELDS, subjectSchema, type SubjectValues } from '../class-groups/schemas';
import { REGISTRAR_NOTICES } from '../constants';
import { REGISTER_SUBJECT_LABEL, SUBJECT_OVERLINE } from './constants';

const BLANK_SUBJECT: SubjectValues = { name: '' };

export function SubjectForm(): React.ReactElement {
  const navigate = useNavigate();
  const notices = useNotices();
  const create = useRegisterSubject();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SubjectValues>({
    resolver: standardSchemaResolver(subjectSchema),
    defaultValues: BLANK_SUBJECT,
  });

  const warning = errors.root?.message;

  const submit = handleSubmit((values) => {
    create.mutate(values, {
      onSuccess: () => {
        notices.success(REGISTRAR_NOTICES.subjectRegistered);
        void navigate(REGISTRAR_ROUTES.subjects);
      },
      onError: (failure) => {
        applyRefusal(failure, setError, SUBJECT_FIELDS);
      },
    });
  });

  return (
    <>
      <PageHeader
        overline={SUBJECT_OVERLINE}
        title={REGISTER_SUBJECT_LABEL}
        summary="A disciplina vale para toda a rede. Depois de cadastrada, ela pode ser atribuída a qualquer turma, com um professor por turma."
      />

      <Paper p="lg" withBorder maw={FORM_WIDTH}>
        <form onSubmit={(event) => void submit(event)} noValidate>
          <Stack gap="md">
            {warning !== undefined && (
              <Alert color={REFUSAL_COLOUR} role={ALERT_ROLE}>
                {warning}
              </Alert>
            )}

            <TextInput label={NAME_LABEL} withAsterisk error={errors.name?.message} {...register(SUBJECT_FIELD.name)} />

            <Group>
              <Button type={SUBMIT_BUTTON} loading={create.isPending}>
                {REGISTER_SUBJECT_LABEL}
              </Button>
              <Button component={Link} to={REGISTRAR_ROUTES.subjects} variant={QUIET_BUTTON}>
                {CANCEL_LABEL}
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>
    </>
  );
}

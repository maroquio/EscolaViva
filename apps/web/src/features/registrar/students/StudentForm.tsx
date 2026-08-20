import { Alert, Button, Group, Paper, Stack, TextInput } from '@mantine/core';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import type { CreatedRecord } from '@escolaviva/contracts/students';
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
import { wasRepeated, type Written } from '../../network/mutations';
import { REGISTRAR_NOTICES, STUDENT_FIELD } from '../constants';
import { useRegisterStudent } from '../mutations';
import { STUDENT_FIELDS, studentSchema, type StudentValues } from '../schemas';
import { studentRecordAddress } from './addresses';
import { REGISTER_STUDENT_LABEL, STUDENT_OVERLINE } from './constants';

const BLANK_STUDENT: StudentValues = { name: '', birthDate: '' };

const whereToLandAfterRegistering = (registered: Written<CreatedRecord>): string =>
  wasRepeated(registered) ? REGISTRAR_ROUTES.students : studentRecordAddress(registered.id);

export function StudentForm(): React.ReactElement {
  const navigate = useNavigate();
  const notices = useNotices();
  const registration = useRegisterStudent();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<StudentValues>({
    resolver: standardSchemaResolver(studentSchema),
    defaultValues: BLANK_STUDENT,
  });

  const submissionError = errors.root?.message;

  const submit = handleSubmit((values) => {
    registration.mutate(values, {
      onSuccess: (registered) => {
        notices.success(REGISTRAR_NOTICES.studentRegistered);
        void navigate(whereToLandAfterRegistering(registered));
      },
      onError: (failure) => {
        applyRefusal(failure, setError, STUDENT_FIELDS);
      },
    });
  });

  return (
    <>
      <PageHeader
        overline={STUDENT_OVERLINE}
        title={REGISTER_STUDENT_LABEL}
        summary="O cadastro cria a pessoa; a matrícula é o passo seguinte e liga o aluno a uma turma e a um ano letivo."
      />

      <Paper p="lg" withBorder maw={FORM_WIDTH}>
        <form onSubmit={(event) => void submit(event)} noValidate>
          <Stack gap="md">
            {submissionError !== undefined && (
              <Alert color={REFUSAL_COLOUR} role={ALERT_ROLE}>
                {submissionError}
              </Alert>
            )}

            <TextInput label={NAME_LABEL} withAsterisk error={errors.name?.message} {...register(STUDENT_FIELD.name)} />

            <TextInput
              label="Data de nascimento"
              type="date"
              withAsterisk
              error={errors.birthDate?.message}
              {...register(STUDENT_FIELD.birthDate)}
            />

            <Group>
              <Button type={SUBMIT_BUTTON} loading={registration.isPending}>
                {REGISTER_STUDENT_LABEL}
              </Button>
              <Button component={Link} to={REGISTRAR_ROUTES.students} variant={QUIET_BUTTON}>
                {CANCEL_LABEL}
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>
    </>
  );
}

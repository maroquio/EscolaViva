import { Alert, Button, Group, Paper, Stack, TextInput } from '@mantine/core';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { NETWORK_ROUTES } from '../../constants';
import { applyRefusal } from '../../shared/api';
import { END_LABEL, START_LABEL } from '../../shared/labels/constants';
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
  ACADEMIC_YEAR_FIELD,
  NETWORK_ACTIONS,
  NETWORK_NOTICES,
  NETWORK_OVERLINES,
  YEAR_LABEL,
} from './constants';
import { useDefineAcademicYear } from './mutations';
import {
  ACADEMIC_YEAR_FIELDS,
  academicYearSchema,
  type AcademicYearValues,
} from './schemas';

export function AcademicYearForm(): React.ReactElement {
  const navigate = useNavigate();
  const notices = useNotices();
  const define = useDefineAcademicYear();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<AcademicYearValues>({
    resolver: standardSchemaResolver(academicYearSchema),
  });

  const formWarning = errors.root?.message;

  const submit = handleSubmit((values) => {
    define.mutate(values, {
      onSuccess: () => {
        notices.success(NETWORK_NOTICES.academicYearDefined);
        void navigate(NETWORK_ROUTES.academicYears);
      },
      onError: (failure) => {
        applyRefusal(failure, setError, ACADEMIC_YEAR_FIELDS);
      },
    });
  });

  return (
    <>
      <PageHeader
        overline={NETWORK_OVERLINES.academicYears}
        title={NETWORK_ACTIONS.defineAcademicYear}
        summary="O ano letivo delimita as matrículas. Enquanto não houver um definido, a secretaria não consegue criar turmas nem matricular alunos."
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
              label={YEAR_LABEL}
              type="number"
              withAsterisk
              error={errors.year?.message}
              {...register(ACADEMIC_YEAR_FIELD.year, { valueAsNumber: true })}
            />

            <TextInput
              label={START_LABEL}
              type="date"
              withAsterisk
              error={errors.startDate?.message}
              {...register(ACADEMIC_YEAR_FIELD.startDate)}
            />

            <TextInput
              label={END_LABEL}
              type="date"
              withAsterisk
              error={errors.endDate?.message}
              {...register(ACADEMIC_YEAR_FIELD.endDate)}
            />

            <Group>
              <Button type={SUBMIT_BUTTON} loading={define.isPending}>
                {NETWORK_ACTIONS.defineAcademicYear}
              </Button>
              <Button component={Link} to={NETWORK_ROUTES.academicYears} variant={QUIET_BUTTON}>
                {CANCEL_LABEL}
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>
    </>
  );
}

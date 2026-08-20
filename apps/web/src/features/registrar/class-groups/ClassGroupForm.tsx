import { Alert, Button, Group, NativeSelect, Paper, Stack, TextInput } from '@mantine/core';
import { Link } from 'react-router';
import { SHIFTS, type Shift } from '@escolaviva/contracts/enumerations';
import { REGISTRAR_ROUTES } from '../../../constants';
import {
  ACADEMIC_YEAR_LABEL,
  GRADE_LEVEL_LABEL,
  NAME_LABEL,
  SCHOOL_LABEL,
  SHIFT_LABEL,
  SHIFT_LABELS,
} from '../../../shared/labels/constants';
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
import { useSchoolOptions } from '../../network/queries';
import { useAcademicYearOptions } from '../queries';
import {
  CLASS_GROUP_CHOICES,
  CLASS_GROUP_FIELD,
  CLASS_GROUP_OVERLINE,
  CREATE_CLASS_GROUP_LABEL,
} from './constants';
import { NOTHING_CHOSEN, useClassGroupForm } from './useClassGroupForm';

const SHIFT_OPTIONS: { value: Shift; label: string }[] = SHIFTS.map((shift) => ({
  value: shift,
  label: SHIFT_LABELS[shift],
}));

const optionsFrom = <T extends { readonly id: string }>(
  invitation: string,
  chooseable: readonly T[],
  labelOf: (choice: T) => string,
): { value: string; label: string }[] => [
  { value: NOTHING_CHOSEN, label: invitation },
  ...chooseable.map((choice) => ({ value: choice.id, label: labelOf(choice) })),
];

export function ClassGroupForm(): React.ReactElement {
  const schools = useSchoolOptions();
  const years = useAcademicYearOptions();
  const form = useClassGroupForm();

  if (schools.isPending || years.isPending) return <Loading />;
  if (schools.isError) return <LoadFailed error={schools.error} onRetry={() => void schools.refetch()} />;
  if (years.isError) return <LoadFailed error={years.error} onRetry={() => void years.refetch()} />;

  return (
    <>
      <PageHeader
        overline={CLASS_GROUP_OVERLINE}
        title={CREATE_CLASS_GROUP_LABEL}
        summary="A turma pertence a uma escola e a um ano letivo, e os dois são definitivos: uma turma de 2026 não passa para 2027 — a de 2027 é outra."
      />

      <Paper p="lg" withBorder maw={FORM_WIDTH}>
        <form onSubmit={form.submit} noValidate>
          <Stack gap="md">
            {form.warning !== undefined && (
              <Alert color={REFUSAL_COLOUR} role={ALERT_ROLE}>
                {form.warning}
              </Alert>
            )}

            <TextInput
              label={NAME_LABEL}
              withAsterisk
              description="Como a turma é chamada no dia a dia: 3º ano A."
              error={form.errors.name?.message}
              {...form.register(CLASS_GROUP_FIELD.name)}
            />

            <TextInput
              label={GRADE_LEVEL_LABEL}
              withAsterisk
              description="O ano escolar: 3º ano, 1ª série do ensino médio."
              error={form.errors.gradeLevel?.message}
              {...form.register(CLASS_GROUP_FIELD.gradeLevel)}
            />

            <NativeSelect
              label={SHIFT_LABEL}
              withAsterisk
              data={SHIFT_OPTIONS}
              error={form.errors.shift?.message}
              {...form.register(CLASS_GROUP_FIELD.shift)}
            />

            <NativeSelect
              label={SCHOOL_LABEL}
              withAsterisk
              data={optionsFrom(CLASS_GROUP_CHOICES.school, schools.data, (school) => school.name)}
              error={form.errors.schoolId?.message}
              {...form.register(CLASS_GROUP_FIELD.schoolId)}
            />

            <NativeSelect
              label={ACADEMIC_YEAR_LABEL}
              withAsterisk
              data={optionsFrom(CLASS_GROUP_CHOICES.academicYear, years.data, (year) => String(year.year))}
              error={form.errors.academicYearId?.message}
              {...form.register(CLASS_GROUP_FIELD.academicYearId)}
            />

            <Group>
              <Button type={SUBMIT_BUTTON} loading={form.isCreating}>
                {CREATE_CLASS_GROUP_LABEL}
              </Button>
              <Button component={Link} to={REGISTRAR_ROUTES.classGroups} variant={QUIET_BUTTON}>
                {CANCEL_LABEL}
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>
    </>
  );
}

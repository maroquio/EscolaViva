import { Alert, Button, Group, NativeSelect, Paper, Stack, TextInput } from '@mantine/core';
import { Link, useParams } from 'react-router';
import { REGISTRAR_ROUTES } from '../../../constants';
import { ACADEMIC_YEAR_LABEL, CHOOSE, CLASS_GROUP_LABEL } from '../../../shared/labels/constants';
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
import { CREATE_CLASS_GROUP_LABEL } from '../class-groups/constants';
import { ENROLLMENT_FIELD } from '../constants';
import { useAcademicYearOptions, useClassGroupOptions } from '../queries';
import { studentRecordAddress } from './addresses';
import { academicYearChoices, classGroupChoices, withPlaceholder } from './choices';
import { ENROLL_LABEL, STUDENT_OVERLINE } from './constants';
import { useEnrollmentForm } from './useEnrollmentForm';

function EnrollmentHeader(): React.ReactElement {
  return (
    <PageHeader
      overline={STUDENT_OVERLINE}
      title="Matricular aluno"
      summary="A matrícula liga o aluno a uma turma dentro de um ano letivo. É ela que faz o aluno aparecer na chamada, no boletim e no portal do responsável."
    />
  );
}

function NoClassGroupToEnrollInto(): React.ReactElement {
  return (
    <>
      <EnrollmentHeader />
      <Empty
        title="Nenhuma turma disponível"
        text="Não há turmas abertas nas unidades sob sua responsabilidade. Crie a turma antes de matricular."
        action={{ href: REGISTRAR_ROUTES.newClassGroup, text: CREATE_CLASS_GROUP_LABEL }}
      />
    </>
  );
}

export function EnrollmentForm(): React.ReactElement {
  const { id: studentId = '' } = useParams();
  const classGroups = useClassGroupOptions();
  const academicYears = useAcademicYearOptions();
  const form = useEnrollmentForm(studentId);
  const recordAddress = studentRecordAddress(studentId);

  if (classGroups.isPending || academicYears.isPending) return <Loading />;
  if (classGroups.isError) {
    return <LoadFailed error={classGroups.error} onRetry={() => void classGroups.refetch()} />;
  }
  if (academicYears.isError) {
    return <LoadFailed error={academicYears.error} onRetry={() => void academicYears.refetch()} />;
  }
  if (classGroups.data.length === 0) return <NoClassGroupToEnrollInto />;

  return (
    <>
      <EnrollmentHeader />

      <Paper p="lg" withBorder maw={FORM_WIDTH}>
        <form onSubmit={form.submit} noValidate>
          <Stack gap="md">
            {form.warning !== undefined && (
              <Alert color={REFUSAL_COLOUR} role={ALERT_ROLE}>
                {form.warning}
              </Alert>
            )}

            <NativeSelect
              label={CLASS_GROUP_LABEL}
              withAsterisk
              data={withPlaceholder(CHOOSE.classGroup, classGroupChoices(classGroups.data))}
              error={form.errors.classGroupId?.message}
              {...form.register(ENROLLMENT_FIELD.classGroupId)}
            />

            <NativeSelect
              label={ACADEMIC_YEAR_LABEL}
              withAsterisk
              data={withPlaceholder(CHOOSE.academicYear, academicYearChoices(academicYears.data))}
              error={form.errors.academicYearId?.message}
              {...form.register(ENROLLMENT_FIELD.academicYearId)}
            />

            <TextInput
              label="Data da matrícula"
              type="date"
              withAsterisk
              error={form.errors.enrollmentDate?.message}
              {...form.register(ENROLLMENT_FIELD.enrollmentDate)}
            />

            <Group>
              <Button type={SUBMIT_BUTTON} loading={form.isEnrolling}>
                {ENROLL_LABEL}
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

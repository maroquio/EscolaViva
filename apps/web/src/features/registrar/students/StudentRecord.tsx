import { Anchor, Button, Card, Group, Stack, Text } from '@mantine/core';
import { Link, useParams } from 'react-router';
import type { EnrollmentInList } from '@escolaviva/contracts/shared';
import type { StudentAsJson } from '@escolaviva/contracts/students';
import { REGISTRAR_ROUTES } from '../../../constants';
import { PAGE_PARAMS, isNotFound, usePage } from '../../../shared/api';
import { MISSING_VALUE, formatDate } from '../../../shared/format';
import { Empty } from '../../../shared/ui/Empty';
import { LoadFailed } from '../../../shared/ui/LoadFailed';
import { Loading } from '../../../shared/ui/Loading';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { MUTED_TEXT, NOTHING_TO_SHOW_TITLE, SECONDARY_BUTTON } from '../../../shared/ui/constants';
import { useStudentRecord } from '../queries';
import { EnrollmentsSection } from './EnrollmentsSection';
import { GuardiansSection } from './GuardiansSection';
import { enrollAddress, transferAddress } from './addresses';
import {
  BACK_TO_SEARCH_LABEL,
  BIRTH_DATE_LABEL,
  ENROLL_LABEL,
  STUDENT_OVERLINE,
  TRANSFER_LABEL,
} from './constants';

function StudentOutsideThisScope(): React.ReactElement {
  return (
    <>
      <PageHeader
        overline={STUDENT_OVERLINE}
        title="Aluno não encontrado"
        summary="Este aluno não existe ou não está em nenhuma das unidades sob sua responsabilidade."
      />
      <Empty
        title={NOTHING_TO_SHOW_TITLE}
        text="Se o aluno estudou em outra unidade da rede, quem responde por ela consegue abrir a ficha."
        action={{ href: REGISTRAR_ROUTES.students, text: BACK_TO_SEARCH_LABEL }}
      />
    </>
  );
}

function StudentSummary({
  student,
  activeEnrollment,
}: {
  readonly student: StudentAsJson;
  readonly activeEnrollment: EnrollmentInList | null;
}): React.ReactElement {
  return (
    <Card withBorder>
      <Group gap="xl">
        <Stack gap={2}>
          <Text size="xs" c={MUTED_TEXT}>
            {BIRTH_DATE_LABEL}
          </Text>
          <Text>{formatDate(student.birthDate)}</Text>
        </Stack>
        <Stack gap={2}>
          <Text size="xs" c={MUTED_TEXT}>
            Matrícula ativa
          </Text>
          {activeEnrollment === null ? (
            <Text c={MUTED_TEXT}>{MISSING_VALUE}</Text>
          ) : (
            <Text>
              {activeEnrollment.classGroupName} · {activeEnrollment.year}
            </Text>
          )}
        </Stack>
        {activeEnrollment !== null && (
          <Button component={Link} to={transferAddress(activeEnrollment.id)} variant={SECONDARY_BUTTON}>
            {TRANSFER_LABEL}
          </Button>
        )}
      </Group>
    </Card>
  );
}

export function StudentRecord(): React.ReactElement {
  const { id: studentId = '' } = useParams();
  const guardiansPage = usePage(PAGE_PARAMS.guardians);
  const enrollmentsPage = usePage(PAGE_PARAMS.enrollments);
  const record = useStudentRecord(studentId, guardiansPage, enrollmentsPage);

  if (record.isPending) return <Loading />;
  if (record.isError) {
    if (isNotFound(record.error)) return <StudentOutsideThisScope />;
    return <LoadFailed error={record.error} onRetry={() => void record.refetch()} />;
  }

  const { student, guardians, enrollments, active: activeEnrollment } = record.data;

  return (
    <>
      <PageHeader
        overline={STUDENT_OVERLINE}
        title={student.name}
        summary="A ficha reúne quem responde pelo aluno e todo o histórico de matrículas. A matrícula ativa é a única que pode ser transferida."
        action={{ href: enrollAddress(student.id), text: ENROLL_LABEL }}
      />

      <Stack gap="xl">
        <StudentSummary student={student} activeEnrollment={activeEnrollment} />
        <GuardiansSection student={student} guardians={guardians} page={guardiansPage} />
        <EnrollmentsSection student={student} enrollments={enrollments} page={enrollmentsPage} />

        <Anchor component={Link} to={REGISTRAR_ROUTES.students}>
          {BACK_TO_SEARCH_LABEL}
        </Anchor>
      </Stack>
    </>
  );
}

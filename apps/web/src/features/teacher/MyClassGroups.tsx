import { Anchor, Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { Link, generatePath } from 'react-router';
import type { TeacherClassGroup, TeacherSubject } from '@escolaviva/contracts/teacher';
import { TEACHER_ROUTES } from '../../constants';
import {
  ATTENDANCE_LABEL,
  MY_CLASS_GROUPS_LABEL,
  SHIFT_LABELS,
} from '../../shared/labels/constants';
import { Empty } from '../../shared/ui/Empty';
import { LoadFailed } from '../../shared/ui/LoadFailed';
import { Loading } from '../../shared/ui/Loading';
import { PageHeader } from '../../shared/ui/PageHeader';
import {
  ALIGNED_AT_THE_TOP,
  MUTED_TEXT,
  SECONDARY_BUTTON,
  SPREAD_APART,
} from '../../shared/ui/constants';
import { TEACHER_OVERLINE } from './constants';
import { useTeacherClassGroups } from './queries';

function SubjectsYouTeachHere({
  subjects,
}: {
  readonly subjects: readonly TeacherSubject[];
}): React.ReactElement {
  if (subjects.length === 0) {
    return (
      <Text size="sm" c={MUTED_TEXT}>
        Nenhuma disciplina sua nesta turma.
      </Text>
    );
  }

  return (
    <Group gap="md">
      {subjects.map((subject) => (
        <Anchor
          key={subject.id}
          component={Link}
          to={generatePath(TEACHER_ROUTES.grades, { classGroupSubjectId: subject.id })}
        >
          Notas de {subject.subjectName}
        </Anchor>
      ))}
    </Group>
  );
}

function ClassGroupCard({
  classGroup,
}: {
  readonly classGroup: TeacherClassGroup;
}): React.ReactElement {
  const { classGroupId } = classGroup;

  return (
    <Card withBorder>
      <Stack gap="sm">
        <Group justify={SPREAD_APART} align={ALIGNED_AT_THE_TOP}>
          <Stack gap={2}>
            <Title order={2} size="h4">
              {classGroup.classGroupName}
            </Title>
            <Text size="sm" c={MUTED_TEXT}>
              {classGroup.gradeLevel} · {SHIFT_LABELS[classGroup.shift]}
            </Text>
          </Stack>

          <Group gap="xs">
            <Button
              component={Link}
              to={generatePath(TEACHER_ROUTES.rollCall, { classGroupId })}
              variant={SECONDARY_BUTTON}
              size="xs"
            >
              {ATTENDANCE_LABEL}
            </Button>
            <Button
              component={Link}
              to={generatePath(TEACHER_ROUTES.closing, { classGroupId })}
              variant={SECONDARY_BUTTON}
              size="xs"
            >
              Fechamento
            </Button>
          </Group>
        </Group>

        <SubjectsYouTeachHere subjects={classGroup.subjects} />
      </Stack>
    </Card>
  );
}

export function MyClassGroups(): React.ReactElement {
  const classGroups = useTeacherClassGroups();

  if (classGroups.isPending) return <Loading />;
  if (classGroups.isError) {
    return <LoadFailed error={classGroups.error} onRetry={() => void classGroups.refetch()} />;
  }

  return (
    <>
      <PageHeader
        overline={TEACHER_OVERLINE}
        title={MY_CLASS_GROUPS_LABEL}
        summary="As turmas em que você tem disciplina atribuída. A frequência é da turma; as notas são de cada disciplina."
      />

      {classGroups.data.length === 0 ? (
        <Empty
          title="Nenhuma turma atribuída"
          text="Você ainda não tem disciplina atribuída em nenhuma turma. Quem faz essa atribuição é a secretaria da escola."
        />
      ) : (
        <Stack gap="md">
          {classGroups.data.map((classGroup) => (
            <ClassGroupCard key={classGroup.classGroupId} classGroup={classGroup} />
          ))}
        </Stack>
      )}
    </>
  );
}

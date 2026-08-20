import { Anchor, Card, Group, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { Link, generatePath, useParams } from 'react-router';
import type { ClassGroupInList } from '@escolaviva/contracts/classGroups';
import { REGISTRAR_ROUTES } from '../../../constants';
import { PAGE_PARAMS, isNotFound, usePage } from '../../../shared/api';
import { MISSING_VALUE } from '../../../shared/format';
import {
  ACADEMIC_YEAR_LABEL,
  CLASS_GROUP_NOT_FOUND,
  GRADE_LEVEL_LABEL,
  SCHOOL_LABEL,
  SHIFT_LABEL,
  SHIFT_LABELS,
} from '../../../shared/labels/constants';
import { Empty } from '../../../shared/ui/Empty';
import { LoadFailed } from '../../../shared/ui/LoadFailed';
import { Loading } from '../../../shared/ui/Loading';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { MUTED_TEXT, NOTHING_TO_SHOW_TITLE } from '../../../shared/ui/constants';
import { ActiveEnrollmentsSection } from './ActiveEnrollmentsSection';
import { AssignmentsSection } from './AssignmentsSection';
import {
  ASSIGN_SUBJECT_LABEL,
  BACK_TO_CLASS_GROUPS_LABEL,
  CLASS_GROUP_OVERLINE,
} from './constants';
import { useClassGroupRecord } from './queries';

function ClassGroupNotFound(): React.ReactElement {
  return (
    <>
      <PageHeader
        overline={CLASS_GROUP_OVERLINE}
        title={CLASS_GROUP_NOT_FOUND}
        summary="Esta turma não existe ou não está em nenhuma das unidades sob sua responsabilidade."
      />
      <Empty
        title={NOTHING_TO_SHOW_TITLE}
        text="Se a turma pertence a outra unidade da rede, quem responde por ela consegue abri-la."
        action={{ href: REGISTRAR_ROUTES.classGroups, text: BACK_TO_CLASS_GROUPS_LABEL }}
      />
    </>
  );
}

type FactProps = { readonly label: string; readonly value: ReactNode };

function Fact({ label, value }: FactProps): React.ReactElement {
  return (
    <Stack gap={2}>
      <Text size="xs" c={MUTED_TEXT}>
        {label}
      </Text>
      <Text>{value}</Text>
    </Stack>
  );
}

function ClassGroupFacts({
  classGroup,
}: {
  readonly classGroup: ClassGroupInList;
}): React.ReactElement {
  return (
    <Card withBorder>
      <Group gap="xl">
        <Fact label={GRADE_LEVEL_LABEL} value={classGroup.gradeLevel} />
        <Fact label={SHIFT_LABEL} value={SHIFT_LABELS[classGroup.shift]} />
        <Fact label={SCHOOL_LABEL} value={classGroup.schoolName} />
        <Fact label={ACADEMIC_YEAR_LABEL} value={classGroup.year ?? MISSING_VALUE} />
      </Group>
    </Card>
  );
}

export function ClassGroupRecord(): React.ReactElement {
  const { id = '' } = useParams();
  const subjectsPage = usePage(PAGE_PARAMS.subjects);
  const enrollmentsPage = usePage(PAGE_PARAMS.enrollments);
  const record = useClassGroupRecord(id, subjectsPage, enrollmentsPage);

  if (record.isPending) return <Loading />;

  if (record.isError) {
    if (isNotFound(record.error)) return <ClassGroupNotFound />;
    return <LoadFailed error={record.error} onRetry={() => void record.refetch()} />;
  }

  const { classGroup, assignments, enrollments } = record.data;
  const assignSubjectRoute = generatePath(REGISTRAR_ROUTES.newClassGroupSubject, {
    id: classGroup.id,
  });

  return (
    <>
      <PageHeader
        overline={CLASS_GROUP_OVERLINE}
        title={classGroup.name}
        summary="Cada disciplina da turma precisa de um professor atribuído: é essa atribuição que faz a turma aparecer para ele lançar frequência e notas."
        action={{ href: assignSubjectRoute, text: ASSIGN_SUBJECT_LABEL }}
      />

      <Stack gap="xl">
        <ClassGroupFacts classGroup={classGroup} />

        <AssignmentsSection
          classGroupName={classGroup.name}
          assignments={assignments}
          page={subjectsPage}
          assignSubjectRoute={assignSubjectRoute}
        />

        <ActiveEnrollmentsSection
          classGroupName={classGroup.name}
          enrollments={enrollments}
          page={enrollmentsPage}
        />

        <Anchor component={Link} to={REGISTRAR_ROUTES.classGroups}>
          {BACK_TO_CLASS_GROUPS_LABEL}
        </Anchor>
      </Stack>
    </>
  );
}

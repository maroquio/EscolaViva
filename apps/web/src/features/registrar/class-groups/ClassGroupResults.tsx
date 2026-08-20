import { Stack, Text, Title } from '@mantine/core';
import { Link, generatePath } from 'react-router';
import type { ClassGroupInList } from '@escolaviva/contracts/classGroups';
import { REGISTRAR_ROUTES } from '../../../constants';
import { PAGE_PARAMS } from '../../../shared/api';
import { MISSING_VALUE } from '../../../shared/format';
import {
  CLASS_GROUPS_LABEL,
  CLASS_GROUP_LABEL,
  GRADE_LEVEL_LABEL,
  SCHOOL_LABEL,
  SHIFT_LABEL,
  SHIFT_LABELS,
  YEAR_LABEL,
} from '../../../shared/labels/constants';
import { Empty } from '../../../shared/ui/Empty';
import { LoadFailed } from '../../../shared/ui/LoadFailed';
import { Loading } from '../../../shared/ui/Loading';
import { Pagination } from '../../../shared/ui/Pagination';
import { Table, type Column } from '../../../shared/ui/Table';
import { IN_TOTAL, MUTED_TEXT, NUMBERS_RIGHT } from '../../../shared/ui/constants';
import { CREATE_CLASS_GROUP_LABEL } from './constants';
import { useClassGroups } from './queries';

const classGroupColumns: Column<ClassGroupInList>[] = [
  {
    header: CLASS_GROUP_LABEL,
    cell: (classGroup) => (
      <Link to={generatePath(REGISTRAR_ROUTES.classGroup, { id: classGroup.id })}>
        {classGroup.name}
      </Link>
    ),
  },
  { header: GRADE_LEVEL_LABEL, cell: (classGroup) => classGroup.gradeLevel },
  { header: SHIFT_LABEL, cell: (classGroup) => SHIFT_LABELS[classGroup.shift] },
  { header: SCHOOL_LABEL, cell: (classGroup) => classGroup.schoolName },
  { header: YEAR_LABEL, cell: (classGroup) => classGroup.year ?? MISSING_VALUE, align: NUMBERS_RIGHT },
];

export type ClassGroupResultsProps = {
  readonly classGroups: ReturnType<typeof useClassGroups>;
  readonly page: number;
};

export function ClassGroupResults({
  classGroups,
  page,
}: ClassGroupResultsProps): React.ReactElement {
  if (classGroups.isPending) return <Loading />;
  if (classGroups.isError) {
    return <LoadFailed error={classGroups.error} onRetry={() => void classGroups.refetch()} />;
  }

  const { items, pages, total, size } = classGroups.data;

  if (items.length === 0) {
    return (
      <Empty
        title="Nenhuma turma encontrada"
        text="Não há turmas para este filtro. Limpe os filtros para ver todas, ou crie a primeira turma."
        action={{ href: REGISTRAR_ROUTES.newClassGroup, text: CREATE_CLASS_GROUP_LABEL }}
      />
    );
  }

  return (
    <>
      <Stack gap={2}>
        <Title order={2} size="h4">
          {CLASS_GROUPS_LABEL}
        </Title>
        <Text size="sm" c={MUTED_TEXT}>
          {total} {IN_TOTAL}
        </Text>
      </Stack>
      <Table
        caption="Turmas da rede"
        columns={classGroupColumns}
        rows={items}
        rowKey={(classGroup) => classGroup.id}
      />
      <Pagination
        param={PAGE_PARAMS.default}
        page={page}
        pages={pages}
        total={total}
        shown={items.length}
        size={size}
        label="turmas"
      />
    </>
  );
}

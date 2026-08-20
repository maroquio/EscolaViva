import { Text, Title } from '@mantine/core';
import { Link } from 'react-router';
import type { StudentInList } from '@escolaviva/contracts/students';
import { PAGE_PARAMS } from '../../../shared/api';
import { MISSING_VALUE, formatDate } from '../../../shared/format';
import { CLASS_GROUP_LABEL, STUDENT_LABEL, YEAR_LABEL } from '../../../shared/labels/constants';
import { Empty } from '../../../shared/ui/Empty';
import { LoadFailed } from '../../../shared/ui/LoadFailed';
import { Loading } from '../../../shared/ui/Loading';
import { Pagination } from '../../../shared/ui/Pagination';
import { Table, type Column } from '../../../shared/ui/Table';
import { MUTED_TEXT, NUMBERS_RIGHT } from '../../../shared/ui/constants';
import { StatusTag } from '../StatusTag';
import { ENROLMENT_LABEL } from '../constants';
import { useStudentSearch } from '../queries';
import { studentRecordAddress } from './addresses';
import { BIRTH_DATE_LABEL, REGISTER_STUDENT_ACTION } from './constants';

const studentColumns: Column<StudentInList>[] = [
  {
    header: STUDENT_LABEL,
    cell: (student) => <Link to={studentRecordAddress(student.id)}>{student.name}</Link>,
  },
  { header: BIRTH_DATE_LABEL, cell: (student) => formatDate(student.birthDate) },
  { header: CLASS_GROUP_LABEL, cell: (student) => student.classGroupName ?? MISSING_VALUE },
  { header: YEAR_LABEL, cell: (student) => student.year ?? MISSING_VALUE, align: NUMBERS_RIGHT },
  { header: ENROLMENT_LABEL, cell: (student) => <StatusTag status={student.status} /> },
];

export type SearchResultsProps = {
  readonly term: string;
  readonly students: ReturnType<typeof useStudentSearch>;
  readonly page: number;
};

export function SearchResults({ term, students, page }: SearchResultsProps): React.ReactElement {
  if (students.isPending) return <Loading />;
  if (students.isError) {
    return <LoadFailed error={students.error} onRetry={() => void students.refetch()} />;
  }

  const { items, pages, total, size } = students.data;

  if (items.length === 0) {
    return (
      <Empty
        title={`Nenhum aluno encontrado para "${term}"`}
        text="Confira a grafia do nome, ou cadastre o aluno se ele ainda não existe."
        action={REGISTER_STUDENT_ACTION}
      />
    );
  }

  return (
    <>
      <Title order={2} size="h4">
        Resultados
      </Title>
      <Text size="sm" c={MUTED_TEXT}>
        {total} aluno(s) encontrado(s)
      </Text>
      <Table
        caption={`Alunos encontrados para "${term}"`}
        columns={studentColumns}
        rows={items}
        rowKey={(student) => student.id}
      />
      <Pagination
        param={PAGE_PARAMS.default}
        page={page}
        pages={pages}
        total={total}
        shown={items.length}
        size={size}
        label="alunos"
      />
    </>
  );
}

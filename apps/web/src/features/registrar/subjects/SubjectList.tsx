import { Stack, Text, Title } from '@mantine/core';
import type { SubjectInList } from '@escolaviva/contracts/classGroups';
import { REGISTRAR_ROUTES } from '../../../constants';
import { PAGE_PARAMS, usePage } from '../../../shared/api';
import { SUBJECTS_COUNTED, SUBJECTS_LABEL, SUBJECT_LABEL } from '../../../shared/labels/constants';
import { Empty } from '../../../shared/ui/Empty';
import { LoadFailed } from '../../../shared/ui/LoadFailed';
import { Loading } from '../../../shared/ui/Loading';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { Pagination } from '../../../shared/ui/Pagination';
import { Table, type Column } from '../../../shared/ui/Table';
import { IN_TOTAL, MUTED_TEXT } from '../../../shared/ui/constants';
import { useSubjects } from '../class-groups/queries';
import { REGISTRAR_OVERLINE } from '../constants';
import { REGISTER_SUBJECT_LABEL } from './constants';

const subjectColumns: Column<SubjectInList>[] = [
  { header: SUBJECT_LABEL, cell: (subject) => subject.name },
];

const registerSubject = { href: REGISTRAR_ROUTES.newSubject, text: REGISTER_SUBJECT_LABEL };

export function SubjectList(): React.ReactElement {
  const page = usePage();
  const subjects = useSubjects(page);

  if (subjects.isPending) return <Loading />;
  if (subjects.isError) {
    return <LoadFailed error={subjects.error} onRetry={() => void subjects.refetch()} />;
  }

  const { items, pages, total, size } = subjects.data;

  return (
    <>
      <PageHeader
        overline={REGISTRAR_OVERLINE}
        title={SUBJECTS_LABEL}
        summary="A disciplina pertence à rede inteira: Matemática é a mesma em todas as unidades. O que a liga a uma turma e a um professor é a atribuição, feita na ficha da turma."
        action={registerSubject}
      />

      <Stack gap="md">
        <Stack gap={2}>
          <Title order={2} size="h4">
            Disciplinas da rede
          </Title>
          <Text size="sm" c={MUTED_TEXT}>
            {total} {IN_TOTAL}
          </Text>
        </Stack>

        {items.length === 0 ? (
          <Empty
            title="Nenhuma disciplina cadastrada"
            text="Sem disciplinas não há o que atribuir às turmas, e nenhum professor tem onde lançar notas."
            action={registerSubject}
          />
        ) : (
          <>
            <Table
              caption="Disciplinas da rede"
              columns={subjectColumns}
              rows={items}
              rowKey={(subject) => subject.id}
            />
            <Pagination
              param={PAGE_PARAMS.default}
              page={page}
              pages={pages}
              total={total}
              shown={items.length}
              size={size}
              label={SUBJECTS_COUNTED}
            />
          </>
        )}
      </Stack>
    </>
  );
}

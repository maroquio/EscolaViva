import { Button, Group, Stack, TextInput } from '@mantine/core';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { PAGE_PARAMS, usePage } from '../../../shared/api';
import { STUDENTS_LABEL } from '../../../shared/labels/constants';
import { Empty } from '../../../shared/ui/Empty';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { ALIGNED_AT_THE_BOTTOM, SUBMIT_BUTTON } from '../../../shared/ui/constants';
import { REGISTRAR_OVERLINE, SEARCH_TERM_PARAM } from '../constants';
import { useStudentSearch } from '../queries';
import { SearchResults } from './SearchResults';
import { REGISTER_STUDENT_ACTION, SEARCH_FIELD_WIDTH } from './constants';

const NO_TERM = '';

const searchAddressStartingOnPageOne = (
  current: URLSearchParams,
  term: string,
): URLSearchParams => {
  const next = new URLSearchParams(current);
  if (term === NO_TERM) next.delete(SEARCH_TERM_PARAM);
  else next.set(SEARCH_TERM_PARAM, term);
  next.delete(PAGE_PARAMS.default);
  return next;
};

export function StudentSearch(): React.ReactElement {
  const [address, setAddress] = useSearchParams();
  const searchedTerm = address.get(SEARCH_TERM_PARAM) ?? NO_TERM;
  const page = usePage();
  const [typedTerm, setTypedTerm] = useState(searchedTerm);
  const students = useStudentSearch(searchedTerm, page);
  const nothingSearchedYet = searchedTerm === NO_TERM;

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    setAddress(searchAddressStartingOnPageOne(address, typedTerm.trim()));
  };

  return (
    <>
      <PageHeader
        overline={REGISTRAR_OVERLINE}
        title={STUDENTS_LABEL}
        summary="A busca é por nome, e o resultado mostra a matrícula ativa de cada aluno — turma, ano e situação. Clique no nome para abrir a ficha."
        action={REGISTER_STUDENT_ACTION}
      />

      <Stack gap="lg">
        <form onSubmit={submit} role="search">
          <Group align={ALIGNED_AT_THE_BOTTOM}>
            <TextInput
              label="Buscar por nome"
              value={typedTerm}
              onChange={(event) => setTypedTerm(event.currentTarget.value)}
              style={{ flexGrow: 1, maxWidth: SEARCH_FIELD_WIDTH }}
            />
            <Button type={SUBMIT_BUTTON}>Buscar</Button>
          </Group>
        </form>

        {nothingSearchedYet ? (
          <Empty
            title="Comece pela busca"
            text="Digite parte do nome do aluno para encontrá-lo. Nenhuma consulta é feita até você buscar."
            action={REGISTER_STUDENT_ACTION}
          />
        ) : (
          <SearchResults term={searchedTerm} students={students} page={page} />
        )}
      </Stack>
    </>
  );
}

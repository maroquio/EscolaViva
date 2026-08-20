import { useSearchParams } from 'react-router';
import { TERMS, type Term } from '@escolaviva/contracts/enumerations';
import { TERM_PARAM } from './constants';

const FIRST_TERM: Term = 1;

const isTerm = (value: number): value is Term => (TERMS as readonly number[]).includes(value);

const termInTheAddress = (search: URLSearchParams): Term => {
  const asked = Number(search.get(TERM_PARAM));
  return isTerm(asked) ? asked : FIRST_TERM;
};

const searchForTerm = (search: URLSearchParams, term: Term): URLSearchParams => {
  const params = new URLSearchParams(search);
  if (term === FIRST_TERM) params.delete(TERM_PARAM);
  else params.set(TERM_PARAM, String(term));
  return params;
};

export function useTerm(): [Term, (term: Term) => void] {
  const [search, setSearch] = useSearchParams();

  const chooseTerm = (term: Term): void => {
    setSearch(searchForTerm(search, term));
  };

  return [termInTheAddress(search), chooseTerm];
}

export { TERMS };
export type { Term };

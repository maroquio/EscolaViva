import { useSearchParams } from 'react-router';
import { PAGE_PARAMS, requestedPage } from './pageParams';

export function usePage(cursor: string = PAGE_PARAMS.default): number {
  const [addressBar] = useSearchParams();
  return requestedPage(addressBar.get(cursor));
}

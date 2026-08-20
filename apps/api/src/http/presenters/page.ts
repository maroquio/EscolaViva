import type { Page as DomainPage } from '../../shared/pagination';
import type { Page } from '@escolaviva/contracts/page';

export const pageAsJson = <T, U>(page: DomainPage<T>, item: (value: T) => U): Page<U> => ({
  items: page.items.map(item),
  page: page.page,
  pages: page.pages,
  total: page.total,
  size: page.size,
});

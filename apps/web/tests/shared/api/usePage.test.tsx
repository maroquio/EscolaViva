import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, test } from 'vitest';
import { PAGE_PARAMS } from '../../../src/shared/api/pageParams';
import { usePage } from '../../../src/shared/api/usePage';

const atAddress =
  (address: string) =>
  ({ children }: { readonly children: React.ReactNode }): React.ReactElement => (
    <MemoryRouter initialEntries={[address]}>{children}</MemoryRouter>
  );

describe('usePage', () => {
  test('the page comes from the address bar, so a bookmark and a reload land on the same page', () => {
    const { result } = renderHook(() => usePage(), {
      wrapper: atAddress('/registrar/students?q=ana&p=3'),
    });

    expect(result.current).toBe(3);
  });

  test('an address with no page at all is page one', () => {
    const { result } = renderHook(() => usePage(), {
      wrapper: atAddress('/registrar/students'),
    });

    expect(result.current).toBe(1);
  });

  test('a named cursor reads its own parameter and ignores the other one', () => {
    const { result } = renderHook(() => usePage(PAGE_PARAMS.guardians), {
      wrapper: atAddress('/registrar/students/abc?pGuardians=2&pEnrollments=5'),
    });

    expect(result.current).toBe(2);
  });
});

import { Anchor, Box, Group, Text } from '@mantine/core';
import { Link, useLocation, useSearchParams } from 'react-router';
import { FIRST_PAGE } from '../api/constants';
import { pageQuery } from '../api/pageParams';
import { MUTED_TEXT } from './constants';

const WINDOW = 7;
const HALF_WINDOW = Math.floor(WINDOW / 2);
const DEFAULT_LABEL = 'itens';
const NO_BULLETS = 'none';
const CURRENT_PAGE_WEIGHT = 700;

const PREVIOUS = { rel: 'prev', label: 'Anterior', arrow: '‹', arrowFirst: true } as const;
const NEXT = { rel: 'next', label: 'Próxima', arrow: '›', arrowFirst: false } as const;

type Step = typeof PREVIOUS | typeof NEXT;

const pageNumbersAround = (current: number, pages: number): number[] => {
  if (pages <= WINDOW) return Array.from({ length: pages }, (_, index) => index + FIRST_PAGE);
  const start = Math.min(Math.max(FIRST_PAGE, current - HALF_WINDOW), pages - WINDOW + FIRST_PAGE);
  return Array.from({ length: WINDOW }, (_, index) => start + index);
};

type StepItemProps = {
  readonly step: Step;
  readonly to: string | null;
};

function StepItem({ step, to }: StepItemProps): React.ReactElement {
  const { rel, label, arrow, arrowFirst } = step;

  if (to === null) {
    return (
      <li>
        <Text component="span" c={MUTED_TEXT} aria-hidden="true">
          {arrowFirst ? `${arrow} ${label}` : `${label} ${arrow}`}
        </Text>
      </li>
    );
  }

  const hiddenArrow = <span aria-hidden="true">{arrow}</span>;

  return (
    <li>
      <Anchor component={Link} to={to} rel={rel}>
        {arrowFirst ? <>{hiddenArrow} {label}</> : <>{label} {hiddenArrow}</>}
      </Anchor>
    </li>
  );
}

type PageNumberItemProps = {
  readonly pageNumber: number;
  readonly currentPage: number;
  readonly to: string;
};

function PageNumberItem({ pageNumber, currentPage, to }: PageNumberItemProps): React.ReactElement {
  if (pageNumber === currentPage) {
    return (
      <li>
        <Text component="span" fw={CURRENT_PAGE_WEIGHT} aria-current="page">
          {pageNumber}
        </Text>
      </li>
    );
  }

  return (
    <li>
      <Anchor component={Link} to={to} aria-label={`Página ${pageNumber}`}>
        {pageNumber}
      </Anchor>
    </li>
  );
}

export type PaginationProps = {
  readonly param: string;
  readonly page: number;
  readonly pages: number;
  readonly total: number;
  readonly shown: number;
  readonly size: number;
  readonly label?: string;
};

export function Pagination({
  param,
  page,
  pages,
  total,
  shown,
  size,
  label = DEFAULT_LABEL,
}: PaginationProps): React.ReactElement | null {
  const [search] = useSearchParams();
  const { pathname } = useLocation();

  if (total === 0) return null;

  const addressOfPage = (pageNumber: number): string =>
    `${pathname}${pageQuery(search, param, pageNumber)}`;
  const firstOnThisPage = (page - FIRST_PAGE) * size + FIRST_PAGE;
  const lastOnThisPage = firstOnThisPage + shown - FIRST_PAGE;
  const hasMoreThanOnePage = pages > FIRST_PAGE;

  return (
    <Box component="nav" aria-label={`Paginação de ${label}`}>
      <Text size="sm">
        {firstOnThisPage}–{lastOnThisPage} de {total} {label}
      </Text>

      {hasMoreThanOnePage && (
        <Group gap="xs" component="ul" style={{ listStyle: NO_BULLETS, padding: 0 }}>
          <StepItem
            step={PREVIOUS}
            to={page > FIRST_PAGE ? addressOfPage(page - FIRST_PAGE) : null}
          />

          {pageNumbersAround(page, pages).map((pageNumber) => (
            <PageNumberItem
              key={pageNumber}
              pageNumber={pageNumber}
              currentPage={page}
              to={addressOfPage(pageNumber)}
            />
          ))}

          <StepItem step={NEXT} to={page < pages ? addressOfPage(page + FIRST_PAGE) : null} />
        </Group>
      )}
    </Box>
  );
}

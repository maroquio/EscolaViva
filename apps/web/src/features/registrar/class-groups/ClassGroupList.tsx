import { Group, NativeSelect, Stack } from '@mantine/core';
import { useSearchParams } from 'react-router';
import type { AcademicYearOption, SchoolOption } from '@escolaviva/contracts/options';
import { REGISTRAR_ROUTES } from '../../../constants';
import { PAGE_PARAMS, usePage } from '../../../shared/api';
import {
  ACADEMIC_YEAR_LABEL,
  CLASS_GROUPS_LABEL,
  SCHOOL_LABEL,
} from '../../../shared/labels/constants';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { ALIGNED_AT_THE_BOTTOM } from '../../../shared/ui/constants';
import { useSchoolOptions } from '../../network/queries';
import { REGISTRAR_OVERLINE } from '../constants';
import { useAcademicYearOptions } from '../queries';
import { ClassGroupResults } from './ClassGroupResults';
import {
  CLASS_GROUP_FILTER_PARAMS,
  CREATE_CLASS_GROUP_LABEL,
  EVERY_SCHOOL,
  EVERY_YEAR,
  NO_FILTER,
} from './constants';
import { useClassGroups } from './queries';

type Choice = { readonly value: string; readonly label: string };

const schoolFilterChoices = (schools: readonly SchoolOption[] = []): Choice[] => [
  { value: NO_FILTER, label: EVERY_SCHOOL },
  ...schools.map((school) => ({ value: school.id, label: school.name })),
];

const yearFilterChoices = (years: readonly AcademicYearOption[] = []): Choice[] => [
  { value: NO_FILTER, label: EVERY_YEAR },
  ...years.map((year) => ({ value: year.id, label: String(year.year) })),
];

export function ClassGroupList(): React.ReactElement {
  const [search, setSearch] = useSearchParams();
  const page = usePage();
  const filters = {
    school: search.get(CLASS_GROUP_FILTER_PARAMS.school) ?? NO_FILTER,
    year: search.get(CLASS_GROUP_FILTER_PARAMS.year) ?? NO_FILTER,
  };

  const schools = useSchoolOptions();
  const years = useAcademicYearOptions();
  const classGroups = useClassGroups(filters, page);

  const applyFilterFromFirstPage = (filterParam: string, chosen: string): void => {
    const next = new URLSearchParams(search);
    if (chosen === NO_FILTER) next.delete(filterParam);
    else next.set(filterParam, chosen);
    next.delete(PAGE_PARAMS.default);
    setSearch(next);
  };

  return (
    <>
      <PageHeader
        overline={REGISTRAR_OVERLINE}
        title={CLASS_GROUPS_LABEL}
        summary="A turma existe dentro de uma escola e de um ano letivo. É nela que a matrícula acontece, e é dela que saem a chamada e o boletim."
        action={{ href: REGISTRAR_ROUTES.newClassGroup, text: CREATE_CLASS_GROUP_LABEL }}
      />

      <Stack gap="lg">
        <Group align={ALIGNED_AT_THE_BOTTOM}>
          <NativeSelect
            label={SCHOOL_LABEL}
            data={schoolFilterChoices(schools.data)}
            value={filters.school}
            onChange={(event) =>
              applyFilterFromFirstPage(CLASS_GROUP_FILTER_PARAMS.school, event.currentTarget.value)
            }
          />
          <NativeSelect
            label={ACADEMIC_YEAR_LABEL}
            data={yearFilterChoices(years.data)}
            value={filters.year}
            onChange={(event) =>
              applyFilterFromFirstPage(CLASS_GROUP_FILTER_PARAMS.year, event.currentTarget.value)
            }
          />
        </Group>

        <ClassGroupResults classGroups={classGroups} page={page} />
      </Stack>
    </>
  );
}

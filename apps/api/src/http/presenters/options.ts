import type { AcademicYear, ClassGroup, Subject } from '../../academics';
import type { School, UserSummary } from '../../identity';
import { MISSING_VALUE } from '../../shared/constants';
import type { AcademicYearOption, ClassGroupOption, SchoolOption } from '@escolaviva/contracts/options';
import type { SimpleOption } from '@escolaviva/contracts/shared';

type NamedPerson = { readonly id: string; readonly name: string };

export const schoolOptionAsJson = (school: School): SchoolOption => ({
  id: school.id,
  name: school.name,
  active: school.active,
});

export const academicYearOptionAsJson = (academicYear: AcademicYear): AcademicYearOption => ({
  id: academicYear.id,
  year: academicYear.year,
});

export const guardianOptionAsJson = (guardian: UserSummary): SimpleOption => ({
  id: guardian.id,
  name: guardian.name,
});

export const teacherOptionAsJson = (teacher: NamedPerson): SimpleOption => ({
  id: teacher.id,
  name: teacher.name,
});

export const subjectOptionAsJson = (subject: Subject): SimpleOption => ({
  id: subject.id,
  name: subject.name,
});

export const classGroupOptionAsJson =
  (yearByAcademicYearId: ReadonlyMap<string, number>, nameBySchoolId: ReadonlyMap<string, string>) =>
  (classGroup: ClassGroup): ClassGroupOption => ({
    id: classGroup.id,
    name: classGroup.name,
    gradeLevel: classGroup.gradeLevel,
    shift: classGroup.shift,
    schoolId: classGroup.schoolId,
    schoolName: nameBySchoolId.get(classGroup.schoolId) ?? MISSING_VALUE,
    academicYearId: classGroup.academicYearId,
    year: yearByAcademicYearId.get(classGroup.academicYearId) ?? null,
  });

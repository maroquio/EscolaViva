import type { AcademicYear } from '../../academics';
import type { School, UserSummary } from '../../identity';
import type { AcademicYearInList, SchoolInList, UserInList } from '@escolaviva/contracts/network';

export const schoolAsJson = (school: School): SchoolInList => ({
  id: school.id,
  name: school.name,
  inepCode: school.inepCode,
  active: school.active,
});

export const networkUserAsJson = (user: UserSummary): UserInList => ({
  id: user.id,
  name: user.name,
  email: user.email,
  cpf: user.cpf,
  phone: user.phone,
  active: user.active,
  roles: user.roles.map((assignment) => ({
    schoolId: assignment.schoolId,
    schoolName: assignment.schoolName,
    role: assignment.role,
  })),
});

export const academicYearAsJson = (academicYear: AcademicYear): AcademicYearInList => ({
  id: academicYear.id,
  year: academicYear.year,
  startDate: academicYear.startDate,
  endDate: academicYear.endDate,
});

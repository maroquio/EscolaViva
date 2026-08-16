import { Hono, type Context } from 'hono';
import {
  ACADEMIC_LIMITS,
  ACADEMIC_VOCABULARY,
  academics,
  type AcademicYear,
  type ClassGroup,
  type Enrollment,
  type Student,
} from '../../academics';
import { ROLE, identity } from '../../identity';
import {
  CONTEXT_VARIABLES,
  ISO_DATE_LENGTH,
  LOCALE,
  MASKED_CPF_LENGTH,
  MISSING_VALUE,
} from '../../shared/constants';
import {
  currentNetwork,
  currentUser,
  isUuid,
  requireRole,
  type FormBody,
  type Variables,
} from '../../shared/http';
import { sliceItems } from '../../shared/pagination';
import { systemClock } from '../../shared/ports';
import type { ApplicationError } from '../../shared/result';
import {
  CHECKED_VALUE,
  ERROR_PAGES,
  FIELDS,
  ID_SUFFIXES,
  INITIAL_VALUES,
  NOTICES,
  PARAMS,
  PRESENTATION,
  ROUTES,
  TEMPLATES,
  TITLES,
} from '../constants';
import { pageFromQuery, pagination } from '../pagination';
import { render, renderError } from '../render';
import type { Params } from './routeMap';

type WebContext = Context<{ Variables: Variables }>;
type Values = Record<string, string | boolean>;
type Errors = readonly ApplicationError[];
type SchoolOption = { id: string; name: string };
type Data = Record<string, unknown>;

type ClassGroupRow = ClassGroup & {
  shiftName: string;
  schoolName: string;
  year: number | null;
};

const ROUTE_PARAMS = {
  id: 'id',
} as const satisfies Params<
  | typeof ROUTES.registrar.student.pattern
  | typeof ROUTES.registrar.studentGuardianNew.pattern
  | typeof ROUTES.registrar.studentGuardians.pattern
  | typeof ROUTES.registrar.studentEnroll.pattern
  | typeof ROUTES.registrar.enrollmentTransfer.pattern
  | typeof ROUTES.registrar.classGroup.pattern
  | typeof ROUTES.registrar.classGroupSubjectNew.pattern
  | typeof ROUTES.registrar.classGroupSubjects.pattern
>;

const LAYER = {
  partials: TEMPLATES.partials,
  suffixes: ID_SUFFIXES,
  missingValue: MISSING_VALUE,
  emptyOption: PRESENTATION.emptyOption,
  statusLabel: ACADEMIC_VOCABULARY.enrollmentStatus,
} as const;

const SHIFT_NAME: Record<string, string> = ACADEMIC_VOCABULARY.shift;
const SHIFT_OPTIONS = Object.entries(SHIFT_NAME).map(([value, label]) => ({ value, label }));

const today = (): string => systemClock.now().toISOString().slice(0, ISO_DATE_LENGTH);
const byName = (a: SchoolOption, b: SchoolOption): number => a.name.localeCompare(b.name, LOCALE);

const text = (body: FormBody, field: string): string => {
  const value = body[field];
  return typeof value === 'string' ? value.trim() : '';
};

const checked = (body: FormBody, field: string): boolean => text(body, field) !== '';

const chosen = (value: string | undefined, allowed: readonly string[]): string | null =>
  value !== undefined && allowed.includes(value) ? value : null;

const finish = (c: WebContext, target: string, message: string): Response =>
  c.redirect(`${target}?${PARAMS.ok}=${encodeURIComponent(message)}`, 303);

const notFound = (c: WebContext): Response =>
  renderError(
    c,
    404,
    ERROR_PAGES.recordOutOfScope.title,
    ERROR_PAGES.recordOutOfScope.detail,
  );

const registrarSchools = (c: WebContext): SchoolOption[] => {
  const nameById = new Map<string, string>();
  for (const assignment of currentUser(c).roles) {
    if (assignment.role === ROLE.registrar) {
      nameById.set(assignment.schoolId, assignment.schoolName);
    }
  }
  return [...nameById].map(([id, name]) => ({ id, name })).sort(byName);
};

const idsOf = (schools: readonly SchoolOption[]): string[] => schools.map(({ id }) => id);

const classGroupsInScope = (
  networkId: string,
  schools: readonly SchoolOption[],
  academicYearId: string | null,
): Promise<ClassGroup[]> =>
  academics.listClassGroups(networkId, {
    schoolIds: idsOf(schools),
    ...(academicYearId === null ? {} : { academicYearId }),
  });

const classGroupInScope = async (
  c: WebContext,
  classGroupId: string,
): Promise<ClassGroup | null> => {
  if (!isUuid(classGroupId)) return null;
  const classGroup = await academics.classGroupById(currentNetwork(c), classGroupId);
  if (classGroup === null) return null;
  return registrarSchools(c).some(({ id }) => id === classGroup.schoolId) ? classGroup : null;
};

const classGroupRow = (
  classGroup: ClassGroup,
  yearById: ReadonlyMap<string, number>,
  schoolNameById: ReadonlyMap<string, string>,
): ClassGroupRow => ({
  ...classGroup,
  shiftName: SHIFT_NAME[classGroup.shift] ?? classGroup.shift,
  schoolName: schoolNameById.get(classGroup.schoolId) ?? MISSING_VALUE,
  year: yearById.get(classGroup.academicYearId) ?? null,
});

export const registrarRoutes = new Hono<{ Variables: Variables }>();

registrarRoutes.use(requireRole(ROLE.registrar));

registrarRoutes.get(ROUTES.registrar.dashboard.pattern, async (c) => {
  const networkId = currentNetwork(c);
  const schools = registrarSchools(c);
  const page = sliceItems(schools, pageFromQuery(c));

  const [academicYears, totals, bySchool] = await Promise.all([
    academics.listAcademicYears(networkId),
    academics.scopeTotals(networkId, idsOf(schools)),
    academics.countsBySchool(networkId, idsOf(page.items)),
  ]);

  const counts = page.items.map((school) => {
    const ofSchool = bySchool.get(school.id);
    return {
      name: school.name,
      classGroups: ofSchool?.classGroups ?? 0,
      enrollments: ofSchool?.enrollments ?? 0,
      guardians: ofSchool?.guardians ?? 0,
    };
  });

  return render(c, TEMPLATES.registrar.dashboard, {
    ...LAYER,
    title: TITLES.registrar.dashboard,
    schools: counts,
    pagination: pagination(c, page),
    currentYear: academicYears[0] ?? null,
    totals: {
      classGroups: totals.classGroups,
      enrollments: totals.enrollments,
      guardians: totals.guardians,
      subjects: totals.subjects,
    },
  });
});

registrarRoutes.get(ROUTES.registrar.students.pattern, async (c) => {
  const networkId = currentNetwork(c);
  const term = (c.req.query(PARAMS.search) ?? '').trim();
  const page =
    term === ''
      ? sliceItems<Student>([], 1)
      : await academics.studentsPage(networkId, term, pageFromQuery(c));
  const found = page.items;

  const active = await academics.activeEnrollmentsOfStudents(
    networkId,
    found.map((student) => student.id),
    idsOf(registrarSchools(c)),
  );
  const activeByStudent = new Map(active.map((enrollment) => [enrollment.studentId, enrollment]));

  const students = found.map((student) => {
    const enrollment = activeByStudent.get(student.id) ?? null;
    return {
      ...student,
      classGroupName: enrollment?.classGroupName ?? null,
      year: enrollment?.year ?? null,
      status: enrollment?.status ?? null,
    };
  });

  return render(c, TEMPLATES.registrar.students, {
    ...LAYER,
    title: TITLES.registrar.students,
    searchField: PARAMS.search,
    nameLimit: ACADEMIC_LIMITS.student.name,
    rowsPerPage: page.size,
    term,
    searched: term !== '',
    students,
    pagination: pagination(c, page),
  });
});

const studentForm = (c: WebContext, values: Values, errors: Errors): Response =>
  render(c, TEMPLATES.registrar.studentNew, {
    ...LAYER,
    title: TITLES.registrar.studentNew,
    nameLimit: ACADEMIC_LIMITS.student.name,
    values,
    errors,
  });

registrarRoutes.get(ROUTES.registrar.studentNew.pattern, (c) =>
  studentForm(c, INITIAL_VALUES.student, []));

registrarRoutes.post(ROUTES.registrar.students.pattern, async (c) => {
  const body = c.get(CONTEXT_VARIABLES.body);
  const values = {
    name: text(body, FIELDS.student.name),
    birthDate: text(body, FIELDS.student.birthDate),
  };
  const result = await academics.registerStudent({
    networkId: currentNetwork(c),
    name: values.name,
    birthDate: values.birthDate,
  });
  if (result.ok) {
    return finish(
      c,
      ROUTES.registrar.student({ id: result.value.id }),
      NOTICES.studentRegistered,
    );
  }
  return studentForm(c, values, result.errors);
});

const studentInScope = async (c: WebContext, studentId: string): Promise<Student | null> => {
  if (!isUuid(studentId)) return null;
  const networkId = currentNetwork(c);
  const schoolIds = idsOf(registrarSchools(c));

  const [student, history, hasEnrollment] = await Promise.all([
    academics.studentById(networkId, studentId),
    academics.studentEnrollmentsPage(networkId, studentId, schoolIds, 1),
    academics.studentHasEnrollment(networkId, studentId),
  ]);
  if (student === null) return null;
  return hasEnrollment && history.total === 0 ? null : student;
};

const studentRecord = async (c: WebContext, studentId: string): Promise<Data | null> => {
  if (!isUuid(studentId)) return null;
  const networkId = currentNetwork(c);
  const schoolIds = idsOf(registrarSchools(c));

  const [student, guardianLinks, history, active, hasEnrollment] = await Promise.all([
    academics.studentById(networkId, studentId),
    academics.studentGuardiansPage(networkId, studentId, pageFromQuery(c, PARAMS.guardiansPage)),
    academics.studentEnrollmentsPage(
      networkId,
      studentId,
      schoolIds,
      pageFromQuery(c, PARAMS.enrollmentsPage),
    ),
    academics.activeEnrollmentsOfStudents(networkId, [studentId], schoolIds),
    academics.studentHasEnrollment(networkId, studentId),
  ]);
  if (student === null) return null;
  if (hasEnrollment && history.total === 0) return null;

  return {
    ...LAYER,
    title: TITLES.registrar.student,
    student,
    guardianLinks: guardianLinks.items,
    guardianLinksPagination: pagination(c, guardianLinks, PARAMS.guardiansPage),
    enrollments: history.items,
    enrollmentsPagination: pagination(c, history, PARAMS.enrollmentsPage),
    active: active[0] ?? null,
  };
};

registrarRoutes.get(ROUTES.registrar.student.pattern, async (c) => {
  const record = await studentRecord(c, c.req.param(ROUTE_PARAMS.id));
  return record === null ? notFound(c) : render(c, TEMPLATES.registrar.student, record);
});

const guardianLinkForm = async (
  c: WebContext,
  student: Student,
  values: Values,
  errors: Errors,
): Promise<Response> => {
  const networkId = currentNetwork(c);
  const [guardians, linked] = await Promise.all([
    academics.listGuardians(networkId),
    academics.studentGuardiansPage(networkId, student.id, 1),
  ]);
  const alreadyLinked = new Set(linked.items.map((link) => link.guardianId));

  return render(c, TEMPLATES.registrar.studentGuardianNew, {
    ...LAYER,
    title: TITLES.registrar.linkGuardian,
    relationshipLimit: ACADEMIC_LIMITS.relationship.description,
    checkedValue: CHECKED_VALUE,
    student,
    available: guardians.filter((person) => !alreadyLinked.has(person.id)),
    hasGuardians: guardians.length > 0,
    values,
    errors,
  });
};

registrarRoutes.get(ROUTES.registrar.studentGuardianNew.pattern, async (c) => {
  const student = await studentInScope(c, c.req.param(ROUTE_PARAMS.id));
  return student === null ? notFound(c) : await guardianLinkForm(c, student, {}, []);
});

registrarRoutes.post(ROUTES.registrar.studentGuardians.pattern, async (c) => {
  const student = await studentInScope(c, c.req.param(ROUTE_PARAMS.id));
  if (student === null) return notFound(c);

  const body = c.get(CONTEXT_VARIABLES.body);
  const values = {
    guardianId: text(body, FIELDS.guardianLink.guardianId),
    relationship: text(body, FIELDS.guardianLink.relationship),
    financiallyResponsible: checked(body, FIELDS.guardianLink.financiallyResponsible),
  };
  const result = await academics.linkGuardian({
    networkId: currentNetwork(c),
    studentId: student.id,
    guardianId: values.guardianId,
    relationship: values.relationship,
    financiallyResponsible: values.financiallyResponsible,
  });
  if (result.ok) {
    return finish(c, ROUTES.registrar.student({ id: student.id }), NOTICES.guardianLinked);
  }
  return await guardianLinkForm(c, student, values, result.errors);
});

const classGroupOptions = async (
  c: WebContext,
): Promise<{ classGroups: ClassGroupRow[]; academicYears: AcademicYear[] }> => {
  const networkId = currentNetwork(c);
  const schools = registrarSchools(c);
  const [classGroups, academicYears] = await Promise.all([
    classGroupsInScope(networkId, schools, null),
    academics.listAcademicYears(networkId),
  ]);
  const yearById = new Map(academicYears.map((academicYear) => [academicYear.id, academicYear.year]));
  const schoolNameById = new Map(schools.map(({ id, name }) => [id, name]));
  return {
    classGroups: classGroups.map((classGroup) =>
      classGroupRow(classGroup, yearById, schoolNameById),
    ),
    academicYears,
  };
};

const enrollmentForm = async (
  c: WebContext,
  student: Student,
  values: Values,
  errors: Errors,
): Promise<Response> => {
  const { classGroups, academicYears } = await classGroupOptions(c);
  return render(c, TEMPLATES.registrar.studentEnrollmentNew, {
    ...LAYER,
    title: TITLES.registrar.enroll,
    student,
    classGroups,
    academicYears,
    today: today(),
    values,
    errors,
  });
};

registrarRoutes.get(ROUTES.registrar.studentEnroll.pattern, async (c) => {
  const student = await studentInScope(c, c.req.param(ROUTE_PARAMS.id));
  return student === null ? notFound(c) : await enrollmentForm(c, student, {}, []);
});

registrarRoutes.post(ROUTES.registrar.enrollments.pattern, async (c) => {
  const body = c.get(CONTEXT_VARIABLES.body);
  const student = await studentInScope(c, text(body, FIELDS.enrollment.studentId));
  if (student === null) return notFound(c);

  const values = {
    classGroupId: text(body, FIELDS.enrollment.classGroupId),
    academicYearId: text(body, FIELDS.enrollment.academicYearId),
    enrollmentDate: text(body, FIELDS.enrollment.enrollmentDate),
  };
  if (values.classGroupId !== '' && (await classGroupInScope(c, values.classGroupId)) === null) {
    return notFound(c);
  }

  const result = await academics.enroll({
    networkId: currentNetwork(c),
    studentId: student.id,
    classGroupId: values.classGroupId,
    academicYearId: values.academicYearId,
    enrollmentDate: values.enrollmentDate,
  });
  if (result.ok) {
    return finish(c, ROUTES.registrar.student({ id: student.id }), NOTICES.enrollmentRecorded);
  }
  return await enrollmentForm(c, student, values, result.errors);
});

const transferInScope = async (
  c: WebContext,
  enrollmentId: string,
): Promise<{ enrollment: Enrollment; student: Student } | null> => {
  if (!isUuid(enrollmentId)) return null;
  const enrollment = await academics.enrollmentById(currentNetwork(c), enrollmentId);
  if (enrollment === null) return null;
  if (!registrarSchools(c).some(({ id }) => id === enrollment.schoolId)) return null;
  const student = await studentInScope(c, enrollment.studentId);
  return student === null ? null : { enrollment, student };
};

const transferForm = async (
  c: WebContext,
  enrollment: Enrollment,
  student: Student,
  values: Values,
  errors: Errors,
): Promise<Response> => {
  const { classGroups } = await classGroupOptions(c);
  return render(c, TEMPLATES.registrar.enrollmentTransfer, {
    ...LAYER,
    title: TITLES.registrar.transfer,
    student,
    active: enrollment,
    classGroups: classGroups.filter((classGroup) => classGroup.id !== enrollment.classGroupId),
    today: today(),
    values,
    errors,
  });
};

registrarRoutes.get(ROUTES.registrar.enrollmentTransfer.pattern, async (c) => {
  const target = await transferInScope(c, c.req.param(ROUTE_PARAMS.id));
  if (target === null) return notFound(c);
  return await transferForm(c, target.enrollment, target.student, {}, []);
});

registrarRoutes.post(ROUTES.registrar.enrollmentTransfer.pattern, async (c) => {
  const enrollmentId = c.req.param(ROUTE_PARAMS.id);
  const target = await transferInScope(c, enrollmentId);
  if (target === null) return notFound(c);

  const body = c.get(CONTEXT_VARIABLES.body);
  const values = {
    targetClassGroupId: text(body, FIELDS.transfer.targetClassGroupId),
    date: text(body, FIELDS.transfer.date),
  };
  if (
    values.targetClassGroupId !== '' &&
    (await classGroupInScope(c, values.targetClassGroupId)) === null
  ) {
    return notFound(c);
  }

  const result = await academics.transfer({
    networkId: currentNetwork(c),
    enrollmentId,
    targetClassGroupId: values.targetClassGroupId,
    date: values.date,
  });
  if (result.ok) {
    return finish(
      c,
      ROUTES.registrar.student({ id: target.student.id }),
      NOTICES.transferCompleted,
    );
  }
  return await transferForm(c, target.enrollment, target.student, values, result.errors);
});

const guardiansScreen = async (c: WebContext): Promise<Response> => {
  const page = await academics.guardiansPage(currentNetwork(c), pageFromQuery(c));
  return render(c, TEMPLATES.registrar.guardians, {
    ...LAYER,
    title: TITLES.registrar.guardians,
    guardians: page.items,
    pagination: pagination(c, page),
  });
};

const guardianForm = (c: WebContext, values: Values, errors: Errors): Response =>
  render(c, TEMPLATES.registrar.guardianNew, {
    ...LAYER,
    title: TITLES.registrar.guardianNew,
    nameLimit: ACADEMIC_LIMITS.guardian.name,
    emailLimit: ACADEMIC_LIMITS.guardian.email,
    phoneLimit: ACADEMIC_LIMITS.guardian.phone,
    maskedCpfLimit: MASKED_CPF_LENGTH,
    values,
    errors,
  });

registrarRoutes.get(ROUTES.registrar.guardians.pattern, (c) => guardiansScreen(c));

registrarRoutes.get(ROUTES.registrar.guardianNew.pattern, (c) =>
  guardianForm(c, INITIAL_VALUES.guardian, []));

registrarRoutes.post(ROUTES.registrar.guardians.pattern, async (c) => {
  const body = c.get(CONTEXT_VARIABLES.body);
  const values = {
    name: text(body, FIELDS.guardian.name),
    email: text(body, FIELDS.guardian.email),
    phone: text(body, FIELDS.guardian.phone),
    cpf: text(body, FIELDS.guardian.cpf),
  };
  const result = await academics.registerGuardian({
    networkId: currentNetwork(c),
    name: values.name,
    email: values.email,
    phone: values.phone,
    cpf: values.cpf,
  });
  if (result.ok) {
    return finish(c, ROUTES.registrar.guardians(), NOTICES.guardianRegistered);
  }
  return guardianForm(c, values, result.errors);
});

const classGroupsScreen = async (c: WebContext): Promise<Response> => {
  const networkId = currentNetwork(c);
  const schools = registrarSchools(c);
  const academicYears = await academics.listAcademicYears(networkId);

  const schoolId = chosen(c.req.query(PARAMS.school), idsOf(schools));
  const academicYearId = chosen(
    c.req.query(PARAMS.year),
    academicYears.map(({ id }) => id),
  );
  const target = schoolId === null ? schools : schools.filter(({ id }) => id === schoolId);

  const page = await academics.classGroupsPage(
    networkId,
    {
      schoolIds: idsOf(target),
      ...(academicYearId === null ? {} : { academicYearId }),
    },
    pageFromQuery(c),
  );

  const yearById = new Map(academicYears.map((academicYear) => [academicYear.id, academicYear.year]));
  const schoolNameById = new Map(schools.map(({ id, name }) => [id, name]));

  return render(c, TEMPLATES.registrar.classGroups, {
    ...LAYER,
    title: TITLES.registrar.classGroups,
    schoolField: PARAMS.school,
    yearField: PARAMS.year,
    schools,
    academicYears,
    filter: { schoolId: schoolId ?? '', academicYearId: academicYearId ?? '' },
    classGroups: page.items.map((classGroup) =>
      classGroupRow(classGroup, yearById, schoolNameById),
    ),
    pagination: pagination(c, page),
  });
};

const classGroupForm = async (c: WebContext, values: Values, errors: Errors): Promise<Response> =>
  render(c, TEMPLATES.registrar.classGroupNew, {
    ...LAYER,
    title: TITLES.registrar.classGroupNew,
    nameLimit: ACADEMIC_LIMITS.classGroup.name,
    gradeLevelLimit: ACADEMIC_LIMITS.classGroup.gradeLevel,
    schools: registrarSchools(c),
    academicYears: await academics.listAcademicYears(currentNetwork(c)),
    shifts: SHIFT_OPTIONS,
    values,
    errors,
  });

registrarRoutes.get(ROUTES.registrar.classGroups.pattern, (c) => classGroupsScreen(c));

registrarRoutes.get(ROUTES.registrar.classGroupNew.pattern, (c) =>
  classGroupForm(c, INITIAL_VALUES.classGroup, []));

registrarRoutes.post(ROUTES.registrar.classGroups.pattern, async (c) => {
  const body = c.get(CONTEXT_VARIABLES.body);
  const values = {
    name: text(body, FIELDS.classGroup.name),
    gradeLevel: text(body, FIELDS.classGroup.gradeLevel),
    shift: text(body, FIELDS.classGroup.shift),
    schoolId: text(body, FIELDS.classGroup.schoolId),
    academicYearId: text(body, FIELDS.classGroup.academicYearId),
  };
  const schools = registrarSchools(c);
  if (values.schoolId !== '' && !schools.some(({ id }) => id === values.schoolId)) {
    return notFound(c);
  }

  const result = await academics.registerClassGroup({
    networkId: currentNetwork(c),
    name: values.name,
    gradeLevel: values.gradeLevel,
    shift: values.shift,
    schoolId: values.schoolId,
    academicYearId: values.academicYearId,
  });
  if (result.ok) {
    return finish(
      c,
      ROUTES.registrar.classGroup({ id: result.value.id }),
      NOTICES.classGroupRegistered,
    );
  }
  return classGroupForm(c, values, result.errors);
});

const toClassGroupRow = async (
  c: WebContext,
  classGroup: ClassGroup,
): Promise<ClassGroupRow> => {
  const academicYears = await academics.listAcademicYears(currentNetwork(c));
  const yearById = new Map(academicYears.map((academicYear) => [academicYear.id, academicYear.year]));
  const schoolNameById = new Map(registrarSchools(c).map(({ id, name }) => [id, name]));
  return classGroupRow(classGroup, yearById, schoolNameById);
};

const classGroupScreen = async (c: WebContext, classGroup: ClassGroup): Promise<Response> => {
  const networkId = currentNetwork(c);
  const [assignments, enrollments] = await Promise.all([
    academics.classGroupSubjectsPage(
      networkId,
      classGroup.id,
      pageFromQuery(c, PARAMS.subjectsPage),
    ),
    academics.activeEnrollmentsOfClassGroupPage(
      networkId,
      classGroup.id,
      pageFromQuery(c, PARAMS.enrollmentsPage),
    ),
  ]);
  const names = await identity.userNames(
    networkId,
    assignments.items.map((assignment) => assignment.teacherUserId),
  );

  return render(c, TEMPLATES.registrar.classGroup, {
    ...LAYER,
    title: TITLES.registrar.classGroup(classGroup.name),
    classGroup: await toClassGroupRow(c, classGroup),
    assignments: assignments.items.map((assignment) => ({
      id: assignment.id,
      subjectName: assignment.subjectName,
      teacherName: names.get(assignment.teacherUserId) ?? MISSING_VALUE,
    })),
    assignmentsPagination: pagination(c, assignments, PARAMS.subjectsPage),
    enrollments: enrollments.items,
    enrollmentsPagination: pagination(c, enrollments, PARAMS.enrollmentsPage),
  });
};

registrarRoutes.get(ROUTES.registrar.classGroup.pattern, async (c) => {
  const classGroup = await classGroupInScope(c, c.req.param(ROUTE_PARAMS.id));
  return classGroup === null ? notFound(c) : await classGroupScreen(c, classGroup);
});

const assignmentForm = async (
  c: WebContext,
  classGroup: ClassGroup,
  values: Values,
  errors: Errors,
): Promise<Response> => {
  const networkId = currentNetwork(c);
  const [subjects, teachers] = await Promise.all([
    academics.listSubjects(networkId),
    identity.schoolTeachers(networkId, classGroup.schoolId),
  ]);
  return render(c, TEMPLATES.registrar.classGroupSubjectNew, {
    ...LAYER,
    title: TITLES.registrar.assign,
    classGroup: await toClassGroupRow(c, classGroup),
    subjects,
    teachers,
    values,
    errors,
  });
};

registrarRoutes.get(ROUTES.registrar.classGroupSubjectNew.pattern, async (c) => {
  const classGroup = await classGroupInScope(c, c.req.param(ROUTE_PARAMS.id));
  if (classGroup === null) return notFound(c);
  return await assignmentForm(c, classGroup, { subjectId: '', teacherUserId: '' }, []);
});

registrarRoutes.post(ROUTES.registrar.classGroupSubjects.pattern, async (c) => {
  const classGroupId = c.req.param(ROUTE_PARAMS.id);
  const classGroup = await classGroupInScope(c, classGroupId);
  if (classGroup === null) return notFound(c);

  const body = c.get(CONTEXT_VARIABLES.body);
  const values = {
    subjectId: text(body, FIELDS.teachingAssignment.subjectId),
    teacherUserId: text(body, FIELDS.teachingAssignment.teacherUserId),
  };
  const result = await academics.assignTeacher({
    networkId: currentNetwork(c),
    classGroupId,
    subjectId: values.subjectId,
    teacherUserId: values.teacherUserId,
  });
  if (result.ok) {
    return finish(
      c,
      ROUTES.registrar.classGroup({ id: classGroupId }),
      NOTICES.subjectAssigned,
    );
  }
  return await assignmentForm(c, classGroup, values, result.errors);
});

const subjectsScreen = async (c: WebContext): Promise<Response> => {
  const page = await academics.subjectsPage(currentNetwork(c), pageFromQuery(c));
  return render(c, TEMPLATES.registrar.subjects, {
    ...LAYER,
    title: TITLES.registrar.subjects,
    subjects: page.items,
    pagination: pagination(c, page),
  });
};

const subjectForm = (c: WebContext, values: Values, errors: Errors): Response =>
  render(c, TEMPLATES.registrar.subjectNew, {
    ...LAYER,
    title: TITLES.registrar.subjectNew,
    nameLimit: ACADEMIC_LIMITS.subject.name,
    values,
    errors,
  });

registrarRoutes.get(ROUTES.registrar.subjects.pattern, (c) => subjectsScreen(c));

registrarRoutes.get(ROUTES.registrar.subjectNew.pattern, (c) =>
  subjectForm(c, INITIAL_VALUES.subject, []));

registrarRoutes.post(ROUTES.registrar.subjects.pattern, async (c) => {
  const values = { name: text(c.get(CONTEXT_VARIABLES.body), FIELDS.subject.name) };
  const result = await academics.registerSubject({
    networkId: currentNetwork(c),
    name: values.name,
  });
  if (result.ok) {
    return finish(c, ROUTES.registrar.subjects(), NOTICES.subjectRegistered);
  }
  return subjectForm(c, values, result.errors);
});

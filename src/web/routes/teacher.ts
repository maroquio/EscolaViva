import { Hono, type Context } from 'hono';
import { ACADEMIC_VOCABULARY, academics } from '../../academics';
import {
  ASSESSMENT_LIMITS,
  ASSESSMENT_VOCABULARY,
  NOON_UTC,
  TERMS,
  assessment,
  type TermClosingState,
} from '../../assessment';
import { ROLE } from '../../identity';
import { CONTEXT_VARIABLES, FORMATS, ISO_DATE_LENGTH, LOCALE, TIME } from '../../shared/constants';
import {
  BusinessRuleViolation,
  NotFound,
  currentNetwork,
  currentUser,
  requireRole,
  type FormBody,
  type Variables,
} from '../../shared/http';
import { systemClock } from '../../shared/ports';
import type { ApplicationError } from '../../shared/result';
import {
  DIAGNOSTICS,
  FIELDS,
  FORM_ERRORS,
  GRADE_OUT_OF_RANGE,
  GRADE_OUT_OF_RANGE_SUMMARY,
  ID_PREFIXES,
  NOTICES,
  PARAMS,
  PRESENTATION,
  ROUTES,
  TEMPLATES,
  TITLES,
} from '../constants';
import { formatDate, render, type TemplateData } from '../render';
import type { Params } from './routeMap';

type WebContext = Context<{ Variables: Variables }>;

type Assignment = Awaited<ReturnType<typeof academics.teacherClassGroupSubjects>>[number];

type TeacherClassGroup = {
  classGroupId: string;
  classGroupName: string;
  gradeLevel: string;
  shift: string;
  subjects: { id: string; subjectName: string }[];
};

type RejectedPosting = {
  values: Map<string, string>;
  byEnrollment: Map<string, string>;
  problems: readonly ApplicationError[];
};

type RejectedRollCall = {
  reported: Map<string, { present: boolean; excuse: string }>;
  problems: readonly ApplicationError[];
};

const ROUTE_PARAMS = {
  classGroupSubjectId: 'classGroupSubjectId',
  classGroupId: 'classGroupId',
} as const satisfies Params<
  typeof ROUTES.teacher.grades.pattern | typeof ROUTES.teacher.rollCall.pattern
>;

const DEFAULT_TERM = 1;

const PARTIALS = { partials: TEMPLATES.partials };
const SEPARATORS = {
  separator: PRESENTATION.separator,
  shiftSeparator: PRESENTATION.shiftSeparator,
};
const PREFIXES = { prefixes: ID_PREFIXES };

const SHIFT_NAME: Record<string, string> = ACADEMIC_VOCABULARY.shift;

const shiftInSentence = (shift: string): string =>
  (SHIFT_NAME[shift] ?? shift).toLocaleLowerCase(LOCALE);

const INVALID_GRADE = GRADE_OUT_OF_RANGE(
  ASSESSMENT_LIMITS.grade.minimum,
  ASSESSMENT_LIMITS.grade.maximum,
);

const INVALID_GRADES_SUMMARY: ApplicationError = {
  ...FORM_ERRORS.invalidGrade,
  mensagem: GRADE_OUT_OF_RANGE_SUMMARY(
    ASSESSMENT_LIMITS.grade.minimum,
    ASSESSMENT_LIMITS.grade.maximum,
  ),
};

const withParams = (path: string, params: Record<string, string>): string =>
  `${path}?${new URLSearchParams(params).toString()}`;

const field = (body: FormBody, name: string): string => {
  const value = body[name];
  return typeof value === 'string' ? value.trim() : '';
};

const checked = (body: FormBody, name: string): boolean => body[name] !== undefined;

const orNull = (text: string): string | null => (text === '' ? null : text);

const termOrNull = (raw: string | undefined): number | null => {
  const number = Number(raw);
  return TERMS.includes(number) ? number : null;
};

const NUMBER_DECIMAL_SEPARATOR = '.';

const twoDigits = (value: number): string =>
  String(value).padStart(PRESENTATION.twoDigitWidth, PRESENTATION.digitPad);

const today = (): string => {
  const d = systemClock.now();
  return `${d.getFullYear()}-${twoDigits(d.getMonth() + 1)}-${twoDigits(d.getDate())}`;
};

const dateOrNull = (raw: string | undefined): string | null => {
  if (raw === undefined || !FORMATS.isoDate.test(raw)) return null;
  const converted = new Date(`${raw}${NOON_UTC}`);
  if (Number.isNaN(converted.getTime())) return null;
  return converted.toISOString().slice(0, ISO_DATE_LENGTH) === raw ? raw : null;
};

const shiftDay = (date: string, days: number): string => {
  const base = new Date(`${date}${NOON_UTC}`).getTime();
  return new Date(base + days * TIME.msPerDay).toISOString().slice(0, ISO_DATE_LENGTH);
};

const teacherAssignments = (c: WebContext): Promise<Assignment[]> =>
  academics.teacherClassGroupSubjects(currentNetwork(c), currentUser(c).id);

function groupByClassGroup(assignments: readonly Assignment[]): TeacherClassGroup[] {
  const classGroups = new Map<string, TeacherClassGroup>();
  for (const assignment of assignments) {
    const classGroupId = assignment.classGroupId;
    const previous = classGroups.get(classGroupId)?.subjects ?? [];
    const subjects = [...previous, { id: assignment.id, subjectName: assignment.subjectName }];
    classGroups.set(classGroupId, {
      classGroupId,
      classGroupName: assignment.classGroupName,
      gradeLevel: assignment.gradeLevel,
      shift: shiftInSentence(assignment.shift),
      subjects,
    });
  }
  return [...classGroups.values()];
}

const withLinks = (classGroup: TeacherClassGroup) => ({
  ...classGroup,
  rollCallHref: ROUTES.teacher.rollCall({ classGroupId: classGroup.classGroupId }),
  closingHref: ROUTES.teacher.closing({ classGroupId: classGroup.classGroupId }),
  subjects: classGroup.subjects.map((subject) => ({
    ...subject,
    gradesHref: ROUTES.teacher.grades({ classGroupSubjectId: subject.id }),
  })),
});

function assignmentOr404(
  assignments: readonly Assignment[],
  classGroupSubjectId: string,
): Assignment {
  const assignment = assignments.find((candidate) => candidate.id === classGroupSubjectId);
  if (assignment === undefined) throw new NotFound(DIAGNOSTICS.subjectOutsideSchedule);
  return assignment;
}

function classGroupOr404(
  assignments: readonly Assignment[],
  classGroupId: string,
): TeacherClassGroup {
  const classGroup = groupByClassGroup(assignments).find(
    (candidate) => candidate.classGroupId === classGroupId,
  );
  if (classGroup === undefined) throw new NotFound(DIAGNOSTICS.classGroupOutsideSchedule);
  return classGroup;
}

const asGrade = (typed: string): number | null | undefined => {
  if (typed === '') return null;
  const number = Number(typed.replace(PRESENTATION.decimalSeparator, NUMBER_DECIMAL_SEPARATOR));
  if (
    !Number.isFinite(number) ||
    number < ASSESSMENT_LIMITS.grade.minimum ||
    number > ASSESSMENT_LIMITS.grade.maximum
  ) {
    return undefined;
  }
  return number;
};

function readGrades(body: FormBody, enrollments: readonly { id: string }[]) {
  const values = new Map<string, string>();
  const byEnrollment = new Map<string, string>();
  const grades = enrollments.map((enrollment) => {
    const typed = field(body, `${FIELDS.journal.grade}${enrollment.id}`);
    values.set(enrollment.id, typed);
    const value = asGrade(typed);
    if (value === undefined) byEnrollment.set(enrollment.id, INVALID_GRADE);
    return { enrollmentId: enrollment.id, value: value ?? null };
  });
  return { values, byEnrollment, grades };
}

async function gradesScreen(
  c: WebContext,
  assignment: Assignment,
  term: number,
  rejected: RejectedPosting | null,
): Promise<TemplateData> {
  const networkId = currentNetwork(c);
  const [enrollments, grades, states] = await Promise.all([
    academics.activeEnrollmentsOfClassGroup(networkId, assignment.classGroupId),
    assessment.classGroupSubjectGrades(networkId, assignment.id, term),
    assessment.closingState(networkId, assignment.classGroupId),
  ]);

  return {
    ...PARTIALS,
    ...SEPARATORS,
    ...PREFIXES,
    title: TITLES.teacher.grades(assignment.subjectName, assignment.classGroupName),
    assignment: {
      subjectName: assignment.subjectName,
      classGroupName: assignment.classGroupName,
      gradeLevel: assignment.gradeLevel,
      shift: shiftInSentence(assignment.shift),
    },
    term,
    terms: TERMS,
    closed: states.some((state) => state.term === term && state.closed),
    formAction: ROUTES.teacher.grades({ classGroupSubjectId: assignment.id }),
    rollCallHref: ROUTES.teacher.rollCall({ classGroupId: assignment.classGroupId }),
    closingHref: ROUTES.teacher.closing({ classGroupId: assignment.classGroupId }),
    termField: FIELDS.term,
    termParam: PARAMS.term,
    gradePrefix: FIELDS.journal.grade,
    minGrade: ASSESSMENT_LIMITS.grade.minimum,
    maxGrade: ASSESSMENT_LIMITS.grade.maximum,
    rows: enrollments.map((enrollment) => ({
      enrollmentId: enrollment.id,
      studentName: enrollment.studentName,
      value: rejected?.values.get(enrollment.id) ?? String(grades.get(enrollment.id) ?? ''),
      error: rejected?.byEnrollment.get(enrollment.id) ?? null,
    })),
    errors: rejected?.problems ?? [],
  };
}

const gradesMessage = (saved: number): string => {
  if (saved === 0) return NOTICES.noGrades;
  return saved === 1 ? NOTICES.oneGrade : NOTICES.manyGrades(saved);
};

async function rollCallScreen(
  c: WebContext,
  classGroup: TeacherClassGroup,
  date: string,
  rejected: RejectedRollCall | null,
): Promise<TemplateData> {
  const networkId = currentNetwork(c);
  const [enrollments, recorded] = await Promise.all([
    academics.activeEnrollmentsOfClassGroup(networkId, classGroup.classGroupId),
    assessment.rollCallForDate(networkId, classGroup.classGroupId, date),
  ]);

  return {
    ...PARTIALS,
    ...SEPARATORS,
    title: TITLES.teacher.rollCall(classGroup.classGroupName),
    classGroup: withLinks(classGroup),
    date,
    previousDay: shiftDay(date, -1),
    nextDay: shiftDay(date, 1),
    formAction: ROUTES.teacher.rollCall({ classGroupId: classGroup.classGroupId }),
    dateField: FIELDS.date,
    dateParam: PARAMS.date,
    presentPrefix: FIELDS.journal.present,
    excusePrefix: FIELDS.journal.excuse,
    excuseLimit: ASSESSMENT_LIMITS.excuseCharacters,
    rows: enrollments.map(({ id, studentName }) => {
      const reported = rejected?.reported.get(id);
      const saved = recorded.get(id);
      return {
        enrollmentId: id,
        studentName,
        present: reported?.present ?? saved?.present ?? true,
        excuse: reported?.excuse ?? saved?.excuse ?? '',
      };
    }),
    errors: rejected?.problems ?? [],
  };
}

const CLOSING_LABEL = {
  closed: ASSESSMENT_VOCABULARY.closing.closed,
  open: ASSESSMENT_VOCABULARY.closing.open,
};

const closingScreen = (
  classGroup: TeacherClassGroup,
  states: readonly TermClosingState[],
  problems: readonly ApplicationError[],
  rejectedTerm: number | null,
): TemplateData => ({
  ...SEPARATORS,
  ...PREFIXES,
  title: TITLES.teacher.closing(classGroup.classGroupName),
  classGroup: withLinks(classGroup),
  states,
  formAction: ROUTES.teacher.closing({ classGroupId: classGroup.classGroupId }),
  termField: FIELDS.term,
  termParam: PARAMS.term,
  closingLabel: CLOSING_LABEL,
  rejectedTerm,
  errors: problems,
});

export const teacherRoutes = new Hono<{ Variables: Variables }>();

teacherRoutes.use(requireRole(ROLE.teacher));

teacherRoutes.get(ROUTES.teacher.dashboard.pattern, async (c) => {
  const classGroups = groupByClassGroup(await teacherAssignments(c)).map(withLinks);
  return render(c, TEMPLATES.teacher.dashboard, {
    ...PARTIALS,
    ...SEPARATORS,
    title: TITLES.teacher.dashboard,
    classGroups,
  });
});

teacherRoutes.get(ROUTES.teacher.grades.pattern, async (c) => {
  const assignment = assignmentOr404(
    await teacherAssignments(c),
    c.req.param(ROUTE_PARAMS.classGroupSubjectId),
  );
  const term = termOrNull(c.req.query(PARAMS.term)) ?? DEFAULT_TERM;
  return render(c, TEMPLATES.teacher.grades, await gradesScreen(c, assignment, term, null));
});

teacherRoutes.post(ROUTES.teacher.grades.pattern, async (c) => {
  const assignment = assignmentOr404(
    await teacherAssignments(c),
    c.req.param(ROUTE_PARAMS.classGroupSubjectId),
  );
  const body = c.get(CONTEXT_VARIABLES.body);
  const term = termOrNull(field(body, FIELDS.term));
  if (term === null) throw new BusinessRuleViolation(DIAGNOSTICS.termOnPosting);

  const networkId = currentNetwork(c);
  const enrollments = await academics.activeEnrollmentsOfClassGroup(
    networkId,
    assignment.classGroupId,
  );
  const { values, byEnrollment, grades } = readGrades(body, enrollments);
  const reject = async (problems: readonly ApplicationError[]): Promise<Response> =>
    render(
      c,
      TEMPLATES.teacher.grades,
      await gradesScreen(c, assignment, term, { values, byEnrollment, problems }),
    );

  if (byEnrollment.size > 0) return await reject([INVALID_GRADES_SUMMARY]);

  const result = await assessment.postGrades({
    networkId,
    classGroupSubjectId: assignment.id,
    term,
    postedBy: currentUser(c).id,
    grades,
  });
  if (!result.ok) return await reject(result.erros);

  const params = {
    [PARAMS.term]: String(term),
    [PARAMS.ok]: gradesMessage(result.valor),
  };
  return c.redirect(
    withParams(ROUTES.teacher.grades({ classGroupSubjectId: assignment.id }), params),
    303,
  );
});

teacherRoutes.get(ROUTES.teacher.rollCall.pattern, async (c) => {
  const classGroup = classGroupOr404(
    await teacherAssignments(c),
    c.req.param(ROUTE_PARAMS.classGroupId),
  );
  const date = dateOrNull(c.req.query(PARAMS.date)) ?? today();
  return render(c, TEMPLATES.teacher.rollCall, await rollCallScreen(c, classGroup, date, null));
});

teacherRoutes.post(ROUTES.teacher.rollCall.pattern, async (c) => {
  const classGroup = classGroupOr404(
    await teacherAssignments(c),
    c.req.param(ROUTE_PARAMS.classGroupId),
  );
  const body = c.get(CONTEXT_VARIABLES.body);
  const date = dateOrNull(field(body, FIELDS.date));
  if (date === null) throw new BusinessRuleViolation(DIAGNOSTICS.malformedRollCallDate);

  const networkId = currentNetwork(c);
  const enrollments = await academics.activeEnrollmentsOfClassGroup(
    networkId,
    classGroup.classGroupId,
  );
  const reported = new Map<string, { present: boolean; excuse: string }>();
  const rows = enrollments.map((enrollment) => {
    const present = checked(body, `${FIELDS.journal.present}${enrollment.id}`);
    const excuse = field(body, `${FIELDS.journal.excuse}${enrollment.id}`);
    reported.set(enrollment.id, { present, excuse });
    return { enrollmentId: enrollment.id, present, excuse: orNull(excuse) };
  });

  const result = await assessment.recordRollCall({
    networkId,
    classGroupId: classGroup.classGroupId,
    date,
    rows,
  });
  if (!result.ok) {
    const screen = await rollCallScreen(c, classGroup, date, {
      reported,
      problems: result.erros,
    });
    return render(c, TEMPLATES.teacher.rollCall, screen);
  }

  const params = {
    [PARAMS.date]: date,
    [PARAMS.ok]: NOTICES.rollCallRecorded(formatDate(date)),
  };
  return c.redirect(
    withParams(ROUTES.teacher.rollCall({ classGroupId: classGroup.classGroupId }), params),
    303,
  );
});

teacherRoutes.get(ROUTES.teacher.closing.pattern, async (c) => {
  const classGroup = classGroupOr404(
    await teacherAssignments(c),
    c.req.param(ROUTE_PARAMS.classGroupId),
  );
  const states = await assessment.closingState(currentNetwork(c), classGroup.classGroupId);
  return render(
    c,
    TEMPLATES.teacher.closing,
    closingScreen(classGroup, states, [], null),
  );
});

teacherRoutes.post(ROUTES.teacher.closing.pattern, async (c) => {
  const classGroup = classGroupOr404(
    await teacherAssignments(c),
    c.req.param(ROUTE_PARAMS.classGroupId),
  );
  const term = termOrNull(field(c.get(CONTEXT_VARIABLES.body), FIELDS.term));
  if (term === null) throw new BusinessRuleViolation(DIAGNOSTICS.termOnClosing);

  const networkId = currentNetwork(c);
  const result = await assessment.closeTerm({
    networkId,
    classGroupId: classGroup.classGroupId,
    term,
    closedBy: currentUser(c).id,
  });
  if (!result.ok) {
    const states = await assessment.closingState(networkId, classGroup.classGroupId);
    return render(
      c,
      TEMPLATES.teacher.closing,
      closingScreen(classGroup, states, result.erros, term),
    );
  }

  const params = { [PARAMS.ok]: NOTICES.termClosed(term, classGroup.classGroupName) };
  return c.redirect(
    withParams(ROUTES.teacher.closing({ classGroupId: classGroup.classGroupId }), params),
    303,
  );
});

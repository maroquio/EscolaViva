import { academics } from '../../academics';
import type { TermClosingState } from '../../assessment';
import type {
  ClosingState,
  GradeRow,
  GradesScreen,
  RollCallRow,
  RollCallScreen,
  TeacherClassGroup,
} from '@escolaviva/contracts/teacher';

export type TeacherAssignment = Awaited<
  ReturnType<typeof academics.teacherClassGroupSubjects>
>[number];

type EnrolledStudent = { id: string; studentName: string };

type RecordedPresence = { present: boolean; excuse: string | null };

const PRESENT_WHEN_NOTHING_WAS_RECORDED = true;

export function teacherClassGroupsAsJson(
  assignments: readonly TeacherAssignment[],
): TeacherClassGroup[] {
  const byClassGroup = new Map<string, TeacherClassGroup>();
  for (const assignment of assignments) {
    const subjects = byClassGroup.get(assignment.classGroupId)?.subjects ?? [];
    byClassGroup.set(assignment.classGroupId, {
      classGroupId: assignment.classGroupId,
      classGroupName: assignment.classGroupName,
      gradeLevel: assignment.gradeLevel,
      shift: assignment.shift,
      subjects: [...subjects, { id: assignment.id, subjectName: assignment.subjectName }],
    });
  }
  return [...byClassGroup.values()];
}

export const gradesScreenAsJson = (
  assignment: TeacherAssignment,
  term: number,
  closingStates: readonly TermClosingState[],
  enrollments: readonly EnrolledStudent[],
  grades: ReadonlyMap<string, number>,
): GradesScreen => ({
  assignment: {
    id: assignment.id,
    subjectName: assignment.subjectName,
    classGroupId: assignment.classGroupId,
    classGroupName: assignment.classGroupName,
  },
  term,
  closed: closingStates.some((state) => state.term === term && state.closed),
  rows: enrollments.map(
    (enrollment): GradeRow => ({
      enrollmentId: enrollment.id,
      studentName: enrollment.studentName,
      value: grades.get(enrollment.id) ?? null,
    }),
  ),
});

export const rollCallScreenAsJson = (
  date: string,
  enrollments: readonly EnrolledStudent[],
  recorded: ReadonlyMap<string, RecordedPresence>,
): RollCallScreen => ({
  date,
  rows: enrollments.map((enrollment): RollCallRow => {
    const saved = recorded.get(enrollment.id);
    return {
      enrollmentId: enrollment.id,
      studentName: enrollment.studentName,
      present: saved?.present ?? PRESENT_WHEN_NOTHING_WAS_RECORDED,
      excuse: saved?.excuse ?? null,
    };
  }),
});

export const closingStateAsJson = (state: TermClosingState): ClosingState => ({
  term: state.term,
  closed: state.closed,
  closedAt: state.closedAt,
});

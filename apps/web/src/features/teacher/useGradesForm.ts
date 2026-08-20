import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useEffect, type BaseSyntheticEvent } from 'react';
import { useFieldArray, useForm, type UseFormReset } from 'react-hook-form';
import type { ApplicationError } from '@escolaviva/contracts/errors';
import type { GradesScreen } from '@escolaviva/contracts/teacher';
import { ApiError, SERVER_REFUSAL, WHOLE_FORM, applyErrors } from '../../shared/api';
import { useNotices } from '../../shared/ui/notices';
import type { GradeRowOnScreen } from './GradeGrid';
import { GRADES_FIELD, gradesSaved } from './constants';
import { asGrade } from './grade';
import { usePostGrades } from './mutations';
import { gradesSchema, type GradesAsTyped, type GradesToPost } from './schemas';

const useRowsFromServer = (
  answer: GradesScreen | undefined,
  hasUnsavedTyping: boolean,
  fillTheGrid: UseFormReset<GradesAsTyped>,
): void => {
  useEffect(() => {
    if (answer === undefined || hasUnsavedTyping) return;
    fillTheGrid({
      grades: answer.rows.map((row) => ({
        enrollmentId: row.enrollmentId,
        studentName: row.studentName,
        value: row.value,
      })),
    });
  }, [answer, hasUnsavedTyping, fillTheGrid]);
};

export type GradesForm = {
  readonly rows: readonly GradeRowOnScreen[];
  readonly warning: string | undefined;
  readonly isPosting: boolean;
  readonly submit: (event: BaseSyntheticEvent) => void;
  readonly typeGrade: (index: number, typed: string) => void;
};

export function useGradesForm(
  classGroupSubjectId: string,
  term: number,
  answer: GradesScreen | undefined,
): GradesForm {
  const notices = useNotices();
  const post = usePostGrades(classGroupSubjectId);

  const {
    control,
    handleSubmit,
    setError,
    setValue,
    reset,
    formState: { errors, isDirty: hasUnsavedTyping },
  } = useForm<GradesAsTyped, unknown, GradesToPost>({
    resolver: standardSchemaResolver(gradesSchema),
    defaultValues: { grades: [] },
  });

  const { fields } = useFieldArray({ control, name: GRADES_FIELD.grades });

  useRowsFromServer(answer, hasUnsavedTyping, reset);

  const cellOfEnrollment = (enrollmentId: string): `grades.${number}.value` | null => {
    const row = fields.findIndex((field) => field.enrollmentId === enrollmentId);
    return row < 0 ? null : GRADES_FIELD.cell(row);
  };

  const showRefusal = (problem: ApplicationError): void => {
    const cell = problem.field === undefined ? null : cellOfEnrollment(problem.field);
    if (cell === null) {
      setError(WHOLE_FORM, { type: SERVER_REFUSAL, message: problem.message });
      return;
    }
    setError(cell, { type: SERVER_REFUSAL, message: problem.message });
  };

  const sendGrades = handleSubmit((values) => {
    post.mutate(
      {
        term,
        grades: values.grades.map((row) => ({
          enrollmentId: row.enrollmentId,
          value: row.value,
        })),
      },
      {
        onSuccess: (saved) => {
          notices.success(gradesSaved(saved.saved));
        },
        onError: (failure) => {
          if (!(failure instanceof ApiError)) {
            applyErrors(failure, setError, (message) => setError(WHOLE_FORM, { message }), []);
            return;
          }
          for (const problem of failure.errors) showRefusal(problem);
        },
      },
    );
  });

  return {
    rows: fields.map((field, index) => ({
      id: field.id,
      studentName: field.studentName,
      value: field.value,
      error: errors.grades?.[index]?.value?.message,
    })),
    warning: errors.root?.message,
    isPosting: post.isPending,
    submit: (event) => void sendGrades(event),
    typeGrade: (index, typed) =>
      setValue(GRADES_FIELD.cell(index), asGrade(typed), {
        shouldValidate: true,
        shouldDirty: true,
      }),
  };
}

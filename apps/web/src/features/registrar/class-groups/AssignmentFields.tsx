import { Alert, Button, Group, NativeSelect, Paper, Stack } from '@mantine/core';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import type { SimpleOption } from '@escolaviva/contracts/shared';
import { applyRefusal } from '../../../shared/api';
import { SUBJECT_LABEL, TEACHER_LABEL } from '../../../shared/labels/constants';
import {
  ALERT_ROLE,
  CANCEL_LABEL,
  FORM_WIDTH,
  QUIET_BUTTON,
  REFUSAL_COLOUR,
  SUBMIT_BUTTON,
} from '../../../shared/ui/constants';
import { useNotices } from '../../../shared/ui/notices';
import { REGISTRAR_NOTICES } from '../constants';
import { ASSIGNMENT_FIELD, ASSIGN_SUBJECT_LABEL, CLASS_GROUP_CHOICES } from './constants';
import { useAssignTeacher } from './mutations';
import { ASSIGNMENT_FIELDS, assignmentSchema, type AssignmentValues } from './schemas';

const NOTHING_CHOSEN = '';

const BLANK_ASSIGNMENT: AssignmentValues = {
  subjectId: NOTHING_CHOSEN,
  teacherUserId: NOTHING_CHOSEN,
};

type AssignmentFieldsProps = {
  readonly classGroupId: string;
  readonly classGroupRoute: string;
  readonly schoolName: string;
  readonly subjects: readonly SimpleOption[];
  readonly teachers: readonly SimpleOption[];
};

export function AssignmentFields({
  classGroupId,
  classGroupRoute,
  schoolName,
  subjects,
  teachers,
}: AssignmentFieldsProps): React.ReactElement {
  const navigate = useNavigate();
  const notices = useNotices();
  const assign = useAssignTeacher(classGroupId);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<AssignmentValues>({
    resolver: standardSchemaResolver(assignmentSchema),
    defaultValues: BLANK_ASSIGNMENT,
  });

  const warning = errors.root?.message;

  const submit = handleSubmit((values) => {
    assign.mutate(values, {
      onSuccess: () => {
        notices.success(REGISTRAR_NOTICES.subjectAssigned);
        void navigate(classGroupRoute);
      },
      onError: (failure) => {
        applyRefusal(failure, setError, ASSIGNMENT_FIELDS);
      },
    });
  });

  return (
    <Paper p="lg" withBorder maw={FORM_WIDTH}>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <Stack gap="md">
          {warning !== undefined && (
            <Alert color={REFUSAL_COLOUR} role={ALERT_ROLE}>
              {warning}
            </Alert>
          )}

          <NativeSelect
            label={SUBJECT_LABEL}
            withAsterisk
            data={[
              { value: NOTHING_CHOSEN, label: CLASS_GROUP_CHOICES.subject },
              ...subjects.map((subject) => ({ value: subject.id, label: subject.name })),
            ]}
            error={errors.subjectId?.message}
            {...register(ASSIGNMENT_FIELD.subjectId)}
          />

          <NativeSelect
            label={TEACHER_LABEL}
            withAsterisk
            description={`Professores de ${schoolName}.`}
            data={[
              { value: NOTHING_CHOSEN, label: CLASS_GROUP_CHOICES.teacher },
              ...teachers.map((teacher) => ({ value: teacher.id, label: teacher.name })),
            ]}
            error={errors.teacherUserId?.message}
            {...register(ASSIGNMENT_FIELD.teacherUserId)}
          />

          <Group>
            <Button type={SUBMIT_BUTTON} loading={assign.isPending}>
              {ASSIGN_SUBJECT_LABEL}
            </Button>
            <Button component={Link} to={classGroupRoute} variant={QUIET_BUTTON}>
              {CANCEL_LABEL}
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  );
}

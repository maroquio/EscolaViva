import { Button, Group, NativeSelect, Stack, Title } from '@mantine/core';
import {
  ALIGNED_AT_THE_BOTTOM,
  ON_A_SINGLE_LINE,
  QUIET_BUTTON,
  REFUSAL_COLOUR,
  SECONDARY_BUTTON,
} from '../../shared/ui/constants';
import {
  useFieldArray,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form';
import { ROLES } from '@escolaviva/contracts/enumerations';
import type { SchoolOption } from '@escolaviva/contracts/options';
import { ROLE_ASSIGNMENT_FIELD, ROLE_LABELS, SCHOOL_CHOICE, USER_FIELD } from './constants';
import { BLANK_ROLE_ASSIGNMENT, type UserValues } from './schemas';

const FIELDSET_WITHOUT_CHROME = { border: 0, padding: 0, margin: 0 };
const FILLS_THE_ROW = { flexGrow: 1 };

const ROLE_CHOICES = ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

const schoolChoices = (
  schoolOptions: readonly SchoolOption[],
  stillLoading: boolean,
): { value: string; label: string }[] => [
  {
    value: SCHOOL_CHOICE.none,
    label: stillLoading ? SCHOOL_CHOICE.stillLoading : SCHOOL_CHOICE.prompt,
  },
  ...schoolOptions.map((school) => ({ value: school.id, label: school.name })),
];

export type RoleAssignmentsProps = {
  readonly control: Control<UserValues>;
  readonly register: UseFormRegister<UserValues>;
  readonly errors: FieldErrors<UserValues>;
  readonly schoolOptions: readonly SchoolOption[] | undefined;
  readonly schoolOptionsArePending: boolean;
};

export function RoleAssignments({
  control,
  register,
  errors,
  schoolOptions,
  schoolOptionsArePending,
}: RoleAssignmentsProps): React.ReactElement {
  const { fields, append, remove } = useFieldArray({ control, name: USER_FIELD.roleAssignments });

  const schoolsToChooseFrom = schoolChoices(schoolOptions ?? [], schoolOptionsArePending);
  const theOnlyOneLeft = fields.length === 1;

  return (
    <fieldset style={FIELDSET_WITHOUT_CHROME}>
      <legend>
        <Title order={2} size="h4">
          Atribuições
        </Title>
      </legend>

      <Stack gap="sm" mt="sm">
        {fields.map((field, index) => (
          <Group key={field.id} align={ALIGNED_AT_THE_BOTTOM} wrap={ON_A_SINGLE_LINE}>
            <NativeSelect
              label={`Escola ${index + 1}`}
              disabled={schoolOptionsArePending}
              data={schoolsToChooseFrom}
              error={errors.roleAssignments?.[index]?.schoolId?.message}
              style={FILLS_THE_ROW}
              {...register(ROLE_ASSIGNMENT_FIELD.school(index))}
            />

            <NativeSelect
              label="Papel"
              data={ROLE_CHOICES}
              error={errors.roleAssignments?.[index]?.role?.message}
              style={FILLS_THE_ROW}
              {...register(ROLE_ASSIGNMENT_FIELD.role(index))}
            />

            <Button
              variant={QUIET_BUTTON}
              color={REFUSAL_COLOUR}
              onClick={() => remove(index)}
              disabled={theOnlyOneLeft}
              aria-label={`Remover a atribuição ${index + 1}`}
            >
              Remover
            </Button>
          </Group>
        ))}

        <Group>
          <Button variant={SECONDARY_BUTTON} onClick={() => append({ ...BLANK_ROLE_ASSIGNMENT })}>
            Adicionar atribuição
          </Button>
        </Group>
      </Stack>
    </fieldset>
  );
}

import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import type { BaseSyntheticEvent } from 'react';
import { useForm, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { REGISTRAR_ROUTES } from '../../../constants';
import { applyRefusal } from '../../../shared/api';
import { useNotices } from '../../../shared/ui/notices';
import { REGISTRAR_NOTICES } from '../constants';
import { DEFAULT_SHIFT } from './constants';
import { useRegisterClassGroup } from './mutations';
import { CLASS_GROUP_FIELDS, classGroupSchema, type ClassGroupValues } from './schemas';

export const NOTHING_CHOSEN = '';

const BLANK_CLASS_GROUP: ClassGroupValues = {
  name: NOTHING_CHOSEN,
  gradeLevel: NOTHING_CHOSEN,
  shift: DEFAULT_SHIFT,
  schoolId: NOTHING_CHOSEN,
  academicYearId: NOTHING_CHOSEN,
};

export type NewClassGroupForm = {
  readonly register: UseFormRegister<ClassGroupValues>;
  readonly errors: FieldErrors<ClassGroupValues>;
  readonly warning: string | undefined;
  readonly isCreating: boolean;
  readonly submit: (event: BaseSyntheticEvent) => void;
};

export function useClassGroupForm(): NewClassGroupForm {
  const navigate = useNavigate();
  const notices = useNotices();
  const create = useRegisterClassGroup();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ClassGroupValues>({
    resolver: standardSchemaResolver(classGroupSchema),
    defaultValues: BLANK_CLASS_GROUP,
  });

  const createClassGroup = handleSubmit((values) => {
    create.mutate(values, {
      onSuccess: () => {
        notices.success(REGISTRAR_NOTICES.classGroupCreated);
        void navigate(REGISTRAR_ROUTES.classGroups);
      },
      onError: (failure) => {
        applyRefusal(failure, setError, CLASS_GROUP_FIELDS);
      },
    });
  });

  return {
    register,
    errors,
    warning: errors.root?.message,
    isCreating: create.isPending,
    submit: (event) => void createClassGroup(event),
  };
}

import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import type { BaseSyntheticEvent } from 'react';
import { useForm, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { applyRefusal } from '../../../shared/api';
import { useNotices } from '../../../shared/ui/notices';
import { REGISTRAR_NOTICES } from '../constants';
import { useLinkGuardian } from '../mutations';
import { GUARDIAN_LINK_FIELDS, guardianLinkSchema, type GuardianLinkValues } from '../schemas';
import { studentRecordAddress } from './addresses';

const BLANK_LINK: GuardianLinkValues = {
  userId: '',
  relationship: '',
  financiallyResponsible: false,
};

export type NewGuardianLink = {
  readonly register: UseFormRegister<GuardianLinkValues>;
  readonly errors: FieldErrors<GuardianLinkValues>;
  readonly warning: string | undefined;
  readonly isLinking: boolean;
  readonly submit: (event: BaseSyntheticEvent) => void;
};

export function useGuardianLinkForm(studentId: string): NewGuardianLink {
  const navigate = useNavigate();
  const notices = useNotices();
  const link = useLinkGuardian(studentId);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<GuardianLinkValues>({
    resolver: standardSchemaResolver(guardianLinkSchema),
    defaultValues: BLANK_LINK,
  });

  const linkGuardian = handleSubmit((values) => {
    link.mutate(values, {
      onSuccess: () => {
        notices.success(REGISTRAR_NOTICES.guardianLinked);
        void navigate(studentRecordAddress(studentId));
      },
      onError: (failure) => {
        applyRefusal(failure, setError, GUARDIAN_LINK_FIELDS);
      },
    });
  });

  return {
    register,
    errors,
    warning: errors.root?.message,
    isLinking: link.isPending,
    submit: (event) => void linkGuardian(event),
  };
}

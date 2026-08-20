import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useState, type BaseSyntheticEvent } from 'react';
import { useForm, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import type { SessionUserAsJson } from '@escolaviva/contracts/session';
import { applyRefusal } from '../../../shared/api';
import { wasRepeated } from '../../network/mutations';
import { useSession } from '../../session/queries';
import { useInviteGuardian } from '../mutations';
import { GUARDIAN_FIELDS, guardianSchema, type GuardianValues } from '../schemas';
import type { GuardianInvitation } from './GuardianInvited';
import { INVITATION_KIND, REGISTRAR_ROLE } from './constants';

const NOTHING_TYPED = '';

const BLANK_GUARDIAN: GuardianValues = {
  name: NOTHING_TYPED,
  cpf: NOTHING_TYPED,
  email: NOTHING_TYPED,
  phone: NOTHING_TYPED,
  schoolId: NOTHING_TYPED,
};

export type SchoolChoice = { readonly id: string; readonly name: string };

const distinctSchoolsWhereRegistrarAnswers = (
  user: SessionUserAsJson | undefined,
): SchoolChoice[] => {
  const byId = new Map<string, string>(
    (user?.roles ?? [])
      .filter((assignment) => assignment.role === REGISTRAR_ROLE)
      .map((assignment) => [assignment.schoolId, assignment.schoolName]),
  );
  return [...byId].map(([id, name]) => ({ id, name }));
};

export type GuardianInvitationForm = {
  readonly invitation: GuardianInvitation | null;
  readonly register: UseFormRegister<GuardianValues>;
  readonly errors: FieldErrors<GuardianValues>;
  readonly warning: string | undefined;
  readonly schools: readonly SchoolChoice[];
  readonly mustChooseSchool: boolean;
  readonly isPending: boolean;
  readonly submit: (event: BaseSyntheticEvent) => void;
};

export function useGuardianInvitation(): GuardianInvitationForm {
  const [invitation, setInvitation] = useState<GuardianInvitation | null>(null);
  const { data: signedInUser } = useSession();
  const invite = useInviteGuardian();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<GuardianValues>({
    resolver: standardSchemaResolver(guardianSchema),
    defaultValues: BLANK_GUARDIAN,
  });

  const schools = distinctSchoolsWhereRegistrarAnswers(signedInUser);

  const inviteGuardian = handleSubmit((values) => {
    invite.mutate(values, {
      onSuccess: (answer) => {
        if (wasRepeated(answer)) {
          setInvitation({ kind: INVITATION_KIND.repeated });
          return;
        }
        setInvitation({
          kind: INVITATION_KIND.created,
          name: values.name,
          cpf: values.cpf,
          temporaryPassword: answer.temporaryPassword,
        });
      },
      onError: (failure) => {
        applyRefusal(failure, setError, GUARDIAN_FIELDS);
      },
    });
  });

  return {
    invitation,
    register,
    errors,
    warning: errors.root?.message,
    schools,
    mustChooseSchool: schools.length > 1,
    isPending: invite.isPending,
    submit: (event) => void inviteGuardian(event),
  };
}

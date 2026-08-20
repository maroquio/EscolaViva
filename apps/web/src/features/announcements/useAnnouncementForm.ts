import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import type { BaseSyntheticEvent } from 'react';
import {
  useForm,
  type Control,
  type FieldErrors,
  type UseFormRegisterReturn,
} from 'react-hook-form';
import { useNavigate } from 'react-router';
import { APP_ROUTES } from '../../constants';
import { applyRefusal } from '../../shared/api';
import { useNotices } from '../../shared/ui/notices';
import {
  ANNOUNCEMENT_FIELD,
  ANNOUNCEMENT_SENT,
  NO_SCHOOL,
  SCHOOL_AUDIENCE,
  SELECTED_AUDIENCE,
} from './constants';
import { usePublishAnnouncement } from './mutations';
import { useRecipients } from './queries';
import { ANNOUNCEMENT_FIELDS, announcementSchema, type AnnouncementValues } from './schemas';

const EMPTY_ANNOUNCEMENT: AnnouncementValues = {
  schoolId: NO_SCHOOL,
  title: '',
  body: '',
  audience: SCHOOL_AUDIENCE,
  recipients: [],
};

export type AnnouncementFormOnScreen = {
  readonly control: Control<AnnouncementValues>;
  readonly errors: FieldErrors<AnnouncementValues>;
  readonly unitField: UseFormRegisterReturn<'schoolId'>;
  readonly titleField: UseFormRegisterReturn<'title'>;
  readonly bodyField: UseFormRegisterReturn<'body'>;
  readonly onAudienceChosen: (chosenAudience: string) => void;
  readonly picksRecipients: boolean;
  readonly recipients: ReturnType<typeof useRecipients>;
  readonly noSchoolChosen: boolean;
  readonly warning: string | undefined;
  readonly isSending: boolean;
  readonly submit: (event: BaseSyntheticEvent) => void;
};

export function useAnnouncementForm(): AnnouncementFormOnScreen {
  const navigate = useNavigate();
  const notices = useNotices();
  const publish = usePublishAnnouncement();

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<AnnouncementValues>({
    resolver: standardSchemaResolver(announcementSchema),
    defaultValues: EMPTY_ANNOUNCEMENT,
  });

  const schoolId = watch(ANNOUNCEMENT_FIELD.schoolId);
  const audience = watch(ANNOUNCEMENT_FIELD.audience);
  const recipients = useRecipients(schoolId);

  const forgetSelection = (): void => setValue(ANNOUNCEMENT_FIELD.recipients, []);

  const sendAnnouncement = handleSubmit((values) => {
    publish.mutate(values, {
      onSuccess: () => {
        notices.success(ANNOUNCEMENT_SENT);
        void navigate(APP_ROUTES.announcements);
      },
      onError: (failure) => {
        applyRefusal(failure, setError, ANNOUNCEMENT_FIELDS);
      },
    });
  });

  return {
    control,
    errors,
    unitField: register(ANNOUNCEMENT_FIELD.schoolId, { onChange: forgetSelection }),
    titleField: register(ANNOUNCEMENT_FIELD.title),
    bodyField: register(ANNOUNCEMENT_FIELD.body),
    onAudienceChosen: (chosenAudience) => {
      if (chosenAudience === SCHOOL_AUDIENCE) forgetSelection();
    },
    picksRecipients: audience === SELECTED_AUDIENCE,
    recipients,
    noSchoolChosen: schoolId === NO_SCHOOL,
    warning: errors.root?.message,
    isSending: publish.isPending,
    submit: (event) => void sendAnnouncement(event),
  };
}

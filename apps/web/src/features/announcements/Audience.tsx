import { Checkbox, Radio, Stack, Text } from '@mantine/core';
import { Controller, type Control } from 'react-hook-form';
import { GUARDIANS_LABEL } from '../../shared/labels/constants';
import { LoadFailed } from '../../shared/ui/LoadFailed';
import { Loading } from '../../shared/ui/Loading';
import { MUTED_TEXT } from '../../shared/ui/constants';
import { SCHOOL_AUDIENCE, SELECTED_AUDIENCE } from './constants';
import type { useRecipients } from './queries';
import type { AnnouncementValues } from './schemas';

type AudienceChoiceProps = {
  readonly control: Control<AnnouncementValues>;
  readonly error: string | undefined;
  readonly onAudienceChosen: (chosenAudience: string) => void;
};

export function AudienceChoice({
  control,
  error,
  onAudienceChosen,
}: AudienceChoiceProps): React.ReactElement {
  return (
    <Controller
      control={control}
      name="audience"
      render={({ field }) => (
        <Radio.Group
          label="Quem recebe"
          withAsterisk
          value={field.value}
          onChange={(chosenAudience) => {
            field.onChange(chosenAudience);
            onAudienceChosen(chosenAudience);
          }}
          error={error}
        >
          <Stack gap="xs" mt="xs">
            <Radio value={SCHOOL_AUDIENCE} label="Toda a unidade" />
            <Radio value={SELECTED_AUDIENCE} label="Responsáveis selecionados" />
          </Stack>
        </Radio.Group>
      )}
    />
  );
}

type RecipientOptionsProps = {
  readonly recipients: ReturnType<typeof useRecipients>;
  readonly noSchoolChosen: boolean;
};

function RecipientOptions({
  recipients,
  noSchoolChosen,
}: RecipientOptionsProps): React.ReactElement {
  if (noSchoolChosen) {
    return (
      <Text size="sm" c={MUTED_TEXT}>
        Escolha a unidade para ver os responsáveis.
      </Text>
    );
  }
  if (recipients.isPending) return <Loading />;
  if (recipients.isError) return <LoadFailed error={recipients.error} />;
  if (recipients.data.length === 0) {
    return (
      <Text size="sm" c={MUTED_TEXT}>
        Nenhum responsável vinculado a alunos desta unidade.
      </Text>
    );
  }
  return (
    <>
      {recipients.data.map((guardian) => (
        <Checkbox key={guardian.id} value={guardian.id} label={guardian.name} />
      ))}
    </>
  );
}

type RecipientsFieldProps = RecipientOptionsProps & {
  readonly control: Control<AnnouncementValues>;
  readonly error: string | undefined;
};

export function RecipientsField({
  control,
  recipients,
  noSchoolChosen,
  error,
}: RecipientsFieldProps): React.ReactElement {
  return (
    <Controller
      control={control}
      name="recipients"
      render={({ field }) => (
        <Checkbox.Group
          label={GUARDIANS_LABEL}
          value={field.value}
          onChange={field.onChange}
          error={error}
        >
          <Stack gap="xs" mt="xs">
            <RecipientOptions recipients={recipients} noSchoolChosen={noSchoolChosen} />
          </Stack>
        </Checkbox.Group>
      )}
    />
  );
}

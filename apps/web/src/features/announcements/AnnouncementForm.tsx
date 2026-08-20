import { Alert, Button, Group, NativeSelect, Paper, Stack, TextInput, Textarea } from '@mantine/core';
import { Link } from 'react-router';
import { APP_ROUTES } from '../../constants';
import {
  ANNOUNCEMENTS_AREA,
  ANNOUNCEMENT_LABEL,
  CHOOSE,
  UNIT_LABEL,
} from '../../shared/labels/constants';
import { LoadFailed } from '../../shared/ui/LoadFailed';
import { Loading } from '../../shared/ui/Loading';
import { PageHeader } from '../../shared/ui/PageHeader';
import {
  ALERT_ROLE,
  CANCEL_LABEL,
  QUIET_BUTTON,
  REFUSAL_COLOUR,
  SUBMIT_BUTTON,
  WIDE_FORM_WIDTH,
} from '../../shared/ui/constants';
import { useSchoolOptions } from '../network/queries';
import { AudienceChoice, RecipientsField } from './Audience';
import { NO_SCHOOL } from './constants';
import { useAnnouncementForm } from './useAnnouncementForm';

export function AnnouncementForm(): React.ReactElement {
  const schools = useSchoolOptions();
  const form = useAnnouncementForm();

  if (schools.isPending) return <Loading />;
  if (schools.isError) {
    return <LoadFailed error={schools.error} onRetry={() => void schools.refetch()} />;
  }

  return (
    <>
      <PageHeader
        overline={ANNOUNCEMENTS_AREA}
        title="Novo comunicado"
        summary="O comunicado vai para o mural de quem responde pelos alunos da unidade. Escolha a unidade primeiro: é ela que define quem pode receber."
      />

      <Paper p="lg" withBorder maw={WIDE_FORM_WIDTH}>
        <form onSubmit={form.submit} noValidate>
          <Stack gap="md">
            {form.warning !== undefined && (
              <Alert color={REFUSAL_COLOUR} role={ALERT_ROLE}>
                {form.warning}
              </Alert>
            )}

            <NativeSelect
              label={UNIT_LABEL}
              withAsterisk
              data={[
                { value: NO_SCHOOL, label: CHOOSE.unit },
                ...schools.data.map((school) => ({ value: school.id, label: school.name })),
              ]}
              error={form.errors.schoolId?.message}
              {...form.unitField}
            />

            <TextInput
              label="Título"
              withAsterisk
              error={form.errors.title?.message}
              {...form.titleField}
            />

            <Textarea
              label={ANNOUNCEMENT_LABEL}
              withAsterisk
              autosize
              minRows={5}
              error={form.errors.body?.message}
              {...form.bodyField}
            />

            <AudienceChoice
              control={form.control}
              error={form.errors.audience?.message}
              onAudienceChosen={form.onAudienceChosen}
            />

            {form.picksRecipients && (
              <RecipientsField
                control={form.control}
                recipients={form.recipients}
                noSchoolChosen={form.noSchoolChosen}
                error={form.errors.recipients?.message}
              />
            )}

            <Group>
              <Button type={SUBMIT_BUTTON} loading={form.isSending}>
                Enviar comunicado
              </Button>
              <Button component={Link} to={APP_ROUTES.announcements} variant={QUIET_BUTTON}>
                {CANCEL_LABEL}
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>
    </>
  );
}

import { Alert, Button, Group, Paper, Stack } from '@mantine/core';
import { useParams, useSearchParams } from 'react-router';
import { APP_ROUTES } from '../../constants';
import {
  ATTENDANCE_LABEL,
  CLASS_GROUP_NOT_FOUND,
  NO_STUDENT_ENROLLED,
} from '../../shared/labels/constants';
import { Empty } from '../../shared/ui/Empty';
import { LoadFailed } from '../../shared/ui/LoadFailed';
import { Loading } from '../../shared/ui/Loading';
import { PageHeader } from '../../shared/ui/PageHeader';
import { ALERT_ROLE, REFUSAL_COLOUR, SUBMIT_BUTTON } from '../../shared/ui/constants';
import { AttendanceGrid } from './AttendanceGrid';
import { DayStepper } from './DayStepper';
import {
  BACK_TO_MY_CLASS_GROUPS,
  DAY_PARAM,
  NO_DAY_IN_THE_ADDRESS,
  TEACHER_OVERLINE,
  type IsoDay,
} from './constants';
import { isNotYours, useRollCall } from './queries';
import { useRollCallForm } from './useRollCallForm';

function NotYourClassGroup(): React.ReactElement {
  return (
    <>
      <PageHeader
        overline={TEACHER_OVERLINE}
        title={CLASS_GROUP_NOT_FOUND}
        summary="Esta turma não está entre as suas."
      />
      <Empty
        title="Nada a registrar aqui"
        text="Você não tem disciplina atribuída nesta turma."
        action={{ href: APP_ROUTES.teacher, text: BACK_TO_MY_CLASS_GROUPS }}
      />
    </>
  );
}

export function RollCall(): React.ReactElement {
  const { classGroupId = '' } = useParams();
  const [search, setSearch] = useSearchParams();
  const dayInTheAddress = search.get(DAY_PARAM) ?? NO_DAY_IN_THE_ADDRESS;
  const screen = useRollCall(classGroupId, dayInTheAddress);
  const form = useRollCallForm(classGroupId, dayInTheAddress, screen.data);

  const goToDay = (day: IsoDay): void => {
    const params = new URLSearchParams(search);
    params.set(DAY_PARAM, day);
    setSearch(params);
  };

  if (screen.isPending) return <Loading />;
  if (screen.isError) {
    if (isNotYours(screen.error)) return <NotYourClassGroup />;
    return <LoadFailed error={screen.error} onRetry={() => void screen.refetch()} />;
  }

  const { date: day } = screen.data;

  return (
    <>
      <PageHeader
        overline={TEACHER_OVERLINE}
        title={ATTENDANCE_LABEL}
        summary="A chamada começa com todos presentes: marque apenas quem faltou. A justificativa é opcional e vale para uma falta só."
      />

      <Stack gap="lg">
        <DayStepper day={day} onDayChosen={goToDay} />

        {form.rows.length === 0 ? (
          <Empty
            title={NO_STUDENT_ENROLLED}
            text="Não há matrículas ativas nesta turma, então não há chamada a fazer."
          />
        ) : (
          <Paper p="lg" withBorder>
            <form onSubmit={form.submit} noValidate>
              <Stack gap="md">
                {form.warning !== undefined && (
                  <Alert color={REFUSAL_COLOUR} role={ALERT_ROLE}>
                    {form.warning}
                  </Alert>
                )}

                <AttendanceGrid day={day} register={form.register} rows={form.rows} />

                <Group>
                  <Button type={SUBMIT_BUTTON} loading={form.isRecording}>
                    Registrar frequência
                  </Button>
                </Group>
              </Stack>
            </form>
          </Paper>
        )}
      </Stack>
    </>
  );
}

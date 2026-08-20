import { Alert, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { useParams } from 'react-router';
import { APP_ROUTES } from '../../constants';
import { NO_STUDENT_ENROLLED } from '../../shared/labels/constants';
import { Empty } from '../../shared/ui/Empty';
import { LoadFailed } from '../../shared/ui/LoadFailed';
import { Loading } from '../../shared/ui/Loading';
import { PageHeader } from '../../shared/ui/PageHeader';
import {
  ALERT_ROLE,
  CAUTION_COLOUR,
  MUTED_TEXT,
  REFUSAL_COLOUR,
  STATUS_ROLE,
  SUBMIT_BUTTON,
} from '../../shared/ui/constants';
import { GradeGrid } from './GradeGrid';
import { TermPicker } from './TermPicker';
import { BACK_TO_MY_CLASS_GROUPS, TEACHER_OVERLINE } from './constants';
import { isNotYours, useGrades } from './queries';
import { useGradesForm } from './useGradesForm';
import { useTerm } from './useTerm';

function NotYourSubject(): React.ReactElement {
  return (
    <>
      <PageHeader
        overline={TEACHER_OVERLINE}
        title="Disciplina não encontrada"
        summary="Esta disciplina não está entre as suas atribuições."
      />
      <Empty
        title="Nada a lançar aqui"
        text="Se você deveria dar aula nesta disciplina, peça à secretaria da escola que faça a atribuição."
        action={{ href: APP_ROUTES.teacher, text: BACK_TO_MY_CLASS_GROUPS }}
      />
    </>
  );
}

function ClosedTermNotice(): React.ReactElement {
  return (
    <Alert color={CAUTION_COLOUR} role={STATUS_ROLE} title="Bimestre fechado">
      Este bimestre já foi fechado e as notas não podem mais ser alteradas. Se algo precisa ser
      corrigido, fale com a secretaria da escola.
    </Alert>
  );
}

export function Grades(): React.ReactElement {
  const { classGroupSubjectId = '' } = useParams();
  const [term, chooseTerm] = useTerm();
  const screen = useGrades(classGroupSubjectId, term);
  const form = useGradesForm(classGroupSubjectId, term, screen.data);

  if (screen.isPending) return <Loading />;
  if (screen.isError) {
    if (isNotYours(screen.error)) return <NotYourSubject />;
    return <LoadFailed error={screen.error} onRetry={() => void screen.refetch()} />;
  }

  const { assignment, closed, rows } = screen.data;

  return (
    <>
      <PageHeader
        overline={`Docência · ${assignment.classGroupName}`}
        title={`Notas de ${assignment.subjectName}`}
        summary="Uma nota por aluno, de 0 a 10. Vírgula e ponto valem o mesmo; um campo em branco apaga a nota."
      />

      <Stack gap="lg">
        <TermPicker term={term} onTermChosen={chooseTerm} />

        {closed && <ClosedTermNotice />}

        {rows.length === 0 ? (
          <Empty
            title={NO_STUDENT_ENROLLED}
            text="Não há matrículas ativas nesta turma, então não há notas a lançar."
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

                <GradeGrid
                  rows={form.rows}
                  subjectName={assignment.subjectName}
                  term={term}
                  readOnly={closed}
                  onGradeTyped={form.typeGrade}
                />

                {!closed && (
                  <Group>
                    <Button type={SUBMIT_BUTTON} loading={form.isPosting}>
                      Lançar notas
                    </Button>
                    <Text size="sm" c={MUTED_TEXT}>
                      As notas são gravadas todas de uma vez.
                    </Text>
                  </Group>
                )}
              </Stack>
            </form>
          </Paper>
        )}
      </Stack>
    </>
  );
}

import { generatePath, useParams } from 'react-router';
import { REGISTRAR_ROUTES } from '../../../constants';
import { FIRST_PAGE } from '../../../shared/api';
import { Empty } from '../../../shared/ui/Empty';
import { LoadFailed } from '../../../shared/ui/LoadFailed';
import { Loading } from '../../../shared/ui/Loading';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { REGISTER_SUBJECT_LABEL } from '../subjects/constants';
import { AssignmentFields } from './AssignmentFields';
import {
  ASSIGN_SUBJECT_LABEL,
  BACK_TO_CLASS_GROUP_LABEL,
  CLASS_GROUP_OVERLINE,
  UNKNOWN_SCHOOL,
} from './constants';
import { useClassGroupRecord, useSubjectOptions, useTeacherOptions } from './queries';

export function AssignmentForm(): React.ReactElement {
  const { id = '' } = useParams();

  const record = useClassGroupRecord(id, FIRST_PAGE, FIRST_PAGE);
  const subjects = useSubjectOptions();
  const teachers = useTeacherOptions(record.data?.classGroup.schoolId ?? UNKNOWN_SCHOOL);

  if (record.isPending || subjects.isPending || teachers.isPending) return <Loading />;
  if (record.isError) return <LoadFailed error={record.error} onRetry={() => void record.refetch()} />;
  if (subjects.isError) {
    return <LoadFailed error={subjects.error} onRetry={() => void subjects.refetch()} />;
  }
  if (teachers.isError) {
    return <LoadFailed error={teachers.error} onRetry={() => void teachers.refetch()} />;
  }

  const { classGroup } = record.data;
  const classGroupRoute = generatePath(REGISTRAR_ROUTES.classGroup, { id });

  const header = (
    <PageHeader
      overline={CLASS_GROUP_OVERLINE}
      title={ASSIGN_SUBJECT_LABEL}
      summary={`A disciplina e o professor de ${classGroup.name}. É essa atribuição que faz a turma aparecer para o professor lançar frequência e notas.`}
    />
  );

  if (teachers.data.length === 0) {
    return (
      <>
        {header}
        <Empty
          title="Nenhum professor nesta escola"
          text={`Ninguém tem o papel de professor em ${classGroup.schoolName}. A administração da rede precisa atribuir o papel antes que a disciplina possa ter um responsável.`}
          action={{ href: classGroupRoute, text: BACK_TO_CLASS_GROUP_LABEL }}
        />
      </>
    );
  }

  if (subjects.data.length === 0) {
    return (
      <>
        {header}
        <Empty
          title="Nenhuma disciplina cadastrada"
          text="Cadastre a disciplina antes de atribuí-la a uma turma."
          action={{ href: REGISTRAR_ROUTES.newSubject, text: REGISTER_SUBJECT_LABEL }}
        />
      </>
    );
  }

  return (
    <>
      {header}
      <AssignmentFields
        classGroupId={id}
        classGroupRoute={classGroupRoute}
        schoolName={classGroup.schoolName}
        subjects={subjects.data}
        teachers={teachers.data}
      />
    </>
  );
}

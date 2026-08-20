import { Alert, Button, Group, NativeSelect, Paper, Stack, TextInput } from '@mantine/core';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { applyRefusal } from '../../../shared/api';
import { CHOOSE } from '../../../shared/labels/constants';
import { Empty } from '../../../shared/ui/Empty';
import { LoadFailed } from '../../../shared/ui/LoadFailed';
import { Loading } from '../../../shared/ui/Loading';
import { PageHeader } from '../../../shared/ui/PageHeader';
import {
  ALERT_ROLE,
  CANCEL_LABEL,
  FORM_WIDTH,
  QUIET_BUTTON,
  REFUSAL_COLOUR,
  SUBMIT_BUTTON,
} from '../../../shared/ui/constants';
import { useNotices } from '../../../shared/ui/notices';
import { REGISTRAR_NOTICES, TRANSFER_FIELD } from '../constants';
import { useTransfer } from '../mutations';
import { useTransferView } from '../queries';
import { TRANSFER_FIELDS, transferSchema, type TransferValues } from '../schemas';
import { CurrentEnrollmentCard } from './CurrentEnrollmentCard';
import { studentRecordAddress } from './addresses';
import { classGroupChoices, withPlaceholder } from './choices';
import { BACK_TO_RECORD_LABEL, ENROLLMENT_OVERLINE, TRANSFER_LABEL } from './constants';

const BLANK_TRANSFER: TransferValues = { targetClassGroupId: '', date: '' };

function NowhereToTransferTo({
  recordAddress,
}: {
  readonly recordAddress: string;
}): React.ReactElement {
  return (
    <Empty
      title="Nenhuma turma de destino"
      text="Não há outra turma para onde transferir dentro das unidades sob sua responsabilidade."
      action={{ href: recordAddress, text: BACK_TO_RECORD_LABEL }}
    />
  );
}

export function TransferForm(): React.ReactElement {
  const { id: enrollmentId = '' } = useParams();
  const navigate = useNavigate();
  const notices = useNotices();
  const transferView = useTransferView(enrollmentId);
  const transfer = useTransfer(enrollmentId);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<TransferValues>({
    resolver: standardSchemaResolver(transferSchema),
    defaultValues: BLANK_TRANSFER,
  });

  const submissionError = errors.root?.message;

  if (transferView.isPending) return <Loading />;
  if (transferView.isError) {
    return <LoadFailed error={transferView.error} onRetry={() => void transferView.refetch()} />;
  }

  const { enrollment, student, classGroups } = transferView.data;
  const recordAddress = studentRecordAddress(student.id);

  const submit = handleSubmit((values) => {
    transfer.mutate(values, {
      onSuccess: () => {
        notices.success(REGISTRAR_NOTICES.transferDone);
        void navigate(recordAddress);
      },
      onError: (failure) => {
        applyRefusal(failure, setError, TRANSFER_FIELDS);
      },
    });
  });

  return (
    <>
      <PageHeader
        overline={ENROLLMENT_OVERLINE}
        title="Transferir matrícula"
        summary="A transferência encerra a matrícula atual e abre outra na turma de destino, no mesmo ano letivo. O histórico guarda as duas."
      />

      <Stack gap="lg" maw={FORM_WIDTH}>
        <CurrentEnrollmentCard student={student} enrollment={enrollment} />

        {classGroups.length === 0 ? (
          <NowhereToTransferTo recordAddress={recordAddress} />
        ) : (
          <Paper p="lg" withBorder>
            <form onSubmit={(event) => void submit(event)} noValidate>
              <Stack gap="md">
                {submissionError !== undefined && (
                  <Alert color={REFUSAL_COLOUR} role={ALERT_ROLE}>
                    {submissionError}
                  </Alert>
                )}

                <NativeSelect
                  label="Turma de destino"
                  withAsterisk
                  data={withPlaceholder(
                    CHOOSE.targetClassGroup,
                    classGroupChoices(classGroups),
                  )}
                  error={errors.targetClassGroupId?.message}
                  {...register(TRANSFER_FIELD.targetClassGroupId)}
                />

                <TextInput
                  label="Data da transferência"
                  type="date"
                  withAsterisk
                  error={errors.date?.message}
                  {...register(TRANSFER_FIELD.date)}
                />

                <Group>
                  <Button type={SUBMIT_BUTTON} loading={transfer.isPending}>
                    {TRANSFER_LABEL}
                  </Button>
                  <Button component={Link} to={recordAddress} variant={QUIET_BUTTON}>
                    {CANCEL_LABEL}
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

import { Button, Card, Code, Group, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router';
import { REGISTRAR_ROUTES } from '../../../constants';
import { formatCpf } from '../../../shared/format';
import {
  CHANGE_PASSWORD_ON_FIRST_ACCESS,
  TEMPORARY_PASSWORD_WARNING,
  temporaryPasswordOf,
} from '../../../shared/labels/constants';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { FORM_WIDTH, STATUS_ROLE } from '../../../shared/ui/constants';
import { GUARDIAN_OVERLINE, INVITATION_KIND } from './constants';

export type GuardianInvitation =
  | {
      readonly kind: 'created';
      readonly name: string;
      readonly cpf: string;
      readonly temporaryPassword: string;
    }
  | { readonly kind: 'repeated' };

type TemporaryPasswordProps = {
  readonly name: string;
  readonly cpf: string;
  readonly temporaryPassword: string;
};

function TemporaryPassword({
  name,
  cpf,
  temporaryPassword,
}: TemporaryPasswordProps): React.ReactElement {
  return (
    <>
      <Title order={2}>{temporaryPasswordOf(name)}</Title>
      <Code fz="lg">{temporaryPassword}</Code>
      <Text>
        {TEMPORARY_PASSWORD_WARNING} Entregue-a pessoalmente ou por um canal que vocês já usem. Peça
        que a pessoa entre com o CPF <strong>{formatCpf(cpf)}</strong>{' '}
        {CHANGE_PASSWORD_ON_FIRST_ACCESS}
      </Text>
    </>
  );
}

function AlreadySent(): React.ReactElement {
  return (
    <>
      <Title order={2}>Este cadastro já havia sido enviado</Title>
      <Text>
        O responsável foi criado por um envio anterior deste mesmo formulário, e a senha provisória
        não pode mais ser exibida — ela nunca é guardada.
      </Text>
    </>
  );
}

export function GuardianInvited({
  invitation,
}: {
  readonly invitation: GuardianInvitation;
}): React.ReactElement {
  return (
    <>
      <PageHeader
        overline={GUARDIAN_OVERLINE}
        title="Responsável cadastrado"
        summary="O acesso foi criado. Vincule-o ao aluno na ficha dele para que o acompanhamento apareça no portal."
      />

      <Card withBorder maw={FORM_WIDTH} role={STATUS_ROLE}>
        <Stack gap="md">
          {invitation.kind === INVITATION_KIND.created ? (
            <TemporaryPassword
              name={invitation.name}
              cpf={invitation.cpf}
              temporaryPassword={invitation.temporaryPassword}
            />
          ) : (
            <AlreadySent />
          )}

          <Group>
            <Button component={Link} to={REGISTRAR_ROUTES.guardians}>
              Ver a lista de responsáveis
            </Button>
          </Group>
        </Stack>
      </Card>
    </>
  );
}

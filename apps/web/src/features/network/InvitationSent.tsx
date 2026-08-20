import { Button, Card, Code, Group, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router';
import type { AcceptedInvitation } from '@escolaviva/contracts/network';
import { NETWORK_ROUTES } from '../../constants';
import { formatCpf } from '../../shared/format';
import {
  CHANGE_PASSWORD_ON_FIRST_ACCESS,
  TEMPORARY_PASSWORD_WARNING,
  temporaryPasswordOf,
} from '../../shared/labels/constants';
import { PageHeader } from '../../shared/ui/PageHeader';
import { FORM_WIDTH, STATUS_ROLE } from '../../shared/ui/constants';
import { NETWORK_OVERLINES } from './constants';
import { wasRepeated, type Written } from './mutations';

type TemporaryPassword = string;

export type Invitee = {
  readonly name: string;
  readonly cpf: string;
};

export type InvitationSentProps = {
  readonly answer: Written<AcceptedInvitation>;
  readonly invitee: Invitee;
};

const TemporaryPasswordShownOnce = ({
  invitee,
  temporaryPassword,
}: {
  readonly invitee: Invitee;
  readonly temporaryPassword: TemporaryPassword;
}): React.ReactElement => (
  <>
    <Title order={2}>{temporaryPasswordOf(invitee.name)}</Title>
    <Code fz="lg">{temporaryPassword}</Code>
    <Text>
      {TEMPORARY_PASSWORD_WARNING} Entregue-a pessoalmente ou por um canal que vocês já usem — o
      envio automático por e-mail entra no Estágio 04. Peça que a pessoa entre com o CPF{' '}
      <strong>{formatCpf(invitee.cpf)}</strong> {CHANGE_PASSWORD_ON_FIRST_ACCESS}
    </Text>
  </>
);

const InvitationAlreadySent = (): React.ReactElement => (
  <>
    <Title order={2}>Este convite já havia sido enviado</Title>
    <Text>
      O usuário foi criado por um envio anterior deste mesmo formulário, e a senha provisória não
      pode mais ser exibida — ela nunca é guardada. Se ela se perdeu, a saída é criar um novo acesso
      ou pedir à pessoa que use o que já recebeu.
    </Text>
  </>
);

export function InvitationSent({ answer, invitee }: InvitationSentProps): React.ReactElement {
  return (
    <>
      <PageHeader
        overline={NETWORK_OVERLINES.users}
        title="Convite enviado"
        summary="O acesso foi criado. Confira abaixo o que precisa ser entregue à pessoa."
      />

      <Card withBorder maw={FORM_WIDTH} role={STATUS_ROLE}>
        <Stack gap="md">
          {wasRepeated(answer) ? (
            <InvitationAlreadySent />
          ) : (
            <TemporaryPasswordShownOnce
              invitee={invitee}
              temporaryPassword={answer.temporaryPassword}
            />
          )}

          <Group>
            <Button component={Link} to={NETWORK_ROUTES.users}>
              Ver a lista de usuários
            </Button>
          </Group>
        </Stack>
      </Card>
    </>
  );
}

import { Anchor, Button, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router';
import { APP_ROUTES } from '../constants';
import { ALERT_ROLE, BACK_TO_DASHBOARD_LABEL, SECONDARY_BUTTON } from '../shared/ui/constants';

export function NoPermission(): React.ReactElement {
  return (
    <Stack gap="md" role={ALERT_ROLE}>
      <Title order={1}>Acesso não permitido</Title>
      <Text>
        Sua conta não tem permissão para ver esta tela. Se você precisa desse acesso, fale com a
        administração da rede.
      </Text>
      <div>
        <Button component={Link} to={APP_ROUTES.root} variant={SECONDARY_BUTTON}>
          {BACK_TO_DASHBOARD_LABEL}
        </Button>
      </div>
      <Text size="sm">
        Está com a conta errada?{' '}
        <Anchor component={Link} to={APP_ROUTES.login}>
          Entrar novamente
        </Anchor>
      </Text>
    </Stack>
  );
}

import { Button, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router';
import { APP_ROUTES } from '../constants';
import { SECONDARY_BUTTON } from '../shared/ui/constants';

export function AccountWithoutRole(): React.ReactElement {
  return (
    <Stack gap="md">
      <Title order={1}>Conta sem unidade atribuída</Title>
      <Text>
        Sua conta existe, mas ainda não foi vinculada a nenhuma escola. Enquanto isso não acontecer,
        não há telas disponíveis. Peça à administração da rede que atribua uma unidade e um papel.
      </Text>
      <div>
        <Button component={Link} to={APP_ROUTES.accountPassword} variant={SECONDARY_BUTTON}>
          Trocar minha senha
        </Button>
      </div>
    </Stack>
  );
}

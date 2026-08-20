import { Button, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router';
import { APP_ROUTES } from '../../constants';
import { BACK_TO_DASHBOARD_LABEL, SECONDARY_BUTTON } from './constants';

export function NotFound(): React.ReactElement {
  return (
    <Stack gap="md">
      <Title order={1}>Página não encontrada</Title>
      <Text>
        O endereço acessado não existe nesta aplicação. Ele pode ter mudado, ou o link pode estar
        incompleto.
      </Text>
      <div>
        <Button component={Link} to={APP_ROUTES.root} variant={SECONDARY_BUTTON}>
          {BACK_TO_DASHBOARD_LABEL}
        </Button>
      </div>
    </Stack>
  );
}

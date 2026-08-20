import { Button, Code, Stack, Text, Title } from '@mantine/core';
import { Link, useRouteError } from 'react-router';
import { APP_ROUTES } from '../constants';
import { ApiError } from '../shared/api';
import {
  ALERT_ROLE,
  BACK_TO_DASHBOARD_LABEL,
  CORRELATION_ID_HINT,
  SECONDARY_BUTTON,
  UNEXPECTED_ERROR_TITLE,
} from '../shared/ui/constants';

const NO_CORRELATION_ID = '';

export function UnexpectedError(): React.ReactElement {
  const thrown: unknown = useRouteError();
  const correlationId = thrown instanceof ApiError ? thrown.correlationId : NO_CORRELATION_ID;

  return (
    <Stack gap="md" role={ALERT_ROLE}>
      <Title order={1}>{UNEXPECTED_ERROR_TITLE}</Title>
      <Text>
        Algo deu errado ao montar esta tela. A ocorrência foi registrada; tentar de novo costuma
        resolver.
      </Text>

      {correlationId !== NO_CORRELATION_ID && (
        <Text size="sm">
          {CORRELATION_ID_HINT} <Code>{correlationId}</Code>. Ele localiza exatamente esta
          ocorrência no registro do sistema.
        </Text>
      )}

      <div>
        <Button component={Link} to={APP_ROUTES.root} variant={SECONDARY_BUTTON}>
          {BACK_TO_DASHBOARD_LABEL}
        </Button>
      </div>
    </Stack>
  );
}

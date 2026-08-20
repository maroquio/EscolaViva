import { Alert, Button, Code, Group, Stack, Text } from '@mantine/core';
import { ApiError } from '../api';
import {
  ALERT_ROLE,
  CORRELATION_ID_HINT,
  REFUSAL_COLOUR,
  RETRY_LABEL,
  SECONDARY_BUTTON,
} from './constants';

const NOT_SHAPED_BY_THE_API = 'Não foi possível carregar esta tela.';
const NO_CORRELATION_ID = '';

export type LoadFailedProps = {
  readonly error: unknown;
  readonly onRetry?: () => void;
};

export function LoadFailed({ error, onRetry }: LoadFailedProps): React.ReactElement {
  const isRefusalFromTheApi = error instanceof ApiError;
  const message = isRefusalFromTheApi ? error.message : NOT_SHAPED_BY_THE_API;
  const correlationId = isRefusalFromTheApi ? error.correlationId : NO_CORRELATION_ID;

  return (
    <Alert color={REFUSAL_COLOUR} role={ALERT_ROLE} title="Não foi possível carregar">
      <Stack gap="sm">
        <Text>{message}</Text>

        {correlationId !== NO_CORRELATION_ID && (
          <Text size="sm">
            {CORRELATION_ID_HINT} <Code>{correlationId}</Code>
          </Text>
        )}

        {onRetry !== undefined && (
          <Group>
            <Button onClick={onRetry} variant={SECONDARY_BUTTON} size="xs">
              {RETRY_LABEL}
            </Button>
          </Group>
        )}
      </Stack>
    </Alert>
  );
}
